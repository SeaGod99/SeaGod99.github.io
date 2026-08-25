/* 製作模擬引擎 — FFXIV 製作技能循環的規則實作（純計算，無 DOM）
 *
 * 這支只做「給一串技能，算出每一步發生什麼」。畫面在 crafting-sim.js。
 * 在 node 下也載得起來（結尾有 module.exports），scripts/validate-craft-sim.mjs
 * 拿 Teamcraft 官方測試案例的期望值回歸驗這支。
 *
 * ── 規則來源 ───────────────────────────────────────────────────────────
 * 遊戲客戶端沒有把「技能效率、增益倍率、狀態機率」寫進可讀的 sheet，全世界的
 * 模擬器都是社群逆向出來的常數。本檔的公式與旗標移植自 Teamcraft 模擬器
 * （MIT License, Copyright (c) 2019 Flavien Normand，github.com/ffxiv-teamcraft/simulator），
 * 技能的 CP／解鎖等級另以 XIVAPI 校驗（見 scripts/build-craft-sim.mjs）。
 *
 * ── 刻意與 Teamcraft 不同的兩處（都寫在這裡，別當成 bug 修掉）─────────────
 * 1. 隨機模式會真的擲作業狀態。Teamcraft 的 run() 每步都把狀態重設成「一般」，
 *    除非呼叫端逐步指定；那對「重播一場已發生的製作」是對的，對「預估這套循環
 *    會不會成功」則會讓高品質／最高品質永遠不出現。本引擎在 linear=false 時
 *    以 tickState 的結果進位到下一步，跟實際遊戲一致。
 * 2. 不消耗作業時間的三個技能（最終確認、專心致志、快速改革——官方說明都寫
 *    「使用本技能不會消耗一次作業時間」）不推進作業狀態。Teamcraft 只排除了
 *    最終確認。設計變動照樣推進，因為它的效果就是「變更一次作業狀態」。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CraftEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ── 作業狀態（球色）──────────────────────────────────────────────────
     名稱只採用「查得到台服官方字串」的：高品質／最高品質出自技能說明，
     結實／安定／高效／長持續／大進展出自道具說明（素材奇跡）。
     其餘四種台服字串查不到 → 依專案鐵則不硬翻，改用效果描述當標籤，
     並以 official:false 標記，前端會加註。 */
  var ST = {
    NONE: 0, NORMAL: 1, GOOD: 2, EXCELLENT: 3, POOR: 4,
    CENTERED: 5, STURDY: 6, PLIANT: 7, MALLEABLE: 8, PRIMED: 9,
    GOOD_OMEN: 10, ROBUST: 11,
  };

  var CONDITIONS = {
    1:  { key: "normal",    name: "一般",       official: false, tone: "normal", desc: "沒有加成" },
    2:  { key: "good",      name: "高品質",     official: true,  tone: "good",   desc: "加工系效率 ×1.5（名匠工具 ×1.75）" },
    3:  { key: "excellent", name: "最高品質",   official: true,  tone: "great",  desc: "加工系效率 ×4，下一次必定品質下降" },
    4:  { key: "poor",      name: "品質下降",   official: false, tone: "bad",    desc: "加工系效率 ×0.5" },
    5:  { key: "centered",  name: "安定",       official: true,  tone: "good",   desc: "成功率 +25%" },
    6:  { key: "sturdy",    name: "結實",       official: true,  tone: "good",   desc: "耐久消耗 −50%" },
    7:  { key: "pliant",    name: "高效",       official: true,  tone: "good",   desc: "CP 消耗 −50%" },
    8:  { key: "malleable", name: "大進展",     official: true,  tone: "good",   desc: "作業系效率 ×1.5" },
    9:  { key: "primed",    name: "長持續",     official: true,  tone: "good",   desc: "下一個增益效果 +2 次作業" },
    10: { key: "goodOmen",  name: "下次高品質", official: false, tone: "good",   desc: "下一次必定為高品質" },
    11: { key: "robust",    name: "耐久強固",   official: false, tone: "good",   desc: "耐久消耗 −50%，下一次為結實" },
  };

  /* 增益。名稱同樣只用查得到的台服官方字串：技能名即增益名，
     內靜與工匠的良機出自技能說明。 */
  var BUFFS = {
    innerQuiet:        { name: "內靜", stacksMax: 10 },
    wasteNot:          { name: "儉約" },
    wasteNotII:        { name: "長期儉約" },
    manipulation:      { name: "掌握" },
    greatStrides:      { name: "闊步" },
    innovation:        { name: "改革" },
    veneration:        { name: "崇敬" },
    muscleMemory:      { name: "堅信" },
    finalAppraisal:    { name: "最終確認" },
    heartAndSoul:      { name: "專心致志" },
    expedience:        { name: "工匠的良機" },
    trainedPerfection: { name: "工匠的絕技" },
  };

  var actionsByKey = {};   // key → 技能定義（build-craft-sim.mjs 產的那份）
  var levelTable = {};     // 工匠等級 → rlvl
  var hqTable = [];        // 品質% → HQ%

  function init(db) {
    actionsByKey = {};
    (db.data || []).forEach(function (a) { actionsByKey[a.key] = a; });
    levelTable = db.levelTable || {};
    hqTable = db.hqTable || [];
    return api;
  }

  /* ── 小工具 ───────────────────────────────────────────────────────── */

  var fround = Math.fround || function (x) { return x; };

  // 工匠等級對應的 rlvl。51 級以上查表，50 級以下等值。
  function rlvlOf(level) {
    return levelTable[level] != null ? levelTable[level] : level;
  }

  function hasBuff(S, b) { return !!getBuff(S, b); }

  function getBuff(S, b) {
    for (var i = 0; i < S.buffs.length; i++) if (S.buffs[i].buff === b) return S.buffs[i];
    return null;
  }

  function removeBuff(S, b) {
    S.buffs = S.buffs.filter(function (x) { return x.buff !== b; });
  }

  function addBuff(S, b, duration, stacks) {
    removeBuff(S, b);
    // 長持續：下一個增益多兩次作業
    var d = (S.state === ST.PRIMED && duration !== Infinity) ? duration + 2 : duration;
    S.buffs.push({ buff: b, duration: d, stacks: stacks || 0, appliedStep: S.steps.length });
  }

  function addInnerQuiet(S, n) {
    var iq = getBuff(S, "innerQuiet");
    if (!iq) S.buffs.push({ buff: "innerQuiet", duration: Infinity, stacks: Math.min(n, 10), appliedStep: S.steps.length });
    else iq.stacks = Math.min(iq.stacks + n, 10);
  }

  function iqStacks(S) { var iq = getBuff(S, "innerQuiet"); return iq ? iq.stacks : 0; }

  function repair(S, amount) {
    S.durability = Math.min(S.durability + amount, S.recipe.durability);
  }

  /* ── 基礎進度／品質（等級低於配方時吃 modifier 懲罰）────────────────── */

  function baseProgression(S) {
    var base = (S.stats.craftsmanship * 10) / S.recipe.progressDivider + 2;
    if (rlvlOf(S.stats.level) <= S.recipe.rlvl) {
      return fround(base * (S.recipe.progressModifier || 100) * fround(0.01));
    }
    return Math.floor(base);
  }

  function baseQuality(S) {
    var base = (S.stats.control * 10) / S.recipe.qualityDivider + 35;
    if (rlvlOf(S.stats.level) <= S.recipe.rlvl) {
      return fround(base * (S.recipe.qualityModifier || 100) * fround(0.01));
    }
    return Math.floor(base);
  }

  /* ── 技能屬性（會隨等級／連段／增益變動的那些）────────────────────── */

  function potency(S, a, which) {
    var eff = (which === "progress" && a.effProgress) ? a.effProgress : a.eff;
    if (!eff) return 0;
    var p = (eff.at && S.stats.level >= eff.at) ? eff.up : eff.base;
    if (a.key === "byregotsBlessing") p = Math.min(100 + iqStacks(S) * 20, 300);
    if (a.key === "groundwork") {
      // 耐久不足時效率減半。工匠的絕技（下一次不消耗耐久）在場時不減半。
      if (!hasBuff(S, "trainedPerfection") && S.durability < durabilityCost(S, a)) p = p / 2;
    }
    return p;
  }

  // 連段是否成立：往前找到第一個「沒被跳過」的步驟來判斷
  function comboFrom(S, keys, requireCombo) {
    for (var i = S.steps.length - 1; i >= 0; i--) {
      var st = S.steps[i];
      if (keys.indexOf(st.key) >= 0 && st.success !== false && (!requireCombo || st.combo)) return true;
      if (!st.skipped) return false;
    }
    return false;
  }

  function hasCombo(S, a) {
    var f = a.flags || [];
    if (f.indexOf("comboBasicTouch") >= 0) return comboFrom(S, ["basicTouch"]);
    if (f.indexOf("comboBasicTouchIq") >= 0) return comboFrom(S, ["basicTouch"]);
    // 上級加工：接在「有連到的中級加工」或「觀察」之後才有折扣
    if (f.indexOf("comboStandardTouch") >= 0) {
      for (var i = S.steps.length - 1; i >= 0; i--) {
        var st = S.steps[i];
        if (st.key === "observe") return true;
        if (st.key === "standardTouch" && st.success !== false && st.combo) return true;
        if (!st.skipped) return false;
      }
      return false;
    }
    if (f.indexOf("needsExpedience") >= 0) return hasBuff(S, "expedience");
    return false;
  }

  function baseCpCost(S, a) {
    if (a.comboCp != null && hasCombo(S, a)) return a.comboCp;
    return a.cp;
  }

  function cpCost(S, a) {
    var c = baseCpCost(S, a);
    return S.state === ST.PLIANT ? Math.ceil(c / 2) : c;   // 高效：CP 減半
  }

  function durabilityCost(S, a) {
    if (!a.dur) return 0;
    var divider = 1;
    if (hasBuff(S, "wasteNot") || hasBuff(S, "wasteNotII")) divider *= 2;
    if (S.state === ST.STURDY || S.state === ST.ROBUST) divider *= 2;
    return Math.ceil(a.dur / divider);
  }

  function successRate(S, a) {
    var base = a.succ != null ? a.succ : 100;
    if (S.state === ST.CENTERED) base += 25;   // 安定：成功率 +25
    return Math.min(base, 100);
  }

  /* ── 可否使用 ─────────────────────────────────────────────────────── */

  function firstStep(S) {
    // 「不消耗一次作業時間」的技能不算一步，所以堅信／閒靜還能開頭用
    return S.steps.filter(function (s) { return !s.noTick; }).length === 0;
  }

  function usedBefore(S, key) {
    return S.steps.some(function (s) { return s.key === key && !s.skipped; });
  }

  // 回傳 null = 可用；否則回傳不可用的原因（繁中，直接給畫面顯示）
  function whyNotUsable(S, a, linear) {
    var f = a.flags || [];
    if (S.stats.level < a.level) return "等級不足（需 " + a.level + " 級）";
    if (f.indexOf("specialist") >= 0 && !S.stats.specialist) return "需要專家";
    if (f.indexOf("onceOnly") >= 0 && usedBefore(S, a.key)) return "一次製作只能用一次";
    if (f.indexOf("firstStep") >= 0 && !firstStep(S)) return "只能在第一步使用";
    if (f.indexOf("notExpert") >= 0 && S.recipe.expert) return "高難度配方不可使用";
    if (f.indexOf("levelDiff10") >= 0 && S.stats.level - S.recipe.lvl < 10) {
      return "配方等級要低 10 級以上";
    }
    if (f.indexOf("noWasteNot") >= 0 && (hasBuff(S, "wasteNot") || hasBuff(S, "wasteNotII"))) {
      return "儉約／長期儉約期間不可使用";
    }
    if (f.indexOf("needsInnerQuiet") >= 0 && iqStacks(S) < 1) return "需要內靜";
    if (f.indexOf("needsInnerQuiet10") >= 0 && iqStacks(S) !== 10) return "需要內靜 10 階";
    if (f.indexOf("needsExpedience") >= 0 && !hasBuff(S, "expedience")) return "需要工匠的良機（倉促成功後）";
    if (f.indexOf("requiresGood") >= 0 && !linear) {
      if (!hasBuff(S, "heartAndSoul") && S.state !== ST.GOOD && S.state !== ST.EXCELLENT) {
        return "只能在高品質以上的狀態使用";
      }
    }
    return null;
  }

  /* ── 執行單一技能 ─────────────────────────────────────────────────── */

  function execProgress(S, a) {
    var buffMod = 1, condMod = 1;
    if (S.state === ST.MALLEABLE) condMod *= 1.5;
    if (hasBuff(S, "muscleMemory")) { buffMod += 1; removeBuff(S, "muscleMemory"); }
    if (hasBuff(S, "veneration")) buffMod += 0.5;
    var eff = potency(S, a, "progress") * buffMod;
    S.progress += Math.floor((Math.floor(baseProgression(S)) * condMod * eff) / 100);
    if (hasBuff(S, "finalAppraisal") && S.progress >= S.recipe.progress) {
      S.progress = Math.min(S.progress, S.recipe.progress - 1);
      removeBuff(S, "finalAppraisal");
    }
  }

  function execQuality(S, a) {
    var buffMod = 1, condMod = 1;
    if (S.state === ST.EXCELLENT) condMod *= 4;
    else if (S.state === ST.POOR) condMod *= 0.5;
    else if (S.state === ST.GOOD) condMod *= S.stats.relicTool ? 1.75 : 1.5;
    var iq = iqStacks(S);
    var mult = 1;
    if (hasBuff(S, "greatStrides")) { mult += 1; removeBuff(S, "greatStrides"); }
    if (hasBuff(S, "innovation")) mult += 0.5;
    buffMod = (buffMod * mult * (100 + iq * 10)) / 100;
    var eff = fround(potency(S, a, "quality") * buffMod);
    S.quality += Math.floor((Math.floor(baseQuality(S)) * condMod * eff) / 100);
    if (S.stats.level >= 11) addInnerQuiet(S, 1);
  }

  function execute(S, a) {
    var f = a.flags || [];
    var key = a.key;

    if (key === "trainedEye") { S.quality = S.recipe.quality; return; }
    if (key === "mastersMend") { repair(S, 30); return; }
    if (key === "immaculateMend") { S.durability = S.recipe.durability; return; }
    if (key === "observe") return;
    if (key === "carefulObservation") return;                 // 效果＝重擲狀態，見 run()
    if (key === "tricksOfTheTrade") {
      if (hasBuff(S, "heartAndSoul") || S.state === ST.GOOD || S.state === ST.EXCELLENT) {
        S.cp = Math.min(S.cp + 20, S.maxCp);
      }
      return;
    }
    if (key === "trainedPerfection") { addBuff(S, "trainedPerfection", Infinity); return; }
    if (key === "heartAndSoul") { addBuff(S, "heartAndSoul", Infinity); return; }
    if (key === "quickInnovation") { addBuff(S, "innovation", 1); return; }

    if (a.type === "buff" || a.type === "repair") {           // 崇敬／改革／闊步／掌握…
      if (key === "wasteNot") removeBuff(S, "wasteNotII");
      if (key === "wasteNotII") removeBuff(S, "wasteNot");
      addBuff(S, key, a.duration);
      return;
    }

    if (key === "delicateSynthesis") {                        // 精密製作：作業＋加工各一次
      execProgress(S, a);
      execQuality(S, a);
      return;
    }

    if (a.type === "progress") {
      execProgress(S, a);
      if (key === "muscleMemory") addBuff(S, "muscleMemory", 5);
      return;
    }

    if (a.type === "quality") {
      var comboOk = f.indexOf("comboBasicTouchIq") >= 0 ? hasCombo(S, a) : false;
      execQuality(S, a);
      if (f.indexOf("extraInnerQuiet") >= 0) addInnerQuiet(S, 1);   // 集中加工／閒靜／坯料加工
      if (f.indexOf("consumesInnerQuiet") >= 0) removeBuff(S, "innerQuiet");
      if (comboOk) addInnerQuiet(S, 1);                             // 精煉加工接加工
      if (f.indexOf("grantsExpedience") >= 0 && S.stats.level >= 96) addBuff(S, "expedience", 1);
      return;
    }
  }

  function onFail(S, a) {
    // 目前沒有技能有「失敗時的額外效果」，倉促／冒進失敗就只是白花耐久
  }

  /* ── 增益的每步結算 ───────────────────────────────────────────────── */

  // 專心致志會被這三個技能吃掉（官方說明：使用集中加工、集中製作或秘訣後效果結束）
  var HEART_CONSUMERS = ["preciseTouch", "intensiveSynthesis", "tricksOfTheTrade"];

  function tickBuffs(S, action) {
    S.buffs.forEach(function (b) {
      if (b.appliedStep < S.steps.length) {
        if (b.buff === "manipulation") repair(S, 5);
        if (b.buff === "heartAndSoul" && action && HEART_CONSUMERS.indexOf(action.key) >= 0
            && S.state !== ST.GOOD && S.state !== ST.EXCELLENT) {
          b.duration = 0;   // 在非高品質狀態下被用掉
        }
        if (b.duration !== Infinity) b.duration--;
      }
    });
    S.buffs = S.buffs.filter(function (b) { return b.duration > 0; });
  }

  /* ── 作業狀態的轉移 ───────────────────────────────────────────────── */

  function possibleConditions(flag) {
    var out = [];
    var bits = (flag || 15).toString(2).split("").reverse();
    for (var i = 0; i < bits.length; i++) if (bits[i] === "1") out.push(i + 1);
    return out;
  }

  function nextState(S, rnd) {
    if (S.state === ST.EXCELLENT) return ST.POOR;
    if (S.state === ST.GOOD_OMEN) return ST.GOOD;
    if (S.state === ST.ROBUST) return ST.STURDY;

    var goodChance = S.stats.level >= 63 ? 0.25 : 0.2;   // 63 級特性「工匠的眼力」
    var pool = [], total = 0;
    S.possibleConditions.forEach(function (c) {
      if (c === ST.NORMAL) return;
      var rate = 0.12;
      if (c === ST.GOOD) rate = S.recipe.expert ? 0.12 : goodChance;
      else if (c === ST.EXCELLENT) rate = S.recipe.expert ? 0 : 0.04;
      else if (c === ST.POOR) rate = 0;
      else if (c === ST.CENTERED) rate = 0.15;
      else if (c === ST.STURDY) rate = 0.15;
      else if (c === ST.ROBUST) rate = 0.1;
      else if (c === ST.GOOD_OMEN) rate = 0.1;
      pool.push([c, rate]);
      total += rate;
    });
    pool.push([ST.NORMAL, 1 - total]);

    var threshold = rnd() * pool.reduce(function (n, p) { return n + p[1]; }, 0);
    var acc = 0;
    for (var i = 0; i < pool.length; i++) {
      acc += pool[i][1];
      if (acc > threshold) return pool[i][0];
    }
    return ST.NORMAL;
  }

  /* ── 主流程 ───────────────────────────────────────────────────────
     cfg = {
       recipe, stats, rotation:[技能 key],
       linear   true＝理想模式（技能必成功、狀態恆為一般）
       stepStates {步序: 狀態}（重播用；優先於擲骰）
       fails    [步序]（指定第幾步失敗，測試用）
       startingQuality  初期品質（HQ 材料換算後）
       rng      亂數來源，預設 Math.random
     } */
  function run(cfg) {
    var recipe = cfg.recipe;
    var S = {
      recipe: recipe,
      stats: cfg.stats,
      progress: 0,
      quality: cfg.startingQuality || 0,
      durability: recipe.durability,
      cp: cfg.stats.cp,
      maxCp: cfg.stats.cp,
      state: ST.NORMAL,
      buffs: [],
      steps: [],
      success: undefined,
      possibleConditions: possibleConditions(recipe.conditionsFlag),
    };
    var linear = !!cfg.linear;
    var rnd = cfg.rng || Math.random;
    var stepStates = cfg.stepStates || {};
    var fails = cfg.fails || [];

    // 配方本身的數值門檻（未達成時遊戲根本不讓你做）
    var statGate = null;
    if (recipe.craftsmanshipReq && cfg.stats.craftsmanship < recipe.craftsmanshipReq) {
      statGate = "作業精度不足（需 " + recipe.craftsmanshipReq + "）";
    } else if (recipe.controlReq && cfg.stats.control < recipe.controlReq) {
      statGate = "加工精度不足（需 " + recipe.controlReq + "）";
    }

    (cfg.rotation || []).forEach(function (key, index) {
      var a = actionsByKey[key];
      if (!a) return;

      if (stepStates[index] != null) S.state = stepStates[index];
      else if (linear) S.state = ST.NORMAL;

      var before = { p: S.progress, q: S.quality, d: S.durability, cp: S.cp };
      var noTick = (a.flags || []).indexOf("noTick") >= 0;
      // 已經結束的製作，理由就是「結束了」——不要再報 CP 不足之類的次要原因，
      // 否則整排技能會標成「CP 不足」，讀起來像是循環寫錯
      var reason = S.success !== undefined ? "製作已結束" : (statGate || whyNotUsable(S, a, linear));
      // 訊息帶上數字：技能面板與逐步列都直接顯示這句，只寫「CP 不足」等於要使用者自己算
      var need = baseCpCost(S, a);
      var enoughCp = need <= S.cp;
      if (!reason && !enoughCp) reason = "CP 不足（需 " + need + "，剩 " + S.cp + "）";

      var step;
      if (S.success === undefined && !reason) {
        var combo = hasCombo(S, a);
        var roll = linear ? 0 : rnd() * 100;
        if (fails.indexOf(index) >= 0) roll = 999;
        var ok = successRate(S, a) >= roll;
        if (ok) execute(S, a); else onFail(S, a);

        // 失敗照樣扣耐久與 CP；工匠的絕技會吃掉這一次的耐久消耗
        var durCost = durabilityCost(S, a);
        if (hasBuff(S, "trainedPerfection") && durCost > 0) {
          removeBuff(S, "trainedPerfection");
          durCost = 0;
        }
        S.durability -= durCost;
        S.cp -= cpCost(S, a);

        step = {
          index: index, key: key, name: a.name, type: a.type, skipped: false,
          success: ok, combo: combo, state: S.state, noTick: noTick,
          addedProgress: S.progress - before.p,
          addedQuality: S.quality - before.q,
          durabilityCost: before.d - S.durability,
          cpCost: before.cp - S.cp,
        };

        if (S.progress >= recipe.progress) S.success = true;
        else if (S.durability <= 0) { S.success = false; step.failCause = "耐久歸零"; }
      } else {
        step = {
          index: index, key: key, name: a.name, type: a.type, skipped: true,
          success: null, combo: false, state: S.state, noTick: noTick,
          addedProgress: 0, addedQuality: 0, durabilityCost: 0, cpCost: 0,
          failCause: reason || "製作已結束",
        };
      }

      // 增益結算：技能失敗且屬於「失敗就跳過」類、或不消耗作業時間者不結算
      var skipTicks = noTick || (step.success === false && skipOnFail(a)) || step.skipped;
      if (S.success === undefined && !skipTicks) tickBuffs(S, a);

      step.after = {
        progress: S.progress, quality: S.quality,
        durability: Math.max(S.durability, 0), cp: S.cp,
        buffs: S.buffs.map(function (b) {
          return { key: b.buff, name: (BUFFS[b.buff] || {}).name || b.buff, duration: b.duration, stacks: b.stacks };
        }),
      };

      // 下一步的作業狀態
      if (!linear && !noTick && stepStates[index + 1] == null) S.state = nextState(S, rnd);

      S.steps.push(step);
    });

    /* 成敗只由「耐久歸零前作業有沒有滿」決定，所以有三種狀態，不是兩種：
         done     作業滿了＝完成（收藏品另看品質門檻）
         failed   耐久歸零而作業沒滿＝失敗
         ongoing  兩者都還沒發生＝**還在做，沒有結果**
       把 ongoing 顯示成「失敗」是錯的：循環排到一半本來就還沒有結果。 */
    var done = S.progress >= recipe.progress;
    var qualityOk = !recipe.requiredQuality || S.quality >= recipe.requiredQuality;
    var status = done ? "done" : (S.durability <= 0 ? "failed" : "ongoing");
    if (statGate) status = "failed";

    var failCause = null;
    if (statGate) failCause = statGate;
    else if (status === "failed") failCause = "耐久歸零，製作失敗";
    else if (status === "done" && !qualityOk) failCause = "品質未達收藏品門檻";

    return {
      steps: S.steps,
      progress: S.progress,
      quality: S.quality,
      durability: Math.max(S.durability, 0),
      cp: S.cp,
      buffs: S.buffs,
      success: done && qualityOk,
      status: status,                                             // done｜failed｜ongoing
      remainingProgress: Math.max(recipe.progress - S.progress, 0),
      failCause: failCause,
      hqPercent: hqPercent(S.quality, recipe.quality),
      qualityPercent: Math.min((S.quality / recipe.quality) * 100, 100),
      progressPercent: Math.min((S.progress / recipe.progress) * 100, 100),
      usedSteps: S.steps.filter(function (s) { return !s.skipped && !s.noTick; }).length,
    };
  }

  /* 「失敗時不結算增益」的技能。實務上只有成功率 <100 的三支（高速製作、倉促、冒進）
     會失敗，而它們都不在這份名單裡；名單存在是為了讓外部指定失敗（重播、測試）時
     行為與遊戲一致。清單照 Teamcraft 的 skipOnFail() 逐支對過。 */
  var SKIP_ON_FAIL = ["observe", "carefulObservation", "trainedEye", "reflect",
                      "heartAndSoul", "quickInnovation", "trainedPerfection"];

  function skipOnFail(a) {
    if (a.type === "buff" || a.type === "repair" || a.type === "cp") return true;
    return SKIP_ON_FAIL.indexOf(a.key) >= 0;
  }

  function hqPercent(quality, maxQuality) {
    if (!maxQuality) return 0;
    var pct = Math.min(quality / maxQuality, 1) * 100;
    if (pct === 0) return 1;
    if (pct >= 100) return 100;
    return hqTable[Math.floor(pct)];
  }

  /* ── 「把這招接在目前循環後面會怎樣」──────────────────────────────
     技能面板要即時顯示：這招現在能不能用、不能用的原因、以及連段成立與否
     和實際會加多少作業／品質、扣多少 CP 與耐久。

     做法是把 rotation + 這一招整串重跑，取最後一步的結果——刻意不另外寫一套
     「可用性判斷」，否則面板與模擬遲早各說各話（連段折扣、內靜階數、耐久不足
     半效這些都是狀態相關的）。36 招 × 循環長度，跑起來只有幾毫秒。 */
  function previewNext(cfg) {
    var rotation = cfg.rotation || [];
    var out = {};
    Object.keys(actionsByKey).forEach(function (key) {
      var r = run({
        recipe: cfg.recipe, stats: cfg.stats, linear: true,
        startingQuality: cfg.startingQuality,
        rotation: rotation.concat(key),
      });
      var last = r.steps[r.steps.length - 1];
      if (!last) { out[key] = null; return; }
      out[key] = {
        usable: !last.skipped,
        reason: last.skipped ? last.failCause : null,
        combo: !!last.combo,
        addedProgress: last.addedProgress,
        addedQuality: last.addedQuality,
        cpCost: last.cpCost,
        durabilityCost: last.durabilityCost,
        finishes: r.success,
      };
    });
    return out;
  }

  /* ── 可靠度：同一套循環跑 n 次，看成功率與 HQ 分佈 ────────────────── */

  function reliability(cfg, n) {
    n = n || 200;
    var res = [], success = 0, hqSum = 0;
    for (var i = 0; i < n; i++) {
      var r = run(Object.assign({}, cfg, { linear: false }));
      if (r.success) success++;
      hqSum += r.hqPercent;
      res.push(r.hqPercent);
    }
    res.sort(function (a, b) { return a - b; });
    return {
      runs: n,
      successPercent: Math.round((success / n) * 100),
      hqAverage: Math.round(hqSum / n),
      hqMedian: res[Math.floor(n / 2)],
      hqMin: res[0],
      hqMax: res[n - 1],
    };
  }

  /* ── 初期品質（HQ 材料）────────────────────────────────────────────
     每個可 HQ 的材料每投一個，就加上該材料的品質貢獻。 */
  function startingQualityFrom(recipe, hqCounts) {
    var q = 0;
    (recipe.hqIngredients || []).forEach(function (g) {
      var n = Math.min(hqCounts[g[0]] || 0, g[1]);
      q += g[2] * n;
    });
    return Math.floor(q);
  }

  var api = {
    ST: ST, CONDITIONS: CONDITIONS, BUFFS: BUFFS,
    init: init, run: run, reliability: reliability, previewNext: previewNext,
    startingQualityFrom: startingQualityFrom,
    hqPercent: hqPercent,
    rlvlOf: rlvlOf,
    whyNotUsable: whyNotUsable,
    get actions() { return actionsByKey; },
  };
  return api;
});
