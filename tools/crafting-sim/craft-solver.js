/* 製作循環求解器 — 給配方與工匠數值，自動排出一串「做得完、品質盡量高」的技能
 *
 * 這支只做搜尋，規則一律問 craft-engine.js（**刻意不自己算任何公式**：兩套算法遲早
 * 各說各話，而畫面上完全看不出來）。在 node 下也載得起來，scripts/validate-craft-sim.mjs
 * 會拿它跑四套範本的情境當回歸。
 *
 * ── 為什麼是兩階段 ────────────────────────────────────────────────────
 * 單純的 beam search 會被「作業進度」帶著走：品質技能的報酬是延遲的（要先疊內靜），
 * 貪心的評分永遠選不到它們——第一版實測只解到 4297/12000。所以拆成：
 *   階段一（作業）：只用作業／增益／修復技能推進度，停在「還差一招就做得完」，
 *                   評分偏好剩下的耐久與 CP。
 *   階段二（品質）：從階段一的結尾接著堆品質，**每一步都試著補上收尾那一招**，
 *                   收尾成功就記成一組完整解。
 * 另一個關鍵：評分要把增益的剩餘步數算進去，否則永遠不會去點改革（花 18 CP、
 * 當下品質零成長，分數一定比不點差）。加上這條之後同一個配方 5422 → 7230。
 *
 * ── 刻意的取捨（不是 bug）────────────────────────────────────────────
 * 求解的產物是「貼進遊戲照著跑」的巨集，所以**只用結果不靠運氣的技能**：
 * 1. **成功率 <100% 的不排**（高速製作 50／倉促 60／冒進 60）。理想模式下它們必成功，
 *    排進去會解出一份「看起來很漂亮、實際常常炸掉」的循環。
 * 2. **吃球色的不排**（集中製作、集中加工、秘訣，以及只為了假造球色而存在的專心致志）。
 *    引擎在理想模式下**不擋** requiresGood（跟 Teamcraft 一樣，那是給人工排循環用的），
 *    所以這條得由求解器自己守——不守的話解出來的循環會滿是集中加工，
 *    實際跑時那幾步全部用不出來。
 * 3. 依理想模式求解（作業狀態恆為一般）。要吃球色的高難度配方請自己排。
 * 4. 總步數有上限（預設 30），因為超過就貼不進兩格巨集了。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CraftSolver = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var Engine = (typeof module === "object" && module.exports)
    ? require("./craft-engine.js")
    : (typeof self !== "undefined" ? self.CraftEngine : null);

  /* 一律不排的技能：
       observe／carefulObservation  只在盯球色時有用
       finalAppraisal               把「即將完成」擋下來，是高難度配方的保命技
       heartAndSoul                 它的唯一用途是把下一招當成高品質——而吃球色的
                                    技能本來就不排，留著它只會誘導出靠運氣的循環 */
  var SKIP = ["observe", "carefulObservation", "finalAppraisal", "heartAndSoul"];

  var DEFAULTS = {
    maxSteps: 30,      // 總步數上限（兩格巨集塞得下）
    beam: 48,          // 每層保留幾個候選
    endpoints: 8,      // 階段一挑幾個結尾去跑階段二
    phase1Depth: 16,   // 階段一最多幾步
    timeLimitMs: 25000,
  };
  /* beam 與 endpoints 是實測掃出來的：**endpoints 的影響遠大於 beam**。
     90 級那組配方在 endpoints≤5 時只解到 7162（輸給手解的範本 7400），
     加到 6 就跳到 8100——好的作業階段結尾排在第 6 名。加寬 beam 反而沒用。
     目前這組四套範本情境全部贏過手解值，單次 1～5 秒。 */

  /* 品質階段的「收尾組合」。每個候選節點都會拿這幾組各試一次再補上收尾的作業技能，
     完成的就記成一組解——**節點的分數就是這樣試出來的實際完成品質**，
     不是憑權重猜的。少了闊步＋比爾格這組，搜尋會在最後一步少掉快兩成品質。 */
  var CLOSERS = [
    [],
    ["byregotsBlessing"],
    ["greatStrides", "byregotsBlessing"],
    ["innovation", "greatStrides", "byregotsBlessing"],
  ];

  function clone(o) { var c = {}; for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }

  /* 一個狀態的指紋。同指紋的節點留一個就好——不去重的話 beam 會被
     「同樣結果、不同順序」的排列塞滿，等於白跑。 */
  function sig(res) {
    var b = res.buffs.map(function (x) { return x.buff + x.duration + "." + (x.stacks || 0); }).sort().join(",");
    return res.progress + "|" + res.quality + "|" + res.durability + "|" + res.cp + "|" + b;
  }

  function buffOf(res, key) {
    for (var i = 0; i < res.buffs.length; i++) if (res.buffs[i].buff === key) return res.buffs[i];
    return null;
  }
  function dur(res, key) { var b = buffOf(res, key); return b ? b.duration : 0; }
  function iqOf(res) { var b = buffOf(res, "innerQuiet"); return b ? b.stacks : 0; }

  /* ── 求解 ──────────────────────────────────────────────────────────
     cfg  { recipe, stats, startingQuality, actions }   actions＝craft-actions.json 的 data
     opts { onProgress(pct, label), onDone(result), maxSteps, beam, … }
     回傳 { cancel() }。onDone 拿到：
       { rotation, result, quality, steps, tried, ms }  或 { rotation:null, reason }
     不傳 onDone＝同步跑到底並直接回傳結果（node 的回歸驗證走這條）。 */
  function solve(cfg, opts) {
    opts = opts || {};
    var O = clone(DEFAULTS);
    for (var k in opts) if (opts.hasOwnProperty(k) && DEFAULTS[k] !== undefined) O[k] = opts[k];

    var recipe = cfg.recipe, stats = cfg.stats;
    var base = {
      recipe: recipe, stats: stats, linear: true,
      startingQuality: cfg.startingQuality || 0, rotation: [],
    };

    // 品質單位：拿它把「增益剩幾步」換算成可以跟品質相加的分數。
    // 用配方的目標品質推，才不會在低階配方上被增益權重壓垮。
    var qUnit = Math.max(40, Math.round(recipe.quality / 40));

    var pool = (cfg.actions || []).filter(function (a) {
      var f = a.flags || [];
      if (SKIP.indexOf(a.key) >= 0) return false;
      if (a.succ != null && a.succ < 100) return false;         // 只用必定成功的
      if (f.indexOf("requiresGood") >= 0) return false;         // 引擎在理想模式不擋，這裡要自己擋
      if (f.indexOf("needsExpedience") >= 0) return false;      // 前置是倉促成功，同樣靠運氣
      if (a.level > stats.level) return false;
      if (f.indexOf("specialist") >= 0 && !stats.specialist) return false;
      return true;
    });
    var keysOf = function (fn) { return pool.filter(fn).map(function (a) { return a.key; }); };

    var P1 = keysOf(function (a) {
      if (a.type === "quality") return false;
      // 純品質增益放到階段二再點，留在階段一只會過期
      return ["innovation", "greatStrides", "quickInnovation"].indexOf(a.key) < 0;
    });
    var P2 = keysOf(function (a) { return a.type !== "progress"; });
    var FIN = keysOf(function (a) { return a.type === "progress" || a.key === "delicateSynthesis"; });
    var have = {}; pool.forEach(function (a) { have[a.key] = 1; });
    var closers = CLOSERS.filter(function (c) {
      return c.every(function (k) { return have[k]; });
    });

    var tried = 0, t0 = Date.now(), cancelled = false;
    var best = null;   // { rot, res }

    function run(rot) { base.rotation = rot; tried++; return Engine.run(base); }

    // 最後一步沒真的用出去（等級不夠、CP 不足、條件不符…）＝這條路不算數
    function lastUsed(res, len) {
      var s = res.steps[len - 1];
      return s && !s.skipped;
    }

    /* 品質超過配方上限沒有任何好處（HQ 機率就是封頂在那裡），所以比較時先封頂再比。
       少了這一刀，低階配方會解出「品質 21300／目標 3360」的 17 步循環——
       多出來的九步只是讓巨集更長、更耗 CP，HQ 一樣是 100%。 */
    function qOf(res) { return Math.min(res.quality, recipe.quality); }

    function keep(rot, res) {
      if (res.status !== "done") return false;
      if (recipe.requiredQuality && res.quality < recipe.requiredQuality) return false;
      if (!best || qOf(res) > qOf(best.res) ||
          (qOf(res) === qOf(best.res) && rot.length < best.rot.length)) {
        best = { rot: rot.slice(), res: res };
      }
      return true;
    }

    /* 階段一評分：進度推得多、資源留得多、步數少。
       耐久權重高於 CP，因為品質階段最先卡住的是耐久。 */
    function score1(res, len) {
      return res.progress * 2 +
             res.durability * 6 + res.cp * 1.5 +
             dur(res, "manipulation") * 25 + (dur(res, "wasteNot") + dur(res, "wasteNotII")) * 20 +
             dur(res, "veneration") * 30 - len * 8;
    }

    /* 階段一結尾的挑選標準跟搜尋中不同：這裡看的是「留了多少本錢給品質階段」。
       崇敬的剩餘步數在這裡不加分——它撐不到品質階段結束。 */
    function scoreEnd(res, len) {
      return res.durability * 8 + res.cp * 2 - len * 10 +
             dur(res, "manipulation") * 20 + (dur(res, "wasteNot") + dur(res, "wasteNotII")) * 15;
    }

    /* 階段二的粗篩分數：只用來把候選縮到 2 倍 beam，真正的排名交給 closeOut() 實跑。
       少了後半段的增益項，改革／闊步／內靜在粗篩就被刷掉了——它們當下的品質成長是 0。 */
    function score2(res, len) {
      return res.quality +
             iqOf(res) * 1.8 * qUnit +
             dur(res, "innovation") * 1.1 * qUnit +
             dur(res, "greatStrides") * 1.4 * qUnit +
             (dur(res, "manipulation") + dur(res, "wasteNot") + dur(res, "wasteNotII")) * 0.35 * qUnit +
             res.durability * 1.2 + res.cp * 0.35 - len * 4;
    }

    // 試著在 rot 後面補一招收尾。回傳有沒有補成功（補成功就已記進 best）
    function tryFinish(rot) {
      var ok = false;
      for (var i = 0; i < FIN.length; i++) {
        var r2 = rot.concat(FIN[i]);
        if (r2.length > O.maxSteps) continue;
        var res = run(r2);
        if (!lastUsed(res, r2.length)) continue;
        if (keep(r2, res)) ok = true;
      }
      return ok;
    }

    /* 收尾試算：把每組收尾組合 × 每個作業技能都跑一次，回傳「這個節點實際做得出來的
       最高品質」。這就是階段二真正的評分——直接問引擎，不用權重猜。 */
    function closeOut(rot) {
      var top = -1;
      for (var c = 0; c < closers.length; c++) {
        var mid = rot.concat(closers[c]);
        if (mid.length + 1 > O.maxSteps) continue;
        if (closers[c].length) {
          var midRes = run(mid);
          // 收尾組合本身用不出來（CP 不夠、沒有內靜…）就不用再試作業技能了
          if (midRes.status === "failed") continue;
          var bad = false;
          for (var s = rot.length; s < mid.length; s++) if (midRes.steps[s].skipped) { bad = true; break; }
          if (bad) continue;
        }
        for (var i = 0; i < FIN.length; i++) {
          var r2 = mid.concat(FIN[i]);
          if (r2.length > O.maxSteps) continue;
          var res = run(r2);
          if (!lastUsed(res, r2.length)) continue;
          // 節點的分數同樣封頂：不封頂的話 beam 會一路追沒有用的超額品質
          if (keep(r2, res) && qOf(res) > top) top = qOf(res);
        }
      }
      return top;
    }

    /* 一層 beam：把 beam 裡每個節點各接一招，去重後依 scorer 排序。
       回傳全部候選（要留幾個由呼叫端決定，階段二會再做一次實跑排名）。 */
    function expand(beam, keys, scorer) {
      var seen = {}, next = [];
      for (var i = 0; i < beam.length; i++) {
        var node = beam[i];
        for (var j = 0; j < keys.length; j++) {
          var rot = node.rot.concat(keys[j]);
          if (rot.length > O.maxSteps) continue;
          var res = run(rot);
          if (!lastUsed(res, rot.length)) continue;
          if (res.status === "failed") continue;
          if (res.status === "done") { keep(rot, res); continue; }   // 提早做完＝也是一組解
          var s = sig(res);
          if (seen[s]) continue;
          seen[s] = 1;
          next.push({ rot: rot, res: res, score: scorer(res, rot.length) });
        }
      }
      next.sort(function (a, b) { return b.score - a.score; });
      return next;
    }

    /* 階段二的一層：粗篩留兩倍寬，再對每個候選實跑收尾，用**做得出來的品質**重排。
       只用粗篩分數會選錯——權重再怎麼調都比不上直接把收尾跑一次。 */
    function expandQuality(beam) {
      var cand = expand(beam, P2, score2).slice(0, O.beam * 2);
      for (var i = 0; i < cand.length; i++) {
        var q = closeOut(cand[i].rot);
        // 現在收不了尾的節點不丟掉（後面補一發精修可能就活了），但排在會收尾的後面。
        // 同分時用粗篩分數當平手判準（留著的增益與資源多的先走）。
        cand[i].score = q >= 0 ? q * 1e6 + cand[i].score : -1e9 + cand[i].score;
      }
      cand.sort(function (a, b) { return b.score - a.score; });
      return cand.slice(0, O.beam);
    }

    /* ── 排程：一個 tick 做一層，中間讓出主執行緒 ────────────────────
       不用 Worker：本站要能用 file:// 直接開檔驗收，而 file:// 下 Worker 被瀏覽器擋。 */
    var phase = 1, depth = 0, beam = [{ rot: [], res: run([]), score: 0 }];
    var endpoints = [];
    var epIndex = 0, epBeam = null, epDepth = 0;
    var totalUnits = O.phase1Depth + O.endpoints * (O.maxSteps > 20 ? 20 : O.maxSteps);
    var doneUnits = 0;

    // 空循環本身就是一個合法的起點：低階配方一招就做得完，
    // 而且工匠的神速技巧／閒靜只能當第一招，沒有這個起點就永遠試不到。
    endpoints.push({ rot: [], res: beam[0].res, score: 0 });
    tryFinish([]);

    function tick() {
      if (cancelled) return finish("cancelled");
      if (Date.now() - t0 > O.timeLimitMs) return finish("timeout");

      if (phase === 1) {
        depth++;
        beam = expand(beam, P1, score1).slice(0, O.beam);
        // 只對前段候選試收尾——這是階段一唯一花錢的地方，全試會慢一倍
        var probe = Math.min(beam.length, 12);
        for (var i = 0; i < probe; i++) {
          if (tryFinish(beam[i].rot)) {
            endpoints.push({ rot: beam[i].rot, res: beam[i].res, score: scoreEnd(beam[i].res, beam[i].rot.length) });
          }
        }
        doneUnits++;
        if (!beam.length || depth >= O.phase1Depth) {
          endpoints.sort(function (a, b) { return b.score - a.score; });
          // 空循環永遠留著（見上面）
          var head = endpoints.filter(function (e) { return e.rot.length === 0; }).slice(0, 1);
          var rest = endpoints.filter(function (e) { return e.rot.length > 0; }).slice(0, O.endpoints - 1);
          endpoints = head.concat(rest);
          doneUnits = O.phase1Depth;
          phase = 2;
        }
        return schedule("階段一：推作業進度（第 " + depth + " 層）");
      }

      // 階段二
      if (epBeam === null) {
        if (epIndex >= endpoints.length) return finish("done");
        epBeam = [{ rot: endpoints[epIndex].rot, res: endpoints[epIndex].res, score: 0 }];
        epDepth = 0;
      }
      epDepth++;
      epBeam = expandQuality(epBeam);
      doneUnits++;
      /* 這條路已經頂到配方的品質上限就不用再往下挖了：更深＝更長，而同分時我們要短的。
         換下一個結尾說不定能用更少步數達到同樣的上限。 */
      var atCap = best && Math.min(best.res.quality, recipe.quality) >= recipe.quality;
      if (!epBeam.length || atCap || endpoints[epIndex].rot.length + epDepth >= O.maxSteps - 1) {
        epIndex++;
        epBeam = null;
      }
      return schedule("階段二：堆品質（第 " + epIndex + " / " + endpoints.length + " 條，第 " + epDepth + " 層）");
    }

    function schedule(label) {
      var pct = Math.min(99, Math.round((doneUnits / totalUnits) * 100));
      if (opts.onProgress) opts.onProgress(pct, label, tried);
      if (opts.onDone) setTimeout(tick, 0);
    }

    function finish(reason) {
      var out = best
        ? { rotation: best.rot, result: best.res, quality: best.res.quality,
            steps: best.rot.length, tried: tried, ms: Date.now() - t0, reason: reason }
        : { rotation: null, result: null, tried: tried, ms: Date.now() - t0, reason: reason };
      if (opts.onProgress) opts.onProgress(100, "完成", tried);
      if (opts.onDone) opts.onDone(out);
      return out;
    }

    // 同步模式（node 回歸驗證）：一路跑到底
    if (!opts.onDone) {
      var guard = 0;
      while (!cancelled && guard++ < 10000) {
        if (phase === 2 && epIndex >= endpoints.length && epBeam === null) break;
        if (Date.now() - t0 > O.timeLimitMs) break;
        tick();
      }
      return finish(cancelled ? "cancelled" : "done");
    }

    setTimeout(tick, 0);
    return { cancel: function () { cancelled = true; } };
  }

  return { solve: solve, DEFAULTS: DEFAULTS };
});
