/* 製作模擬器 — 畫面與互動（規則在 craft-engine.js，自動求解在 craft-solver.js）
 *
 * 資料：
 *   data/craft-actions.json      技能表（繁中名／CP／等級／效率）＋等級對照＋HQ 對照
 *   data/craft-recipes.json      配方（欄位名在 columns，數值壓成陣列列）＋ rlvl 除數表
 *   data/craft-consumables.json  料理／藥品的加成（百分比＋上限）
 *   data/items-lite.json         id → 繁中名（成品與材料名稱）
 *   data/_meta.json              gamePatch（台服版本閘門，走共用的 patch-gate.js）
 *
 * 台服未開放的配方一律不顯示：patch > gamePatch，或成品在 items-lite 查無繁中名。
 *
 * ⚠ 引擎吃的是「吃補後」的數值 S.eff，不是使用者填的 S.stats。凡是要交給
 *   CraftEngine／CraftSolver 的地方一律傳 S.eff，混用會讓面板與模擬各說各話。
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var JOBS = { 8: "刻木匠", 9: "鍛鐵匠", 10: "鑄甲匠", 11: "雕金匠", 12: "製革匠", 13: "裁衣匠", 14: "煉金術士", 15: "烹調師" };

  var LS_STATS = "ffxiv_craftsim_stats";
  var LS_LAST = "ffxiv_craftsim_last";
  var LS_ROTS = "ffxiv_craftsim_rotations";   // 我的循環（具名儲存）
  var ROTS_MAX = 60;

  /* 內建範本。每一套都用 craft-engine 在「驗證條件」那組數值與配方上實跑過，
     結果記在 note 裡；套到別的配方當然可能做不完，模擬結果會直接告訴使用者。
     產生方式見 docs/crafting-sim.md。 */
  var TEMPLATES = [
    {
      name: "50 級前後 · 小配方（9 步）",
      note: "驗證條件：52 級／作業 600／加工 580／CP 330，配方 進度 210・品質 2200・耐久 80 → 完成、HQ 100%",
      rotation: ["innovation", "basicTouch", "standardTouch", "basicTouch", "standardTouch",
                 "greatStrides", "byregotsBlessing", "veneration", "basicSynthesis"],
    },
    {
      name: "80 級 · 80 耐久（13 步）",
      note: "驗證條件：80 級／作業 2500／加工 2400／CP 480，rlvl 430 配方 → 完成、HQ 100%",
      rotation: ["muscleMemory", "innovation", "wasteNotII", "preparatoryTouch", "preparatoryTouch",
                 "preparatoryTouch", "preparatoryTouch", "innovation", "preparatoryTouch",
                 "delicateSynthesis", "delicateSynthesis", "wasteNot", "groundwork"],
    },
    {
      name: "90 級 · 80 耐久（14 步）",
      note: "驗證條件：90 級／作業 3300／加工 3200／CP 520，rlvl 560 配方 → 完成、HQ 100%",
      rotation: ["muscleMemory", "veneration", "groundwork", "mastersMend", "innovation",
                 "preparatoryTouch", "wasteNotII", "preparatoryTouch", "preparatoryTouch",
                 "preparatoryTouch", "preparatoryTouch", "greatStrides", "byregotsBlessing", "groundwork"],
    },
    {
      name: "100 級 · 三星 80 耐久（18 步）",
      note: "驗證條件：100 級／作業 4200／加工 4000／CP 600，rlvl 690 三星（6600・12000・80）→ 完成、品質 7230、HQ 18%。加工精度越高品質越高。",
      rotation: ["muscleMemory", "veneration", "groundwork", "trainedPerfection", "groundwork",
                 "groundwork", "groundwork", "immaculateMend", "preparatoryTouch", "wasteNotII",
                 "innovation", "preparatoryTouch", "preparatoryTouch", "preparatoryTouch",
                 "preparatoryTouch", "greatStrides", "byregotsBlessing", "groundwork"],
    },
  ];

  var JOB_IDS = [8, 9, 10, 11, 12, 13, 14, 15];
  var DEFAULT_STATS = { level: 100, craftsmanship: 4200, control: 4000, cp: 600, specialist: false, relicTool: false };

  var DB = { actions: null, actionList: [], byKey: {}, recipes: null, cols: {}, names: null, index: [] };
  var S = {
    recipe: null,
    rotation: [],
    undo: [],
    hqCounts: {},
    tab: "setup",         // setup（準備）｜craft（排循環）｜about（說明）
    job: 0,               // 配方搜尋的職業篩選，0 = 全部
    statsJob: 15,         // 目前這組數值屬於哪一職（選配方時會自動跟著換）
    jobStats: {},         // jobId → 數值（**沒吃補的原始值**）
    stats: null,          // ＝ jobStats[statsJob]
    eff: null,            // 吃補後的數值＝交給引擎的那份（見檔頭警告）
    food: null,           // 料理的 itemId，null＝沒吃
    foodHq: true,
    medicine: null,
    medHq: true,
    rots: [],             // 我的循環 [{name, recipeId, recipeName, rotation, at}]
  };

  /* ── 載入 ─────────────────────────────────────────────────────── */

  function loadJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " HTTP " + r.status);
      return r.json();
    });
  }

  Promise.all([
    loadJson("../../data/craft-actions.json"),
    loadJson("../../data/craft-recipes.json"),
    loadJson("../../data/items-lite.json"),
    window.PatchGate ? PatchGate.loadGamePatch("../../data/_meta.json") : Promise.resolve("7.21"),
    // 料理／藥品缺了不該讓整頁掛掉——它是加分項，不是必要資料
    loadJson("../../data/craft-consumables.json").catch(function () { return { data: [] }; }),
  ]).then(function (res) {
    DB.actions = res[0];
    DB.recipes = res[1];
    DB.names = new Map(res[2].data);
    DB.gamePatch = res[3];
    DB.consumables = res[4].data || [];
    CraftEngine.init(DB.actions);

    DB.actionList = DB.actions.data;
    DB.actionList.forEach(function (a) { DB.byKey[a.key] = a; });
    DB.recipes.columns.forEach(function (c, i) { DB.cols[c] = i; });

    buildIndex();
    $("loading").hidden = true;
    $("app").hidden = false;
    boot();
  }).catch(function (e) {
    $("loading").textContent = "載入失敗：" + e.message;
  });

  // 台服已開放且查得到繁中名的配方才進索引
  function buildIndex() {
    var c = DB.cols, gate = DB.gamePatch;
    DB.recipes.data.forEach(function (row, i) {
      var name = DB.names.get(row[c.itemId]);
      if (!name) return;
      if (window.PatchGate && !PatchGate.released(row[c.patch], gate)) return;
      DB.index.push({ i: i, id: row[c.id], name: name, jobId: row[c.jobId], lvl: row[c.lvl], stars: row[c.stars] });
    });
  }

  function decode(row) {
    var c = DB.cols, o = {};
    Object.keys(c).forEach(function (k) { o[k] = row[c[k]]; });
    var t = DB.recipes.rlvlTable[o.rlvl] || [100, 100, 100, 100];
    o.progressDivider = t[0];
    o.qualityDivider = t[1];
    o.progressModifier = t[2];
    o.qualityModifier = t[3];
    o.name = DB.names.get(o.itemId) || ("道具 " + o.itemId);
    o.jobName = JOBS[o.jobId] || ("職業 " + o.jobId);
    return o;
  }

  /* ── 啟動 ─────────────────────────────────────────────────────── */

  function boot() {
    restoreStats();
    renderStatsJob();
    fillStatsInputs();
    renderConsumables();
    restoreRotations();
    renderJobFilters();
    renderPalette();
    renderTemplates();
    renderNotes();
    initTabs();
    bindEvents();

    var fromUrl = readHash();
    var last = fromUrl || readLast();
    if (last && last.recipeId) {
      var hit = DB.index.find(function (r) { return r.id === last.recipeId; });
      if (hit) selectRecipe(hit.i, true);
    }
    if (last && last.rotation && last.rotation.length) {
      S.rotation = last.rotation.filter(function (k) { return DB.byKey[k]; });
    }
    // 已經選好配方的（回訪或深連結）直接進排循環，不必再看一次準備分頁
    showTab((fromUrl && fromUrl.tab) || (S.recipe ? "craft" : "setup"));
    simulate();
    search();
  }

  /* ── 分頁 ─────────────────────────────────────────────────────
     依使用時機分：準備（選配方＋數值，設定完就不用再看）／排循環／說明。
     鍵盤行為照 ARIA APG：左右鍵移動、Home/End 跳頭尾（與園藝頁同一套）。 */
  function initTabs() {
    var btns = Array.prototype.slice.call(document.querySelectorAll(".tab-btn"));
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () { showTab(b.dataset.tab); });
      b.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = btns[(i + 1) % btns.length];
        else if (e.key === "ArrowLeft") n = btns[(i - 1 + btns.length) % btns.length];
        else if (e.key === "Home") n = btns[0];
        else if (e.key === "End") n = btns[btns.length - 1];
        if (!n) return;
        e.preventDefault();
        n.focus();
        showTab(n.dataset.tab);
      });
    });
  }

  /* 兩欄各自捲動時，欄位高度＝視窗高扣掉頁首。頁首高度會隨視窗寬度換行而變，
     所以量出來寫進 CSS 變數，不寫死。窄螢幕的 CSS 不吃這個值，設了也無害。 */
  function sizeCraftPanes() {
    var g = document.querySelector(".craft-grid");
    if (!g || g.offsetParent === null) return;
    // 先拿掉上次算的值再量：要量的是「沒有被限制高度時」的自然版面，
    // 否則會拿上一輪的結果當基準，收斂不到（實測會留 56px 捲動）
    g.style.removeProperty("--craft-top");
    g.style.removeProperty("--craft-reserve");
    var top = Math.round(g.getBoundingClientRect().top + window.pageYOffset);
    g.style.setProperty("--craft-top", top + "px");
    /* 只留一點邊，**不替頁尾留位**。原本把頁尾（約 220px）也算進去，結果整頁雖然不捲，
       兩欄卻只剩一百多 px、看得到一兩列——本末倒置。頁尾捲下去就看得到，
       工作區才是這個分頁的主體。 */
    g.style.setProperty("--craft-reserve", "14px");
  }

  function showTab(tab) {
    S.tab = tab;
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.hidden = p.id !== "p-" + tab;
    });
    hideTip();
    showResultBar(tab === "craft" && !!S.recipe);
    // 工作分頁把頁首收窄，高度讓給兩欄（見 index.html 的 .craft-focus）
    document.body.classList.toggle("craft-focus", tab === "craft");
    sizeCraftPanes();
    writeHash();
  }

  /* ── 工匠數值 ─────────────────────────────────────────────────── */

  /* 八個製作職各存一組數值。裝備與白貓道具是逐職的，共用一組等於每次換職業都要重打。
     儲存格式 v2＝{v:2, lastJob, jobs:{jobId:數值}}；舊版是單一組數值的平面物件，
     載到舊格式就複製到八職（那正是使用者原本的狀態），不會掉資料。 */
  function restoreStats() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(LS_STATS) || "null"); } catch (e) { raw = null; }

    JOB_IDS.forEach(function (id) { S.jobStats[id] = Object.assign({}, DEFAULT_STATS); });

    if (raw && raw.jobs) {
      JOB_IDS.forEach(function (id) {
        if (raw.jobs[id]) Object.assign(S.jobStats[id], raw.jobs[id]);
      });
      if (JOB_IDS.indexOf(raw.lastJob) >= 0) S.statsJob = raw.lastJob;
      // v3 起多存料理／藥品。八職共用一組——同一個人不會為了換職業換料理。
      if (raw.food != null) S.food = raw.food;
      if (raw.medicine != null) S.medicine = raw.medicine;
      if (raw.foodHq != null) S.foodHq = !!raw.foodHq;
      if (raw.medHq != null) S.medHq = !!raw.medHq;
    } else if (raw && raw.level != null) {
      JOB_IDS.forEach(function (id) { Object.assign(S.jobStats[id], raw); });
    }
    S.stats = S.jobStats[S.statsJob];
    S.eff = S.stats;
  }

  function renderStatsJob() {
    var sel = $("statsJob");
    sel.innerHTML = "";
    JOB_IDS.forEach(function (id) {
      var o = document.createElement("option");
      o.value = String(id);
      o.textContent = JOBS[id];
      sel.appendChild(o);
    });
    sel.value = String(S.statsJob);
  }

  function fillStatsInputs() {
    var s = S.stats;
    $("statLevel").value = s.level;
    $("statCraftsmanship").value = s.craftsmanship;
    $("statControl").value = s.control;
    $("statCp").value = s.cp;
    $("statSpecialist").checked = !!s.specialist;
    $("statRelic").checked = !!s.relicTool;
    $("statsJob").value = String(S.statsJob);
    // HQ 勾選會影響下拉的文字（加成數字不同），所以要在 renderConsumables 之前設好
    $("foodHq").checked = !!S.foodHq;
    $("medHq").checked = !!S.medHq;
  }

  // auto=true 代表是「選了配方所以自動切」，要講出來——數值整排跳掉卻沒說明會像 bug
  function setStatsJob(id, auto) {
    if (!S.jobStats[id] || id === S.statsJob) {
      if (!auto) $("statsJobHint").textContent = "";
      return;
    }
    S.statsJob = id;
    S.stats = S.jobStats[id];
    fillStatsInputs();
    $("statsJobHint").textContent = auto ? "已依配方切到「" + JOBS[id] + "」的數值" : "";
    saveStats();
  }

  function readStats() {
    var n = function (id, min, max, dflt) {
      var v = parseInt($(id).value, 10);
      if (isNaN(v)) return dflt;
      return Math.min(Math.max(v, min), max);
    };
    S.stats.level = n("statLevel", 1, 100, 100);
    S.stats.craftsmanship = n("statCraftsmanship", 1, 20000, 1);
    S.stats.control = n("statControl", 1, 20000, 1);
    S.stats.cp = n("statCp", 1, 2000, 180);
    S.stats.specialist = $("statSpecialist").checked;
    S.stats.relicTool = $("statRelic").checked;
    S.food = $("foodSelect").value ? parseInt($("foodSelect").value, 10) : null;
    S.medicine = $("medSelect").value ? parseInt($("medSelect").value, 10) : null;
    S.foodHq = $("foodHq").checked;
    S.medHq = $("medHq").checked;
    S.eff = effStats();
    saveStats();
  }

  function saveStats() {
    try {
      localStorage.setItem(LS_STATS, JSON.stringify({
        v: 3, lastJob: S.statsJob, jobs: S.jobStats,
        food: S.food, foodHq: S.foodHq, medicine: S.medicine, medHq: S.medHq,
      }));
    } catch (e) { /* 私密視窗等：僅本次有效 */ }
  }

  /* ── 料理／藥品 ───────────────────────────────────────────────────
     加成是「基礎值 × 百分比，但不超過上限」，而且**料理與藥品各自從基礎值算**再相加
     （不是疊加後再算），跟遊戲一致。上限那一段最容易被忽略：作業 4200 吃 +5%／上限 150
     只會加 150 而不是 210。 */

  function consumById(id) {
    for (var i = 0; i < DB.consumables.length; i++) if (DB.consumables[i].id === id) return DB.consumables[i];
    return null;
  }

  // b＝[是否百分比, NQ 值, NQ 上限, HQ 值, HQ 上限]
  function bonusValue(b, hq, baseStat) {
    if (!b) return 0;
    var val = hq ? b[3] : b[1], max = hq ? b[4] : b[2];
    var raw = b[0] ? Math.floor(baseStat * val / 100) : val;
    return Math.min(raw, max);
  }

  function effStats() {
    var s = S.stats;
    var out = {
      level: s.level, craftsmanship: s.craftsmanship, control: s.control, cp: s.cp,
      specialist: s.specialist, relicTool: s.relicTool,
    };
    [[consumById(S.food), S.foodHq], [consumById(S.medicine), S.medHq]].forEach(function (pair) {
      var c = pair[0];
      if (!c) return;
      out.craftsmanship += bonusValue(c.bonuses.cms, pair[1], s.craftsmanship);
      out.control += bonusValue(c.bonuses.ctl, pair[1], s.control);
      out.cp += bonusValue(c.bonuses.cp, pair[1], s.cp);
    });
    return out;
  }

  // 下拉的字要看得出「這個東西加什麼、加多少」，否則等於要人先去查一次
  function consumLabel(c, hq) {
    var parts = [];
    [["cms", "作業"], ["ctl", "加工"], ["cp", "CP"]].forEach(function (p) {
      var b = c.bonuses[p[0]];
      if (!b) return;
      var val = hq ? b[3] : b[1], max = hq ? b[4] : b[2];
      parts.push(p[1] + (b[0] ? " +" + val + "%（上限 " + max + "）" : " +" + val));
    });
    return c.name + " — " + parts.join("、");
  }

  function renderConsumables() {
    [["foodSelect", "food", "foodHq", "沒吃料理"], ["medSelect", "medicine", "medHq", "沒吃藥品"]]
      .forEach(function (spec) {
        var sel = $(spec[0]);
        var kind = spec[1] === "food" ? "food" : "medicine";
        var hq = $(spec[2]).checked;
        var keep = S[spec[1]];
        sel.innerHTML = "";
        var none = document.createElement("option");
        none.value = "";
        none.textContent = spec[3];
        sel.appendChild(none);
        DB.consumables.forEach(function (c) {
          if (c.kind !== kind) return;
          if (window.PatchGate && !PatchGate.released(c.patch, DB.gamePatch)) return;
          var o = document.createElement("option");
          o.value = String(c.id);
          o.textContent = consumLabel(c, hq);
          sel.appendChild(o);
        });
        sel.value = keep != null ? String(keep) : "";
        if (sel.value === "" && keep != null) S[spec[1]] = null;   // 台服還沒開放的就當沒選
      });
    if (!DB.consumables.length) {
      $("effLine").textContent = "（載不到料理／藥品資料，這次先當作沒吃補）";
    }
    syncHqToggles();
  }

  // 沒選東西時 HQ 勾選框不該還能按——看起來可按卻沒作用是最容易誤導人的狀態
  function syncHqToggles() {
    [["foodSelect", "foodHq"], ["medSelect", "medHq"]].forEach(function (p) {
      var off = !$(p[0]).value;
      $(p[1]).disabled = off;
      $(p[1]).closest(".toggle").style.opacity = off ? "0.5" : "";
    });
  }

  /* 加成後的實際數值。只列有變的那幾項——沒變的也印一次會讓人以為加成沒生效。
     刻意不掛 aria-live：上面四格是邊打邊算的，掛了會每按一鍵就念一次。 */
  function renderEffLine() {
    if (!DB.consumables.length) return;
    var s = S.stats, e = S.eff, parts = [];
    [["craftsmanship", "作業"], ["control", "加工"], ["cp", "CP"]].forEach(function (p) {
      if (e[p[0]] !== s[p[0]]) {
        parts.push(p[1] + " " + s[p[0]] + " → <b>" + e[p[0]] + "</b>（+" + (e[p[0]] - s[p[0]]) + "）");
      }
    });
    $("effLine").innerHTML = parts.length
      ? "吃補後：" + parts.join("　／　")
      : "沒吃補，模擬用的就是上面填的數值。";
  }

  function sameStats(a, b) {
    return a.level === b.level && a.craftsmanship === b.craftsmanship &&
           a.control === b.control && a.cp === b.cp &&
           !!a.specialist === !!b.specialist && !!a.relicTool === !!b.relicTool;
  }

  // 提示區可能帶一顆「復原」鈕，所以走 innerHTML 而不是 textContent
  function setStatsHint(text, undoLabel) {
    var el = $("statsJobHint");
    el.innerHTML = esc(text);
    if (!undoLabel) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.style.marginLeft = "0.4rem";
    b.textContent = undoLabel;
    b.addEventListener("click", undoStatsCopy);
    el.appendChild(b);
  }

  /* 一鍵覆蓋七個職業的數值是**不可逆**的批次動作，誤按代價高（別職的裝備數值要重打），
     所以照全站慣例先 confirm，訊息裡把「會被蓋掉的是哪幾職」列出來，
     另外留一份備份讓誤按還有救。 */
  var statsUndo = null;

  function copyStatsToAllJobs() {
    readStats();
    var others = JOB_IDS.filter(function (id) { return id !== S.statsJob; });
    var changed = others.filter(function (id) { return !sameStats(S.jobStats[id], S.stats); });

    if (!changed.length) {
      setStatsHint("其他七職的數值本來就相同，沒有任何變動");
      return;
    }

    var s = S.stats;
    var msg = "要把「" + JOBS[S.statsJob] + "」這組數值覆蓋到其他 " + others.length + " 個職業嗎？\n\n" +
      "　" + s.level + " 級／作業 " + s.craftsmanship + "／加工 " + s.control + "／CP " + s.cp +
      (s.specialist ? "／專家" : "") + "\n\n" +
      "其中 " + changed.length + " 個職業目前的數值會被蓋掉：\n　" +
      changed.map(function (id) { return JOBS[id]; }).join("、") + "\n\n" +
      "上方的「復原」只管技能循環；要還原這次覆蓋，請按套用後出現的「復原這次覆蓋」。";

    if (!window.confirm(msg)) {
      setStatsHint("已取消，沒有變動");
      return;
    }

    statsUndo = {};
    others.forEach(function (id) {
      statsUndo[id] = Object.assign({}, S.jobStats[id]);
      S.jobStats[id] = Object.assign({}, S.stats);
    });
    saveStats();
    setStatsHint("已覆蓋 " + changed.length + " 個職業的數值。", "↶ 復原這次覆蓋");
  }

  function undoStatsCopy() {
    if (!statsUndo) return;
    Object.keys(statsUndo).forEach(function (id) { S.jobStats[id] = statsUndo[id]; });
    statsUndo = null;
    fillStatsInputs();
    saveStats();
    setStatsHint("已還原其他職業原本的數值");
  }

  /* ── 配方搜尋 ─────────────────────────────────────────────────── */

  function renderJobFilters() {
    var wrap = $("jobFilters");
    var all = [{ id: 0, name: "全部" }].concat(Object.keys(JOBS).map(function (k) {
      return { id: +k, name: JOBS[k] };
    }));
    wrap.innerHTML = "";
    all.forEach(function (j) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "job-btn";
      b.textContent = j.name;
      b.setAttribute("aria-pressed", String(S.job === j.id));
      b.addEventListener("click", function () {
        S.job = j.id;
        wrap.querySelectorAll(".job-btn").forEach(function (x, idx) {
          x.setAttribute("aria-pressed", String(all[idx].id === S.job));
        });
        search();
      });
      wrap.appendChild(b);
    });
  }

  var searchTimer = null;
  function search() {
    var q = $("recipeSearch").value.trim();
    var minLv = parseInt($("levelMin").value, 10);
    var list = DB.index.filter(function (r) {
      if (S.job && r.jobId !== S.job) return false;
      if (!isNaN(minLv) && r.lvl < minLv) return false;
      if (q && r.name.indexOf(q) < 0) return false;
      return true;
    });
    // 名稱完全相符優先，其次等級高的在前（多數人找的是當前版本的東西）
    list.sort(function (a, b) {
      var ea = a.name === q ? 0 : 1, eb = b.name === q ? 0 : 1;
      if (ea !== eb) return ea - eb;
      if (b.lvl !== a.lvl) return b.lvl - a.lvl;
      return b.stars - a.stars;
    });

    var ul = $("searchResults");
    ul.innerHTML = "";

    // 沒有任何條件時不要把 40 筆倒出來——那會把配方卡與工匠數值整個推到摺線下面，
    // 而且「隨便列 40 個」對使用者沒有意義
    var filtering = !!q || !!S.job || !isNaN(minLv);
    if (!filtering) {
      $("searchHint").textContent = "共 " + DB.index.length + " 筆配方，輸入名稱或選職業開始找";
      return;
    }

    list.slice(0, 40).forEach(function (r) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "result-btn";
      b.innerHTML = '<span>' + esc(r.name) + '</span><span class="result-meta num">' +
        esc(JOBS[r.jobId] || "") + " Lv" + r.lvl + (r.stars ? " " + "★".repeat(r.stars) : "") + "</span>";
      b.addEventListener("click", function () { selectRecipe(r.i); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    $("searchHint").textContent = list.length
      ? ("符合 " + list.length + " 筆" + (list.length > 40 ? "，顯示前 40 筆" : ""))
      : "找不到符合的配方（台服未開放的不會出現）";
  }

  function selectRecipe(rowIndex, quiet) {
    S.recipe = decode(DB.recipes.data[rowIndex]);
    S.hqCounts = {};
    setStatsJob(S.recipe.jobId, true);   // 直接調用該職業存好的數值
    renderRecipeDetail();
    renderHqPanel();
    if (!quiet) {
      $("searchResults").innerHTML = "";
      $("recipeSearch").value = "";
      $("searchHint").textContent = "";
      simulate();
      saveLast();
    }
  }

  function renderRecipeDetail() {
    var el = $("recipeDetail");
    var r = S.recipe;
    if (!r) { el.hidden = true; return; }
    el.hidden = false;

    var tags = [];
    tags.push('<span class="tag">' + esc(r.jobName) + "</span>");
    tags.push('<span class="tag num">Lv' + r.lvl + (r.stars ? " " + "★".repeat(r.stars) : "") + "</span>");
    if (r.expert) tags.push('<span class="tag tag-warn">高難度配方</span>');
    if (!r.hq) tags.push('<span class="tag">不可 HQ</span>');
    if (r.requiredQuality) tags.push('<span class="tag num">收藏品門檻 ' + r.requiredQuality + "</span>");
    if (r.craftsmanshipReq && S.eff.craftsmanship < r.craftsmanshipReq) {
      tags.push('<span class="tag tag-warn num">需作業精度 ' + r.craftsmanshipReq + "</span>");
    }
    if (r.controlReq && S.eff.control < r.controlReq) {
      tags.push('<span class="tag tag-warn num">需加工精度 ' + r.controlReq + "</span>");
    }

    el.innerHTML =
      '<div class="recipe-head"><span class="recipe-name">' + esc(r.name) + "</span>" + tags.join("") + "</div>" +
      '<div class="recipe-stats">' +
        cell("作業難度", r.progress) + cell("最高品質", r.quality) + cell("耐久", r.durability) +
        cell("配方等級", "rlvl " + r.rlvl) +
      "</div>";

    function cell(label, v) {
      return "<div><span>" + label + '</span><b class="num">' + v + "</b></div>";
    }
  }

  function renderHqPanel() {
    var el = $("hqPanel"), r = S.recipe;
    if (!r || !r.hq || !r.hqIngredients || !r.hqIngredients.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    var rows = r.hqIngredients.map(function (g) {
      var name = DB.names.get(g[0]) || ("道具 " + g[0]);
      return '<div class="hq-row"><span class="grow">' + esc(name) + '</span>' +
        '<input type="number" min="0" max="' + g[1] + '" step="1" value="0" inputmode="numeric" ' +
        'data-item="' + g[0] + '" aria-label="' + esc(name) + ' 的 HQ 數量（最多 ' + g[1] + '）"> ' +
        '<span class="muted-sm num">/ ' + g[1] + "</span></div>";
    }).join("");
    el.innerHTML = '<h3 style="margin-top:0.8rem">HQ 材料</h3>' +
      '<p class="muted-sm">投入 HQ 材料會給初期品質。</p>' +
      '<div class="hq-list">' + rows + "</div>" +
      '<p class="muted-sm" id="hqSum" style="margin-top:0.4rem"></p>';

    el.querySelectorAll("input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var max = parseInt(inp.max, 10);
        var v = Math.min(Math.max(parseInt(inp.value, 10) || 0, 0), max);
        S.hqCounts[inp.dataset.item] = v;
        simulate();
      });
    });
    updateHqSum();
  }

  function updateHqSum() {
    var el = $("hqSum");
    if (!el || !S.recipe) return;
    var q = CraftEngine.startingQualityFrom(S.recipe, S.hqCounts);
    el.textContent = "初期品質 " + q + " / " + S.recipe.quality;
  }

  /* ── 技能面板 ─────────────────────────────────────────────────── */

  var firstStepOnly = function (a) { return (a.flags || []).indexOf("firstStep") >= 0; };

  /* 「只能第一步用」自成一組排在最上面：這三招（堅信／閒靜／工匠的神速技巧）
     一旦動了第二步就再也用不到，是排循環時第一個要決定的事。
     混在作業／加工組裡的話，等使用者滑到它們時通常已經來不及了。
     其餘各組都要把它們排除，否則同一招會出現兩次。 */
  var GROUPS = [
    { title: "開場（只能第一步用）", match: firstStepOnly },
    { title: "作業（推進度）", match: function (a) { return a.type === "progress" && !firstStepOnly(a); } },
    { title: "加工（提品質）", match: function (a) { return a.type === "quality" && !firstStepOnly(a); } },
    { title: "增益與修復", match: function (a) { return (a.type === "buff" || a.type === "repair") && !firstStepOnly(a); } },
    { title: "其他", match: function (a) { return (a.type === "other" || a.type === "cp") && !firstStepOnly(a); } },
  ];

  /* 冒進**不進技能面板**：遊戲裡它是直接取代倉促那顆按鈕的升級技，玩家不會、
     也不能分別按它們。循環裡只放倉促，引擎會在「工匠的良機」生效時自動換成冒進
     （見 craft-engine.js 檔頭第 3 點）——連放兩個倉促、第一個成功了，
     第二個就發動冒進，跟遊戲一致。列成兩顆只會讓人以為要自己安排順序。 */
  var HIDDEN_IN_PALETTE = ["daringTouch"];
  var UPGRADES = { hastyTouch: "daringTouch" };   // 誰會被升級成誰（顯示用）

  function renderPalette() {
    var wrap = $("palette");
    wrap.innerHTML = "";
    GROUPS.forEach(function (g) {
      var list = DB.actionList
        .filter(function (a) { return g.match(a) && HIDDEN_IN_PALETTE.indexOf(a.key) < 0; })
        .sort(function (a, b) { return a.level - b.level; });
      if (!list.length) return;
      var box = document.createElement("div");
      box.className = "palette-group";
      var h = document.createElement("h3");
      h.textContent = g.title;
      box.appendChild(h);
      var row = document.createElement("div");
      row.className = "skills";
      list.forEach(function (a) { row.appendChild(skillButton(a)); });
      box.appendChild(row);
      wrap.appendChild(box);
    });
  }

  function metaOf(a) {
    var meta = [];
    meta.push((a.comboCp != null ? a.comboCp + "–" + a.cp : a.cp) + "CP");
    if (a.eff) meta.push("效率 " + (a.eff.at ? a.eff.base + "→" + a.eff.up : a.eff.base));
    if (a.duration) meta.push(a.duration + " 步");
    if (a.dur) meta.push("耐久 " + a.dur);
    if (a.succ != null && a.succ < 100) meta.push("成功 " + a.succ + "%");
    // 升級技不另外列一顆，改在原技能上寫清楚它會變成什麼
    if (UPGRADES[a.key] && DB.byKey[UPGRADES[a.key]]) {
      meta.push("成功後下一發自動升級為" + DB.byKey[UPGRADES[a.key]].name);
    }
    return meta.join(" · ");
  }

  function skillButton(a) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "skill";
    b.dataset.type = a.type;
    b.dataset.key = a.key;

    b.innerHTML = '<span class="skill-name">' + esc(a.name) + "</span>" +
      '<span class="skill-meta">' + esc(metaOf(a)) + "</span>" +
      '<span class="skill-flag"></span>';

    b.addEventListener("click", function () { push(a.key); });
    // 說明用自製浮層而不是 title：title 要等一秒才出來、不能換行、也放不下即時試算
    b.addEventListener("mouseenter", function () { showTip(b, a); });
    b.addEventListener("focus", function () { showTip(b, a); });
    b.addEventListener("mouseleave", hideTip);
    b.addEventListener("blur", hideTip);
    return b;
  }

  /* 技能面板即時反映「接在目前循環後面能不能用」——等級、專家、CP、內靜、
     儉約衝突、一次限用、首步限定都算進去，原因直接寫在按鈕上。
     仍然可點：使用者常會先排完再回頭補 CP 或調順序，直接 disabled 會讓他們卡住，
     而且 disabled 的按鈕在觸控裝置上連原因都看不到。 */
  /* ended＝製作已經有結果（做完或失敗）。此時**整排技能直接停用**：
     遊戲裡製作結束後也按不了技能，留著能點只會讓人排出一串不會發生的步驟。
     停用的原因寫在卡片上方那一句，不逐顆重複標（那只是噪音）。 */
  function refreshPalette(preview, ended) {
    $("paletteNote").textContent = ended
      ? "這串製作已經結束了，技能已停用。要繼續試就先刪掉後面幾步。"
      : "";
    $("paletteNote").hidden = !ended;

    document.querySelectorAll(".skill").forEach(function (b) {
      var a = DB.byKey[b.dataset.key];
      var p = preview && preview[a.key];
      b.disabled = !!ended;

      var lockedFor = null;
      if (a.level > S.eff.level) lockedFor = "🔒 Lv" + a.level;
      else if ((a.flags || []).indexOf("specialist") >= 0 && !S.eff.specialist) lockedFor = "🔒 需專家";

      var blocked = !ended && !!(p && !p.usable);
      var upgraded = !ended && !!(p && p.usable && p.key && p.key !== a.key);
      var flag = "";
      if (lockedFor) flag = lockedFor;
      else if (blocked) flag = "⚠ " + p.reason;
      else if (upgraded) flag = "⤴ 這一發會是" + p.name;
      else if (!ended && p && p.combo) flag = "▶ 連段中 " + p.cpCost + "CP";

      b.classList.toggle("locked", !!lockedFor);
      b.classList.toggle("unusable", !lockedFor && blocked);
      b.classList.toggle("combo-ready", !lockedFor && !ended && !!(p && p.usable && p.combo));
      b.querySelector(".skill-flag").textContent = flag;
    });
  }

  /* ── 技能說明浮層 ─────────────────────────────────────────────── */

  var tipFor = null;

  function showTip(el, a) {
    var tip = $("skillTip");
    var p = lastPreview && lastPreview[a.key];

    var live = "";
    if (!S.recipe) {
      live = '<span class="no">先選一個配方才能試算</span>';
    } else if (a.level > S.eff.level) {
      live = '<span class="no">等級不足，需 ' + a.level + " 級</span>";
    } else if (p && !p.usable) {
      live = '<span class="no">接在目前循環後：不可用（' + esc(p.reason) + "）</span>";
    } else if (p) {
      // 增量同樣封頂：超出上限的部分在遊戲裡不會進條，寫出來只會讓人以為多賺了
      var base = lastResult || { progress: 0, quality: 0 };
      var dp = capP(base.progress + p.addedProgress) - capP(base.progress);
      var dq = capQ(base.quality + p.addedQuality) - capQ(base.quality);
      var bits = [];
      if (p.key && p.key !== a.key) bits.push('<span class="combo">這一發會是' + esc(p.name) + "</span>");
      if (p.combo) bits.push('<span class="combo">連段成立</span>');
      if (dp) bits.push('作業 <span class="ok">+' + dp + "</span>");
      if (dq) bits.push('品質 <span class="ok">+' + dq + "</span>");
      bits.push("CP −" + p.cpCost);
      bits.push("耐久 −" + p.durabilityCost);
      if (p.finishes) bits.push('<span class="ok">這一招就做完了</span>');
      live = "接在目前循環後：" + bits.join("、");
    }

    tip.innerHTML =
      '<div class="tip-name">' + esc(a.name) + "</div>" +
      '<div class="tip-meta">' + esc(metaOf(a)) + "</div>" +
      (a.desc ? '<div class="tip-desc">' + esc(a.desc) + "</div>" : "") +
      (live ? '<div class="tip-live">' + live + "</div>" : "");

    tip.hidden = false;
    tipFor = el;
    el.setAttribute("aria-describedby", "skillTip");
    positionTip(el, tip);
  }

  // 貼在按鈕下方，超出視窗就往回收；空間不夠就翻到上方
  function positionTip(el, tip) {
    var r = el.getBoundingClientRect();
    var t = tip.getBoundingClientRect();
    var gap = 6;
    var left = Math.min(r.left, window.innerWidth - t.width - 8);
    var top = r.bottom + gap;
    if (top + t.height > window.innerHeight - 8) top = Math.max(8, r.top - t.height - gap);
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = top + "px";
  }

  function hideTip() {
    var tip = $("skillTip");
    tip.hidden = true;
    if (tipFor) tipFor.removeAttribute("aria-describedby");
    tipFor = null;
  }

  /* ── 循環 ─────────────────────────────────────────────────────── */

  function push(key) {
    S.undo.push(S.rotation.slice());
    S.rotation.push(key);
    afterChange();
  }

  function afterChange() {
    if (S.undo.length > 60) S.undo.shift();
    simulate();
    saveLast();
    writeHash();
  }

  function move(from, to) {
    if (to < 0 || to >= S.rotation.length) return;
    S.undo.push(S.rotation.slice());
    var k = S.rotation.splice(from, 1)[0];
    S.rotation.splice(to, 0, k);
    afterChange();
    // 移動後把焦點留在同一顆技能上，鍵盤使用者才能連按
    var el = document.querySelector('.rot-row[data-i="' + to + '"] .mv-' + (to > from ? "right" : "left"));
    if (el) el.focus();
  }

  function removeAt(i) {
    S.undo.push(S.rotation.slice());
    S.rotation.splice(i, 1);
    afterChange();
    var rows = document.querySelectorAll(".rot-row:not(.rot-head)");
    var next = rows[Math.min(i, rows.length - 1)];
    if (next) { var btn = next.querySelector(".rm"); if (btn) btn.focus(); }
  }

  var lastResult = null;
  var lastPreview = null;   // 技能 key → 接在目前循環後的試算（引擎的 previewNext）

  /* 畫面上的作業／品質**封頂在配方的上限**，跟遊戲一致：進度條滿了就是滿了，
     不會出現「作業 1483 / 750」。封頂刻意做在這裡而不是引擎裡——引擎要跟
     Teamcraft 的官方測試案例逐值對得上，那些期望值是未封頂的原始數字
     （見 craft-engine.js 檔頭）。 */
  function capP(v) { return S.recipe ? Math.min(v, S.recipe.progress) : v; }
  function capQ(v) { return S.recipe ? Math.min(v, S.recipe.quality) : v; }

  /* 循環清單＝逐步明細。每一列就是那一步，右邊是**做到這一步當下**的數值，
     跟下緣結果條同一套讀法；不另外開一張逐步表，免得使用者要在兩處對「第幾步」。 */
  function renderRotation(res) {
    var ol = $("rotation");
    ol.innerHTML = "";
    ol.classList.toggle("empty-hint", S.rotation.length === 0);
    if (!S.rotation.length) {
      ol.textContent = "還沒有技能——從左邊點幾個，或套用一份範本。";
      $("rotCount").textContent = "";
      return;
    }
    // 欄位標題只出現一次，數值列就不必每列重複寫「耐久／CP」
    var head = document.createElement("li");
    head.className = "rot-row rot-head";
    head.setAttribute("aria-hidden", "true");
    head.innerHTML =
      '<span class="rot-idx">#</span><span class="rot-name">技能</span>' +
      '<span class="rot-cells">' +
        '<span class="rot-cell">作業<br><small>累計</small></span>' +
        '<span class="rot-cell">品質<br><small>累計</small></span>' +
        '<span class="rot-cell">耐久</span><span class="rot-cell">CP</span>' +
      "</span>" +
      '<span class="rot-ctl"></span>';
    ol.appendChild(head);

    S.rotation.forEach(function (key, i) {
      var step = res && res.steps[i];
      // 倉促會在工匠的良機下解析成冒進——列出實際發動的那一個，不是使用者點的那一個
      var a = DB.byKey[(step && step.key) || key];
      var upgraded = !!(step && step.key && step.key !== key);
      var li = document.createElement("li");
      li.className = "rot-row" + (step && step.skipped ? " invalid" : "");
      li.dataset.type = a.type;
      li.dataset.i = i;
      li.draggable = true;

      var cells;
      if (!step) {
        cells = '<span class="rot-cells"></span>';
      } else if (step.skipped) {
        cells = '<span class="rot-cells"><span class="rot-why">' + esc(step.failCause) + "</span></span>";
      } else {
        // 累計與增量一起封頂，兩邊才對得起來（最後一招常常超出上限一大截）
        var dp = capP(step.after.progress) - capP(step.after.progress - step.addedProgress);
        var dq = capQ(step.after.quality) - capQ(step.after.quality - step.addedQuality);
        cells = '<span class="rot-cells">' +
          '<span class="rot-cell rot-delta-p">' + (dp ? "+" + dp : "—") +
            "<br><small>" + capP(step.after.progress) + "</small></span>" +
          '<span class="rot-cell rot-delta-q">' + (dq ? "+" + dq : "—") +
            "<br><small>" + capQ(step.after.quality) + "</small></span>" +
          '<span class="rot-cell">' + step.after.durability + "</span>" +
          '<span class="rot-cell">' + step.after.cp + "</span>" +
          "</span>";
        /* 刻意不列「作業狀態」欄：這份逐步明細一律用理想模式算（linear），
           每一列的狀態必定是「一般」——一整欄相同的值只是佔位置。
           會擲球色的是彈窗裡的隨機模擬，那裡才有意義。假設寫在清單下方一句話。 */
      }

      li.innerHTML =
        '<span class="rot-idx">' + (i + 1) + "</span>" +
        '<span class="rot-name"' + (upgraded ? ' title="' + esc(DB.byKey[key].name) + '成功了，這一發自動升級為' + esc(a.name) + '"' : "") + ">" +
          (upgraded ? '<span class="rot-up" aria-hidden="true">⤴</span>' : "") +
          // 升級那一發已經有 ⤴，再標一個連段 ▶ 是同一件事講兩次
          esc(a.name) + (!upgraded && step && step.combo ? " ▶" : "") + "</span>" +
        cells +
        '<span class="rot-ctl">' +
          '<button type="button" class="mv-left" aria-label="把第 ' + (i + 1) + " 步的" + esc(a.name) + '往前移">←</button>' +
          '<button type="button" class="rm" aria-label="刪除第 ' + (i + 1) + " 步的" + esc(a.name) + '">✕</button>' +
          '<button type="button" class="mv-right" aria-label="把第 ' + (i + 1) + " 步的" + esc(a.name) + '往後移">→</button>' +
        "</span>";

      li.querySelector(".mv-left").addEventListener("click", function () { move(i, i - 1); });
      li.querySelector(".mv-right").addEventListener("click", function () { move(i, i + 1); });
      li.querySelector(".rm").addEventListener("click", function () { removeAt(i); });
      ol.appendChild(li);
    });
    $("rotCount").textContent = S.rotation.length + " 步";
    bindDrag();
  }

  /* 拖曳排序。鍵盤使用者走每個晶片上的 ←／✕／→ 三顆鈕，功能完全等價
     （UX 準則：拖放一定要有鍵盤替代路徑）。 */
  function bindDrag() {
    var dragIndex = null;
    var ol = $("rotation");
    ol.querySelectorAll(".rot-row:not(.rot-head)").forEach(function (li) {
      li.addEventListener("dragstart", function (e) {
        dragIndex = +li.dataset.i;
        li.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(dragIndex)); } catch (err) { /* IE 之類 */ }
      });
      li.addEventListener("dragend", function () {
        li.classList.remove("dragging");
        ol.querySelectorAll(".rot-row:not(.rot-head)").forEach(function (x) { x.classList.remove("drop-before"); });
      });
      li.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        ol.querySelectorAll(".rot-row:not(.rot-head)").forEach(function (x) { x.classList.remove("drop-before"); });
        li.classList.add("drop-before");
      });
      li.addEventListener("drop", function (e) {
        e.preventDefault();
        var to = +li.dataset.i;
        if (dragIndex == null || dragIndex === to) return;
        S.undo.push(S.rotation.slice());
        var k = S.rotation.splice(dragIndex, 1)[0];
        S.rotation.splice(dragIndex < to ? to - 1 : to, 0, k);
        dragIndex = null;
        afterChange();
      });
    });
  }

  /* ── 模擬與結果 ───────────────────────────────────────────────── */

  function simulate() {
    readStats();
    renderEffLine();
    updateHqSum();
    renderRecipeDetail();
    renderContextBar();

    if (!S.recipe) {
      $("verdict").innerHTML = '<p class="note">先到「① 準備」選一個配方。</p>';
      $("bars").innerHTML = "";
      renderRotation(null);
      $("macroBoxes").innerHTML = "";
      lastPreview = null;
      refreshPalette(null, false);
      showResultBar(false);
      return;
    }

    var cfg = {
      recipe: S.recipe,
      stats: S.eff,
      rotation: S.rotation,
      linear: true,
      startingQuality: CraftEngine.startingQualityFrom(S.recipe, S.hqCounts),
    };
    var res = CraftEngine.run(cfg);
    lastResult = res;
    lastPreview = CraftEngine.previewNext(cfg);

    refreshPalette(lastPreview, res.status !== "ongoing");
    renderRotation(res);          // 循環清單本身就是逐步明細
    renderVerdict(res);
    renderBars(res);
    renderResultBar(res);
    renderMacro();
    $("relGrid").hidden = true;

    var skipped = res.steps.filter(function (s) { return s.skipped; }).length;
    $("resultAnnounce").textContent = S.rotation.length
      ? STATUS[res.status].label + "。" + (res.failCause ? res.failCause + "。" : "") +
        "作業 " + capP(res.progress) + " / " + S.recipe.progress +
        "，品質 " + capQ(res.quality) + "，HQ 機率 " + res.hqPercent + "%，共 " + res.usedSteps + " 步。" +
        (skipped ? "有 " + skipped + " 步沒用到。" : "")
      : "";
  }

  /* 成敗只由「耐久歸零前作業有沒有滿」決定，所以有三種狀態。
     排到一半的循環是「進行中」，不是失敗——把它畫成 ❌ 會讓人以為循環寫錯了。 */
  var STATUS = {
    done:    { icon: "✅", label: "製作完成", cls: "ok" },
    failed:  { icon: "❌", label: "製作失敗", cls: "bad" },
    ongoing: { icon: "🔨", label: "還在進行中", cls: "" },
  };

  function renderVerdict(res) {
    var el = $("verdict");
    if (!S.rotation.length) {
      el.innerHTML = '<p class="note">排幾個技能就會即時算出結果。</p>';
      return;
    }
    var st = STATUS[res.status] || STATUS.ongoing;
    var sub;
    if (res.status === "done") sub = S.recipe.hq ? "可產出 HQ" : "此配方不可 HQ";
    else if (res.status === "failed") sub = res.failCause;
    else sub = "作業還差 " + res.remainingProgress + "，耐久還剩 " + res.durability + "——還沒有結果";
    if (res.status === "done" && res.failCause) sub = res.failCause;   // 收藏品門檻沒過

    // 有步驟沒用到要講出來：作業提早做完、CP 不夠、等級不足都會讓後面整段變成空轉，
    // 只看「共 N 步」會以為循環照跑了
    var skipped = res.steps.filter(function (s) { return s.skipped; });
    if (skipped.length) {
      sub += "　⚠ 有 " + skipped.length + " 步沒用到（" + skipped[0].name + "：" + skipped[0].failCause + "）";
    }
    el.innerHTML =
      '<div class="verdict ' + st.cls + '">' +
        '<span class="verdict-icon" aria-hidden="true">' + st.icon + "</span>" +
        "<span><span class=\"verdict-text\">" + st.label + "</span><br>" +
        '<span class="verdict-sub">' + esc(sub) +
        "　共 " + res.usedSteps + " 步</span></span>" +
        (S.recipe.hq
          ? '<span class="hq-big"><b class="num">' + res.hqPercent + "%</b><span>HQ 機率</span></span>"
          : "") +
      "</div>";
  }

  /* 結果摘要條：結果本體在彈窗裡，但排技能時還是要有即時回饋。
     只在「排循環」分頁顯示（準備分頁跟製作過程無關）。 */
  function showResultBar(on) {
    $("resultBar").hidden = !on;
    document.body.classList.toggle("has-result-bar", on);
  }

  function renderResultBar(res) {
    showResultBar(S.tab === "craft" && !!S.recipe);
    if (!S.recipe) return;

    $("rbIcon").textContent = S.rotation.length ? (STATUS[res.status] || STATUS.ongoing).icon : "🔨";
    $("rbBars").innerHTML = [
      mini("作業", capP(res.progress), S.recipe.progress, "var(--c-progress)"),
      mini("品質", capQ(res.quality), S.recipe.quality, "var(--c-quality)"),
      mini("耐久", res.durability, S.recipe.durability, "var(--c-dur)"),
      mini("CP", res.cp, S.eff.cp, "var(--c-cp)"),
    ].join("");
    $("rbHq").innerHTML = S.recipe.hq
      ? res.hqPercent + "%<small>HQ 機率</small>"
      : '<small>不可 HQ</small>';

    function mini(label, v, max, color) {
      var p = max ? Math.min((v / max) * 100, 100) : 0;
      return '<div class="rb-item">' +
        '<span class="rb-label">' + label + "<b>" + v + " / " + max + "</b></span>" +
        '<span class="bar-track"><span class="bar-fill" style="width:' + p.toFixed(1) + "%;--bar-color:" + color + '"></span></span>' +
        "</div>";
    }
  }

  /* 情境列：不論在哪個分頁都看得到「現在在模擬什麼、用誰的數值」 */
  function renderContextBar() {
    var el = $("contextBar");
    if (!S.recipe) {
      el.innerHTML = '<span class="cb-empty">尚未選配方——到「① 準備」搜尋成品名稱。</span>';
      return;
    }
    // 這裡列的是**實際拿去模擬的數值**（吃補後），否則使用者會拿情境列的數字去對結果卻對不上
    var r = S.recipe, s = S.eff, boosted = s.craftsmanship !== S.stats.craftsmanship ||
      s.control !== S.stats.control || s.cp !== S.stats.cp;
    el.innerHTML =
      '<span class="cb-name">' + esc(r.name) + "</span>" +
      '<span class="cb-meta">' + esc(r.jobName) + " Lv" + r.lvl + (r.stars ? " " + "★".repeat(r.stars) : "") + "</span>" +
      '<span class="cb-meta">作業 ' + r.progress + " ／ 品質 " + r.quality + " ／ 耐久 " + r.durability + "</span>" +
      '<span class="cb-meta">你的' + esc(JOBS[S.statsJob]) + "：" + s.level + " 級 · 作業 " + s.craftsmanship +
        " · 加工 " + s.control + " · CP " + s.cp + (s.specialist ? " · 專家" : "") +
        (boosted ? " · 已含料理／藥品" : "") + "</span>";
  }

  function renderBars(res) {
    var r = S.recipe;
    $("bars").innerHTML = [
      bar("作業", capP(res.progress), r.progress, "var(--c-progress)"),
      bar("品質", capQ(res.quality), r.quality, "var(--c-quality)"),
      bar("耐久", res.durability, r.durability, "var(--c-dur)"),
      bar("CP", res.cp, S.eff.cp, "var(--c-cp)"),
    ].join("");

    function bar(label, v, max, color) {
      var pct = max ? Math.min((v / max) * 100, 100) : 0;
      return '<div class="bar-row">' +
        '<span class="bar-label">' + label + "</span>" +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + "%;--bar-color:" + color + '"></span></span>' +
        '<span class="bar-val num">' + v + " / " + max + "</span>" +
        "</div>";
    }
  }

  /* ── 隨機模擬 ─────────────────────────────────────────────────── */

  function runReliability() {
    if (!S.recipe || !S.rotation.length) return;
    var rel = CraftEngine.reliability({
      recipe: S.recipe, stats: S.eff, rotation: S.rotation,
      startingQuality: CraftEngine.startingQualityFrom(S.recipe, S.hqCounts),
    }, 200);
    var g = $("relGrid");
    g.hidden = false;
    /* 「完成率」很容易被讀成「成功率」或「HQ 率」，所以標籤直接寫成一句話，
       下面再補一行說明它什麼時候會低於 100%。 */
    g.innerHTML = [
      cell(rel.successPercent + "%", "200 次裡做完的比例"),
      cell(rel.hqAverage + "%", "HQ 平均"),
      cell(rel.hqMedian + "%", "HQ 中位"),
      cell(rel.hqMin + "–" + rel.hqMax + "%", "HQ 範圍"),
    ].join("") +
      '<p class="muted-sm rel-note">「做完」＝耐久歸零前作業填滿' +
      (S.recipe.requiredQuality ? "，收藏品還要過品質門檻 " + S.recipe.requiredQuality : "") +
      "。低於 100% 只有兩個原因：循環裡有會失敗的技能（高速製作／倉促／冒進），" +
      "或球色改變了耐久／CP 消耗而中途卡住。</p>";
    $("resultAnnounce").textContent = "隨機模擬 200 次：做完的比例 " + rel.successPercent +
      "%，HQ 平均 " + rel.hqAverage + "%。";

    function cell(v, label) {
      return '<div class="rel-cell"><b class="num">' + v + "</b><span>" + label + "</span></div>";
    }
  }

  /* ── 自動求解 ─────────────────────────────────────────────────────
     搜尋在 craft-solver.js。這裡只負責：開始／取消、進度回饋、把結果放進循環。
     **刻意不用 Web Worker**——本站要能用 file:// 直接開檔驗收，而 file:// 下
     Worker 會被瀏覽器擋掉。求解器改成一層一層讓出主執行緒，畫面不會凍住。 */

  var solveHandle = null;

  function setSolveProgress(pct, label, tried) {
    $("solveFill").style.width = pct + "%";
    $("solveBar").setAttribute("aria-valuenow", String(pct));
    $("solveMsg").textContent = label + (tried ? "　已試 " + tried.toLocaleString("zh-TW") + " 種組合" : "");
  }

  function endSolveUi() {
    solveHandle = null;
    $("solveBtn").disabled = false;
    $("solveCancel").hidden = true;
  }

  function startSolve() {
    if (solveHandle) return;
    if (!S.recipe) {
      $("resultAnnounce").textContent = "還沒選配方，無法求解。";
      showTab("setup");
      return;
    }
    readStats();
    $("solveBtn").disabled = true;
    $("solveCancel").hidden = false;
    $("solverProg").hidden = false;
    setSolveProgress(0, "開始求解…");

    solveHandle = CraftSolver.solve({
      recipe: S.recipe,
      stats: S.eff,
      actions: DB.actionList,
      startingQuality: CraftEngine.startingQualityFrom(S.recipe, S.hqCounts),
    }, { onProgress: setSolveProgress, onDone: onSolved });
  }

  function cancelSolve() {
    if (solveHandle) solveHandle.cancel();
  }

  function onSolved(out) {
    endSolveUi();
    var secs = (out.ms / 1000).toFixed(1);

    if (!out.rotation) {
      $("solveMsg").textContent = "找不到做得完的循環（試了 " +
        out.tried.toLocaleString("zh-TW") + " 種組合，" + secs + " 秒）。";
      $("resultAnnounce").textContent =
        "求解失敗：這個配方用目前的數值排不出做得完的循環。可以先提高作業精度，或吃料理／藥品補 CP。";
      return;
    }

    S.undo.push(S.rotation.slice());
    S.rotation = out.rotation.slice();
    afterChange();

    var res = out.result;
    // 取消也會回傳「到目前為止最好的一組」——那仍然是可用的答案，只是還沒搜完
    var partial = out.reason === "cancelled" ? "（中途取消，這是當下最好的一組）" :
                  out.reason === "timeout" ? "（時間到，這是當下最好的一組）" : "";
    var msg = "解出 " + out.steps + " 步：品質 " + capQ(res.quality) + " / " + S.recipe.quality +
              "、HQ " + res.hqPercent + "%，用了 " + secs + " 秒" + partial + "。";
    setSolveProgress(100, msg);
    $("resultAnnounce").textContent = msg + "循環已換成求解結果，按「↶ 復原」可以還原。";
  }

  /* ── 巨集 ─────────────────────────────────────────────────────── */

  // 增益系 2 秒、其餘 3 秒（快速改革例外，動作較長）
  function waitOf(a) {
    if (a.key === "quickInnovation") return 3;
    if (a.type === "buff" || a.key === "manipulation") return 2;
    return 3;
  }

  /* 遊戲一個巨集上限 15 行。超過就切段，而且**每段各自一個 textarea 與複製鈕**——
     全部塞同一個框，使用者得自己挑行貼，很容易貼錯段或漏掉一行。 */
  function renderMacro() {
    var wrap = $("macroBoxes");
    wrap.innerHTML = "";
    if (!S.rotation.length) {
      wrap.innerHTML = '<p class="muted-sm" style="margin-top:0.5rem">循環還是空的。</p>';
      return;
    }

    var notify = $("macroNotify").checked;
    var perMacro = notify ? 14 : 15;      // 開提示時留一行給 /echo
    /* 技能名**不加雙引號**：那是英文客戶端為了處理名稱裡的空白才需要的，
       台服的技能名沒有空白，加了引號反而不是遊戲內的寫法。
       名稱取**實際發動的那一招**（倉促在工匠的良機下會變冒進）——巨集寫得愈明確愈不會出事。 */
    var lines = S.rotation.map(function (k, i) {
      var step = lastResult && lastResult.steps[i];
      var a = DB.byKey[(step && step.key) || k];
      return "/ac " + a.name + " <wait." + waitOf(a) + ">";
    });

    var segs = [];
    for (var i = 0; i < lines.length; i += perMacro) segs.push(lines.slice(i, i + perMacro));

    segs.forEach(function (chunk, i) {
      var body = chunk.slice();
      if (notify) {
        body.push(segs.length > 1
          ? "/echo 第 " + (i + 1) + " 段完成（共 " + segs.length + " 段）<se.1>"
          : "/echo 製作完成 <se.1>");
      }
      var text = body.join("\n");
      var multi = segs.length > 1;

      var box = document.createElement("div");
      box.className = "macro-seg";

      var head = document.createElement("div");
      head.className = "macro-seg-head";
      var h = document.createElement("h3");
      h.textContent = multi ? "巨集 " + (i + 1) + " / " + segs.length : "巨集";
      var meta = document.createElement("span");
      meta.className = "muted-sm";
      meta.textContent = body.length + " 行";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = multi ? "複製第 " + (i + 1) + " 段" : "複製巨集";
      btn.addEventListener("click", function () { copyText(text, btn); });
      head.appendChild(h);
      head.appendChild(meta);
      head.appendChild(btn);

      var ta = document.createElement("textarea");
      ta.readOnly = true;
      ta.rows = body.length;
      ta.value = text;
      ta.setAttribute("aria-label", multi
        ? "巨集第 " + (i + 1) + " 段，共 " + segs.length + " 段"
        : "巨集文字");
      // 點一下就整段選起來，不用手動拖曳
      ta.addEventListener("focus", function () { ta.select(); });

      box.appendChild(head);
      box.appendChild(ta);
      wrap.appendChild(box);
    });
  }

  /* ── 循環庫：內建範本 ＋ 我的循環 ────────────────────────────────
     兩者合併成同一個下拉（分兩個 optgroup），因為使用者要做的事是同一件：
     「把某一份現成的循環拿來用」。分成兩個選單只會讓工具列更擠。
     值的格式：範本＝"t<index>"、我的循環＝"r<index>"。 */

  function restoreRotations() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_ROTS) || "null");
      if (raw && Array.isArray(raw.list)) S.rots = raw.list;
    } catch (e) { S.rots = []; }
  }

  function saveRotations() {
    try {
      localStorage.setItem(LS_ROTS, JSON.stringify({ v: 1, list: S.rots }));
    } catch (e) {
      setRotHint("存不進本機儲存空間（可能是私密視窗或空間已滿），這次的循環只在本頁有效。");
    }
  }

  function renderTemplates() {
    var sel = $("templateSelect");
    var keep = sel.value;
    sel.innerHTML = "";

    var g1 = document.createElement("optgroup");
    g1.label = "內建範本";
    TEMPLATES.forEach(function (t, i) {
      var o = document.createElement("option");
      o.value = "t" + i;
      o.textContent = t.name;
      o.title = t.note;
      g1.appendChild(o);
    });
    sel.appendChild(g1);

    if (S.rots.length) {
      var g2 = document.createElement("optgroup");
      g2.label = "我的循環（" + S.rots.length + "）";
      S.rots.forEach(function (r, i) {
        var o = document.createElement("option");
        o.value = "r" + i;
        o.textContent = r.name + "（" + r.rotation.length + " 步）";
        o.title = (r.recipeName ? "存的時候是：" + r.recipeName + "\n" : "") + r.at;
        g2.appendChild(o);
      });
      sel.appendChild(g2);
    }
    if (keep) sel.value = keep;
    if (!sel.value) sel.selectedIndex = 0;
    syncLibButtons();
  }

  // 刪除鈕只在選到「我的循環」時才出現——內建範本刪不得，長期擺一顆按不了的鈕是噪音
  function syncLibButtons() {
    var v = $("templateSelect").value;
    $("deleteRotation").hidden = v.charAt(0) !== "r";
  }

  function setRotHint(text, undoLabel) {
    var el = $("rotLibHint");
    el.innerHTML = esc(text || "");
    if (!undoLabel) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.style.marginLeft = "0.4rem";
    b.textContent = undoLabel;
    b.addEventListener("click", undoRotDelete);
    el.appendChild(b);
  }

  function applyTemplate() {
    var v = $("templateSelect").value;
    var isMine = v.charAt(0) === "r";
    var item = isMine ? S.rots[+v.slice(1)] : TEMPLATES[+v.slice(1)];
    if (!item) return;

    S.undo.push(S.rotation.slice());
    S.rotation = item.rotation.slice();

    // 存的時候是哪個配方就切回哪個——不然套進來的循環會對著另一個配方算，數字全錯
    var switched = "";
    if (isMine && item.recipeId && (!S.recipe || S.recipe.id !== item.recipeId)) {
      var hit = DB.index.find(function (r) { return r.id === item.recipeId; });
      if (hit) {
        selectRecipe(hit.i, true);
        switched = "，並切回配方「" + S.recipe.name + "」";
      } else {
        switched = "，但存檔裡的配方已經找不到了（可能是版本閘門擋掉），請自己重選";
      }
    }
    afterChange();
    var msg = (isMine ? "已套用「" + item.name + "」" : "已套用範本：" + item.name) + switched + "。";
    setRotHint(msg);
    $("resultAnnounce").textContent = msg + (isMine ? "" : item.note);
  }

  function saveRotation() {
    if (!S.rotation.length) { setRotHint("目前循環是空的，沒有東西可以存。"); return; }
    var dflt = (S.recipe ? S.recipe.name : "循環") + "（" + S.rotation.length + " 步）";
    var name = window.prompt("這份循環要叫什麼名字？", dflt);
    if (name === null) return;                       // 取消
    name = name.trim() || dflt;

    var idx = -1;
    for (var i = 0; i < S.rots.length; i++) if (S.rots[i].name === name) { idx = i; break; }
    if (idx >= 0 && !window.confirm("「" + name + "」已經存在，要覆蓋嗎？")) return;

    var entry = {
      name: name,
      recipeId: S.recipe ? S.recipe.id : null,
      recipeName: S.recipe ? S.recipe.name : null,
      rotation: S.rotation.slice(),
      at: new Date().toISOString().slice(0, 10),
    };
    if (idx >= 0) S.rots[idx] = entry;
    else {
      S.rots.unshift(entry);
      if (S.rots.length > ROTS_MAX) S.rots.length = ROTS_MAX;
    }
    saveRotations();
    renderTemplates();
    $("templateSelect").value = "r" + (idx >= 0 ? idx : 0);
    syncLibButtons();
    setRotHint("已存成「" + name + "」。存在這台電腦的瀏覽器裡，首頁的「全站備份」會一起帶走。");
    $("resultAnnounce").textContent = "已儲存循環「" + name + "」。";
  }

  /* 刪除是不可逆的，所以照全站慣例：先 confirm（訊息裡講清楚刪的是哪一份），
     刪完再留一顆復原鈕。 */
  var rotUndo = null;

  function deleteRotation() {
    var v = $("templateSelect").value;
    if (v.charAt(0) !== "r") return;
    var i = +v.slice(1), item = S.rots[i];
    if (!item) return;
    if (!window.confirm("要刪掉「" + item.name + "」嗎？\n\n" +
        (item.recipeName ? "配方：" + item.recipeName + "\n" : "") +
        "步數：" + item.rotation.length + "　存檔日：" + item.at + "\n\n刪除後可以按「復原刪除」救回來。")) return;

    rotUndo = { index: i, item: item };
    S.rots.splice(i, 1);
    saveRotations();
    renderTemplates();
    setRotHint("已刪除「" + item.name + "」。", "↶ 復原刪除");
    $("resultAnnounce").textContent = "已刪除循環「" + item.name + "」。";
  }

  function undoRotDelete() {
    if (!rotUndo) return;
    S.rots.splice(Math.min(rotUndo.index, S.rots.length), 0, rotUndo.item);
    saveRotations();
    renderTemplates();
    setRotHint("已復原「" + rotUndo.item.name + "」。");
    rotUndo = null;
  }

  /* ── 結果彈窗 ─────────────────────────────────────────────────── */

  var modalOpener = null;

  function openResultModal() {
    if (!S.recipe) return;
    modalOpener = document.activeElement;
    $("resultModal").hidden = false;
    $("closeResult").focus();
    document.addEventListener("keydown", modalKeydown);
  }

  function closeResultModal() {
    $("resultModal").hidden = true;
    document.removeEventListener("keydown", modalKeydown);
    if (modalOpener && modalOpener.focus) modalOpener.focus();
    modalOpener = null;
  }

  // Esc 關閉；Tab 在彈窗內循環（不讓焦點跑到背景的技能面板去）
  function modalKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); closeResultModal(); return; }
    if (e.key !== "Tab") return;
    var f = $("resultModal").querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ── 網址與本機儲存 ───────────────────────────────────────────── */

  function writeHash() {
    if (!S.recipe) return;
    var idx = S.rotation.map(function (k) {
      return DB.actionList.findIndex(function (a) { return a.key === k; });
    }).filter(function (i) { return i >= 0; });
    var hash = "#r=" + S.recipe.id + (idx.length ? "&a=" + idx.join(".") : "") +
      (S.tab && S.tab !== "craft" ? "&t=" + S.tab : "");
    history.replaceState(null, "", hash);
  }

  function readHash() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return null;
    var p = {};
    h.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > 0) p[kv.slice(0, i)] = kv.slice(i + 1);
    });
    if (!p.r) return null;
    var rotation = (p.a || "").split(".").filter(Boolean).map(function (i) {
      var a = DB.actionList[+i];
      return a ? a.key : null;
    }).filter(Boolean);
    var tab = ["setup", "craft", "about"].indexOf(p.t) >= 0 ? p.t : null;
    return { recipeId: parseInt(p.r, 10), rotation: rotation, tab: tab };
  }

  function saveLast() {
    try {
      localStorage.setItem(LS_LAST, JSON.stringify({
        recipeId: S.recipe ? S.recipe.id : null,
        rotation: S.rotation,
      }));
    } catch (e) { /* 私密視窗等 */ }
  }

  function readLast() {
    try {
      var raw = localStorage.getItem(LS_LAST);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = "已複製 ✓";
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();

    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* 使用者自行複製 */ }
      document.body.removeChild(ta);
    }
  }

  /* ── 說明 ─────────────────────────────────────────────────────── */

  function renderNotes() {
    $("notesBody").innerHTML = [
      "<p><strong>公式與常數的來源。</strong>遊戲客戶端沒有把技能效率、增益倍率、作業狀態機率寫進可讀的資料表，",
      "本站的規則移植自 <a href=\"https://github.com/ffxiv-teamcraft/simulator\" target=\"_blank\" rel=\"noopener\">Teamcraft 模擬器</a>（MIT），",
      "並以該專案的官方測試案例逐項回歸（<code>node scripts/validate-craft-sim.mjs</code>）。",
      "技能的 CP 與解鎖等級另外對 XIVAPI 的 CraftAction／Action 表校驗過，0 處不符。</p>",

      "<p><strong>技能名稱是台服官方用字</strong>，取自 Teamcraft 的台服語系檔（<code>tw-craft-actions</code>／<code>tw-actions</code>），",
      "不是簡轉繁。作業狀態的「高品質、最高品質、結實、安定、高效、長持續、大進展」同樣是官方字串（出自技能與道具說明）；",
      "另外四種狀態台服字串目前查不到，本頁不硬翻，改以效果描述當標籤（一般、品質下降、下次高品質、耐久強固）。</p>",

      "<p><strong>理想模式與隨機模擬的差別。</strong>上方的即時結果是「理想模式」：技能必定成功、作業狀態恆為一般——",
      "適合比較兩套循環的骨架。按「跑 200 次」才會擲骰，倉促／冒進／高速製作的失敗率與高品質球都會出現，",
      "看到的完成率與 HQ 分佈才是實戰值。</p>",

      "<p><strong>配方只列台服已開放的。</strong>版本閘門走全站唯一來源 <code>data/_meta.json</code> 的 gamePatch（目前 ",
      esc(DB.gamePatch), "），成品查不到繁中名的也不列。工會工坊與無人島的配方不是用製作技能做的，不在此列。</p>",

      "<p><strong>內建範本</strong>都是先用引擎在指定數值下實跑過、確定做得完才收進來（滑到選單上可看驗證條件）。",
      "套到你自己的配方後成不成立，直接看右邊的模擬結果。",
      "自己排出來的循環可以按「💾 儲存」收進<strong>我的循環</strong>，跟範本在同一個下拉裡；",
      "存的是這台電腦的瀏覽器（<code>ffxiv_craftsim_rotations</code>），首頁的「全站備份」會一起帶走。</p>",

      "<p><strong>自動求解</strong>會照你目前的數值排一串做得完、品質盡量高的循環。它<strong>只用必定成功、",
      "不吃球色的技能</strong>——高速製作／倉促／冒進（成功率不到 100%）與集中製作／集中加工／秘訣（要高品質球）",
      "一律不排，因為解出來的東西是要貼進遊戲照跑的，靠運氣的循環等於沒解。",
      "求解分兩階段（先把作業推到差一招、再堆品質），中途可以取消，取消也會拿到當下最好的那一組。</p>",

      "<p><strong>料理／藥品</strong>的加成是「基礎值 × 百分比，但不超過上限」，而且料理與藥品<strong>各自從基礎值算</strong>再相加。",
      "所以工匠數值那四格請填<strong>沒吃補</strong>的原始值，選了料理之後看下面那行實際數值。",
      "清單只列台服已開放、且查得到繁中名的品項。</p>",
    ].join("");
  }

  /* ── 事件 ─────────────────────────────────────────────────────── */

  function bindEvents() {
    $("recipeSearch").addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(search, 150);
    });
    $("levelMin").addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(search, 150);
    });

    ["statLevel", "statCraftsmanship", "statControl", "statCp"].forEach(function (id) {
      $(id).addEventListener("input", simulate);
    });
    ["statSpecialist", "statRelic"].forEach(function (id) {
      $(id).addEventListener("change", simulate);
    });

    $("clearBtn").addEventListener("click", function () {
      if (!S.rotation.length) return;
      S.undo.push(S.rotation.slice());
      S.rotation = [];
      afterChange();
    });
    $("undoBtn").addEventListener("click", function () {
      if (!S.undo.length) return;
      S.rotation = S.undo.pop();
      simulate();
      saveLast();
      writeHash();
    });
    $("applyTemplate").addEventListener("click", applyTemplate);
    $("templateSelect").addEventListener("change", syncLibButtons);
    $("saveRotation").addEventListener("click", saveRotation);
    $("deleteRotation").addEventListener("click", deleteRotation);
    $("solveBtn").addEventListener("click", startSolve);
    $("solveCancel").addEventListener("click", cancelSolve);

    // 換料理／藥品要重算加成；勾 HQ 還會改下拉裡的數字，所以要整個重畫一次
    ["foodSelect", "medSelect"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        simulate();
        syncHqToggles();
        $("resultAnnounce").textContent = $("effLine").textContent;
      });
    });
    ["foodHq", "medHq"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        readStats();
        renderConsumables();
        simulate();
      });
    });

    $("relBtn").addEventListener("click", runReliability);
    $("macroNotify").addEventListener("change", renderMacro);
    $("statsJob").addEventListener("change", function () { setStatsJob(+this.value, false); simulate(); });
    $("copyStatsAll").addEventListener("click", copyStatsToAllJobs);
    $("shareBtn").addEventListener("click", function () {
      writeHash();
      copyText(location.href, this);
    });
    $("goCraft").addEventListener("click", function () {
      showTab("craft");
      var t = document.querySelector("#t-craft");
      if (t) t.focus();
    });
    $("openResult").addEventListener("click", openResultModal);
    $("closeResult").addEventListener("click", closeResultModal);
    $("resultModal").addEventListener("click", function (e) {
      if (e.target === $("resultModal")) closeResultModal();   // 點遮罩關閉
    });
    // 捲動時浮層會跟不上按鈕，直接收掉
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("resize", sizeCraftPanes);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
})();
