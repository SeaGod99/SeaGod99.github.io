/* 製作模擬器 — 畫面與互動（規則在 craft-engine.js）
 *
 * 資料：
 *   data/craft-actions.json   技能表（繁中名／CP／等級／效率）＋等級對照＋HQ 對照
 *   data/craft-recipes.json   配方（欄位名在 columns，數值壓成陣列列）＋ rlvl 除數表
 *   data/items-lite.json      id → 繁中名（成品與材料名稱）
 *   data/_meta.json           gamePatch（台服版本閘門，走共用的 patch-gate.js）
 *
 * 台服未開放的配方一律不顯示：patch > gamePatch，或成品在 items-lite 查無繁中名。
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var JOBS = { 8: "刻木匠", 9: "鍛鐵匠", 10: "鑄甲匠", 11: "雕金匠", 12: "製革匠", 13: "裁衣匠", 14: "煉金術士", 15: "烹調師" };

  var LS_STATS = "ffxiv_craftsim_stats";
  var LS_LAST = "ffxiv_craftsim_last";

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
    jobStats: {},         // jobId → 數值
    stats: null,          // ＝ jobStats[statsJob]，引擎直接吃這個參考
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
  ]).then(function (res) {
    DB.actions = res[0];
    DB.recipes = res[1];
    DB.names = new Map(res[2].data);
    DB.gamePatch = res[3];
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
    } else if (raw && raw.level != null) {
      JOB_IDS.forEach(function (id) { Object.assign(S.jobStats[id], raw); });
    }
    S.stats = S.jobStats[S.statsJob];
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
    saveStats();
  }

  function saveStats() {
    try {
      localStorage.setItem(LS_STATS, JSON.stringify({ v: 2, lastJob: S.statsJob, jobs: S.jobStats }));
    } catch (e) { /* 私密視窗等：僅本次有效 */ }
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
    if (r.craftsmanshipReq && S.stats.craftsmanship < r.craftsmanshipReq) {
      tags.push('<span class="tag tag-warn num">需作業精度 ' + r.craftsmanshipReq + "</span>");
    }
    if (r.controlReq && S.stats.control < r.controlReq) {
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

  var GROUPS = [
    { title: "作業（推進度）", match: function (a) { return a.type === "progress"; } },
    { title: "加工（提品質）", match: function (a) { return a.type === "quality"; } },
    { title: "增益與修復", match: function (a) { return a.type === "buff" || a.type === "repair"; } },
    { title: "其他", match: function (a) { return a.type === "other" || a.type === "cp"; } },
  ];

  function renderPalette() {
    var wrap = $("palette");
    wrap.innerHTML = "";
    GROUPS.forEach(function (g) {
      var list = DB.actionList.filter(g.match).sort(function (a, b) { return a.level - b.level; });
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
  function refreshPalette(preview, ended) {
    // 製作已經結束時，每顆按鈕都標「不可用」只是噪音——改成整張卡一句話
    $("paletteNote").textContent = ended
      ? "這串循環已經有結果了，再接技能不會生效。要繼續試就先刪掉後面幾步。"
      : "";
    $("paletteNote").hidden = !ended;

    document.querySelectorAll(".skill").forEach(function (b) {
      var a = DB.byKey[b.dataset.key];
      var p = preview && preview[a.key];

      var lockedFor = null;
      if (a.level > S.stats.level) lockedFor = "🔒 Lv" + a.level;
      else if ((a.flags || []).indexOf("specialist") >= 0 && !S.stats.specialist) lockedFor = "🔒 需專家";

      var blocked = !ended && !!(p && !p.usable);
      var flag = "";
      if (lockedFor) flag = lockedFor;
      else if (blocked) flag = "⚠ " + p.reason;
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
    } else if (a.level > S.stats.level) {
      live = '<span class="no">等級不足，需 ' + a.level + " 級</span>";
    } else if (p && !p.usable) {
      live = '<span class="no">接在目前循環後：不可用（' + esc(p.reason) + "）</span>";
    } else if (p) {
      var bits = [];
      if (p.combo) bits.push('<span class="combo">連段成立</span>');
      if (p.addedProgress) bits.push('作業 <span class="ok">+' + p.addedProgress + "</span>");
      if (p.addedQuality) bits.push('品質 <span class="ok">+' + p.addedQuality + "</span>");
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
      "<span>狀態</span><span class=\"rot-ctl\"></span>";
    ol.appendChild(head);

    S.rotation.forEach(function (key, i) {
      var a = DB.byKey[key];
      var step = res && res.steps[i];
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
        var cond = CraftEngine.CONDITIONS[step.state] || CraftEngine.CONDITIONS[1];
        cells = '<span class="rot-cells">' +
          '<span class="rot-cell rot-delta-p">' + (step.addedProgress ? "+" + step.addedProgress : "—") +
            "<br><small>" + step.after.progress + "</small></span>" +
          '<span class="rot-cell rot-delta-q">' + (step.addedQuality ? "+" + step.addedQuality : "—") +
            "<br><small>" + step.after.quality + "</small></span>" +
          '<span class="rot-cell">' + step.after.durability + "</span>" +
          '<span class="rot-cell">' + step.after.cp + "</span>" +
          "</span>" +
          '<span class="cond cond-' + cond.tone + '" title="' + esc(cond.desc) + '">' + esc(cond.name) + "</span>";
      }

      li.innerHTML =
        '<span class="rot-idx">' + (i + 1) + "</span>" +
        '<span class="rot-name">' + esc(a.name) + (step && step.combo ? " ▶" : "") + "</span>" +
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
      stats: S.stats,
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
        "作業 " + res.progress + " / " + S.recipe.progress +
        "，品質 " + res.quality + "，HQ 機率 " + res.hqPercent + "%，共 " + res.usedSteps + " 步。" +
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
      mini("作業", res.progress, S.recipe.progress, "var(--c-progress)"),
      mini("品質", res.quality, S.recipe.quality, "var(--c-quality)"),
      mini("耐久", res.durability, S.recipe.durability, "var(--c-dur)"),
      mini("CP", res.cp, S.stats.cp, "var(--c-cp)"),
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
    var r = S.recipe, s = S.stats;
    el.innerHTML =
      '<span class="cb-name">' + esc(r.name) + "</span>" +
      '<span class="cb-meta">' + esc(r.jobName) + " Lv" + r.lvl + (r.stars ? " " + "★".repeat(r.stars) : "") + "</span>" +
      '<span class="cb-meta">作業 ' + r.progress + " ／ 品質 " + r.quality + " ／ 耐久 " + r.durability + "</span>" +
      '<span class="cb-meta">你的' + esc(JOBS[S.statsJob]) + "：" + s.level + " 級 · 作業 " + s.craftsmanship +
        " · 加工 " + s.control + " · CP " + s.cp + (s.specialist ? " · 專家" : "") + "</span>";
  }

  function renderBars(res) {
    var r = S.recipe;
    $("bars").innerHTML = [
      bar("作業", res.progress, r.progress, "var(--c-progress)"),
      bar("品質", res.quality, r.quality, "var(--c-quality)"),
      bar("耐久", res.durability, r.durability, "var(--c-dur)"),
      bar("CP", res.cp, S.stats.cp, "var(--c-cp)"),
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
      recipe: S.recipe, stats: S.stats, rotation: S.rotation,
      startingQuality: CraftEngine.startingQualityFrom(S.recipe, S.hqCounts),
    }, 200);
    var g = $("relGrid");
    g.hidden = false;
    g.innerHTML = [
      cell(rel.successPercent + "%", "完成率"),
      cell(rel.hqAverage + "%", "HQ 平均"),
      cell(rel.hqMedian + "%", "HQ 中位"),
      cell(rel.hqMin + "–" + rel.hqMax + "%", "HQ 範圍"),
    ].join("");
    $("resultAnnounce").textContent = "隨機模擬 200 次：完成率 " + rel.successPercent +
      "%，HQ 平均 " + rel.hqAverage + "%。";

    function cell(v, label) {
      return '<div class="rel-cell"><b class="num">' + v + "</b><span>" + label + "</span></div>";
    }
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
    var lines = S.rotation.map(function (k) {
      var a = DB.byKey[k];
      return '/ac "' + a.name + '" <wait.' + waitOf(a) + ">";
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

  /* ── 範本 ─────────────────────────────────────────────────────── */

  function renderTemplates() {
    var sel = $("templateSelect");
    sel.innerHTML = "";
    TEMPLATES.forEach(function (t, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = t.name;
      o.title = t.note;
      sel.appendChild(o);
    });
  }

  function applyTemplate() {
    var t = TEMPLATES[+$("templateSelect").value];
    if (!t) return;
    S.undo.push(S.rotation.slice());
    S.rotation = t.rotation.slice();
    afterChange();
    $("resultAnnounce").textContent = "已套用範本：" + t.name + "。" + t.note;
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
      "套到你自己的配方後成不成立，直接看右邊的模擬結果。</p>",
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
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
})();
