/* 水神的工具箱 — 全站跨工具快速切換器（命令面板）
 *
 * 由 theme.js 以相對路徑載入（相容 file:// 與線上）。開啟方式：
 *   - 鍵盤 "/"（游標不在輸入框時）或 Ctrl/⌘ + K
 *   - 點左下角的浮動 🔍 鈕（行動裝置用）
 * 面板內：打字即時過濾、↑/↓ 選擇、Enter 前往、Esc 關閉、點背景關閉。
 *
 * 站根相對路徑取自 window.__SGT_ROOT__（theme.js 設定，如 "../../"）。
 * 各工具路徑以站根為基準；外部連結用絕對 URL 並另開分頁。
 */
(function () {
  'use strict';

  var ROOT = (window.__SGT_ROOT__ != null ? window.__SGT_ROOT__ : './');

  // 工具清單（對應首頁卡片）。ext:true = 外部連結。
  var TOOLS = [
    // 日常工具（c:'daily'）
    { e: '⏱️', n: '現在能做什麼', p: 'tools/now/', c: 'daily', k: 'now todo 現在 時間窗 限時 目標魚 追蹤節點 探索筆記 倒數 開窗' },
    { e: '⛅', n: '艾歐澤亞天氣預報', p: 'tools/weather/', c: 'daily', k: 'weather tianqi 天氣 預報 天氣鏈' },
    { e: '📖', n: '天書奇談計算器', p: 'tools/wondrous-tails/', c: 'daily', k: 'wondrous tails 天書 奇談 連線' },
    { e: '🎰', n: '仙人微彩計算機', p: 'tools/cactpot/', c: 'daily', k: 'cactpot 仙人 微彩 金碟' },
    { e: '⛏️', n: '限時採集節點查詢', p: 'tools/gathering/', c: 'daily', k: 'gathering 採集 傳說 稀有 節點' },
    { e: '🌬️', n: '風脈泉追蹤器', p: 'tools/aether-currents/', c: 'daily', k: 'aether currents 風脈泉 風脈' },
    { e: '🦊', n: '幻巧戰助手', p: 'tools/faux-hollows/', c: 'daily', k: 'faux hollows 幻巧戰 狐狸' },
    { e: '👗', n: '時尚品鑑推薦', p: 'tools/fashion-report/', c: 'daily', k: 'fashion report 時尚 品鑑 染色' },
    { e: '👘', n: '幻化配裝圖鑑', p: 'tools/glamour/', c: 'daily', k: 'glamour 幻化 配裝 mirapri 套裝' },
    { e: '🗝️', n: '系統解鎖索引', p: 'tools/unlock-index/', c: 'daily', k: 'unlock 解鎖 開放 前置 任務 行會 職業 轉職 靈魂水晶 quest guild job class 怎麼開 開不了' },
    { e: '🎰', n: '金碟獎品價目表', p: 'tools/gold-saucer/', c: 'daily', k: 'gold saucer mgp 金碟 獎品 價目 兌換 金碟幣 金碟聲譽 仙人微彩 幻卡 缺口 預算' },
    { e: '🔤', n: '物品名稱翻譯', p: 'tools/name-translator/', c: 'daily', k: 'translate 翻譯 物品名 英文 日文 簡中 繁中 對照 name 查名字 攻略' },
    { e: '📘', n: '技能辭典', p: 'tools/action-codex/', c: 'battle', k: 'action codex 技能 辭典 特性 狀態 說明 威力 buff debuff' },
    { e: '📜', n: '巨集轉譯', p: 'tools/macro-translator/', c: 'daily', k: 'macro 巨集 轉譯 技能名 英文 日文 攻略 /ac 複製 貼上' },
    // 收藏 / 成就（c:'collect'）
    { e: '🐎', n: '坐騎收藏追蹤', p: 'collections/mounts/', c: 'collect', k: 'mount 坐騎 收藏' },
    { e: '🐣', n: '寵物收藏追蹤', p: 'minions/', c: 'collect', k: 'minion 寵物 收藏' },
    { e: '🎵', n: '樂譜收藏追蹤', p: 'collections/orchestrion/', c: 'collect', k: 'orchestrion 樂譜 演奏團' },
    { e: '💃', n: '表情收藏追蹤', p: 'collections/emotes/', c: 'collect', k: 'emote 表情 動作' },
    { e: '💇', n: '髮型收藏追蹤', p: 'collections/hairstyles/', c: 'collect', k: 'hairstyle 髮型 樣式書' },
    { e: '🌂', n: '時尚配飾收藏追蹤', p: 'collections/ornaments/', c: 'collect', k: 'ornament fashion accessory 配飾 時尚配飾 陽傘 洋傘 背包 火炬' },
    { e: '🦜', n: '鳥鞍收藏追蹤', p: 'collections/barding/', c: 'collect', k: 'barding 鳥鞍 陸行鳥' },
    { e: '👁️', n: '探索筆記追蹤器', p: 'collections/exploration-log/', c: 'collect', k: 'sightseeing 探索筆記 景觀' },
    { e: '🗡️', n: '討伐筆記追蹤', p: 'collections/hunting-log/', c: 'collect', k: 'hunting log 討伐筆記 怪物 monster note 經驗' },
    { e: '💙', n: '青魔法術收藏', p: 'collections/blue-magic/', c: 'collect', k: 'blue magic 青魔 法術' },
    { e: '🃏', n: '幻卡追蹤', p: 'collections/triple-triad/', c: 'collect', k: 'triple triad 幻卡' },
    // 戰鬥 / 副本（c:'battle'）
    { e: '🗺️', n: '主線進度', p: 'tools/msq/', c: 'battle', k: 'msq main scenario 主線 劇情 進度 還剩幾個 章節' },
    { e: '⚔️', n: '副本圖鑑', p: 'tools/duty-codex/', c: 'battle', k: 'duty dungeon raid trial 副本 迷宮挑戰 討伐殲滅戰 大型任務 零式 極 絕 深層迷宮 時限 同步 解鎖' },
    { e: '🛥️', n: '潛水艇航點查詢', p: 'tools/submarine/', c: 'battle', k: 'submarine 潛水艇 航點 部件 探索 部隊 桶 索敵 回收' },
    { e: '📖', n: '文書跑圖', p: 'tools/relic-note/', c: 'battle', k: 'relic note 文書 遺產武器 神典 跑圖 討伐 fate 理符 火天 水天 風天 土天' },
    { e: '🤝', n: '部族聲望試算', p: 'tools/beast-tribes/', c: 'battle', k: 'beast tribe 部族 蠻族 聲望 每日任務 階級 誓約 盟友 幣' },
    { e: '🏰', n: '冒險者小隊計算機', p: 'tools/squadron/', c: 'battle', k: 'squadron 小隊 派遣' },
    { e: '🛡️', n: '配裝規劃器（外部）', u: 'https://gearing.ffsusu.com/', c: 'battle', k: 'gearing 配裝 規劃', ext: true },
    // 生活職（c:'life'）
    { e: '📊', n: '市場查價 + 比價', p: 'tools/market/', c: 'life', k: 'market 市場 查價 universalis 比價' },
    { e: '🏪', n: 'NPC 商店目錄', p: 'tools/npc-shops/', c: 'life', k: 'npc shop vendor 商店 雜貨 販售 目錄 這張圖有什麼店 買東西' },
    { e: '🛡️', n: '練級裝備路線', p: 'tools/leveling-gear/', c: 'battle', k: 'leveling gear 練級 裝備 品級 ilvl 部位 換裝' },
    { e: '📜', n: '製作理符試算', p: 'tools/leves/', c: 'life', k: 'leve levequest 理符 製作理符 委託 配額 經驗 練級' },
    { e: '💎', n: '禁忌鑲嵌花費試算', p: 'tools/melding/', c: 'life', k: 'melding materia 鑲嵌 禁忌 魔晶石 成功率 期望值 花費' },
    { e: '🔨', n: '製作模擬器', p: 'tools/crafting-sim/', c: 'life', k: 'crafting sim 製作 模擬 巨集 macro 循環 rotation 手法 hq' },
    { e: '🎖️', n: '貨幣變現排行', p: 'tools/gc-exchange/', c: 'life', k: 'gc seals 軍票 詩學 神典石 工票 紫票 橙票 狼印 戰績 雙色寶石 grand company tomestone scrip 變現' },
    { e: '🧳', n: '雇員探險收益排行', p: 'tools/ventures/', c: 'life', k: 'retainer venture 雇員 探險 收益 識別力' },
    { e: '🎃', n: '季節活動商店', p: 'tools/seasonal-shop/', c: 'life', k: 'seasonal event 季節 活動 報酬管理人 票據 紅蓮祭 星芒祭 萬靈節' },
    { e: '🗺️', n: '藏寶圖採集點查詢', p: 'tools/treasure-maps/', c: 'life', k: 'treasure map 藏寶圖 挖寶' },
    { e: '🌱', n: '園藝配種計算', p: 'tools/gardening/', c: 'life', k: 'gardening 園藝 配種 種植' },
    { e: '🎣', n: '釣魚紀錄追蹤', p: 'tools/fishing/', c: 'life', k: 'fishing 釣魚 大魚' },
    { e: '🚢', n: '出海垂釣班表（外部・魚糕）', u: 'https://fish.ffmomola.com/#/oceanFishing', c: 'life', k: 'ocean fishing 出海 垂釣', ext: true },
    { e: '⛏️', n: '採集紀錄追蹤', p: 'tools/gathering-log/', c: 'life', k: 'gathering log 採集紀錄 手帳' },
    { e: '🏝️', n: '無人島素材／工坊查詢', p: 'tools/island/', c: 'life', k: 'island sanctuary mji 無人島 開拓 素材 工坊 製作 採集' }
  ];

  // 分類（顯示順序 = TOOLS 定義順序）
  var CATS = [
    { k: 'daily',   label: '📅 日常工具' },
    { k: 'collect', label: '🏆 收藏 / 成就' },
    { k: 'battle',  label: '⚔️ 戰鬥 / 副本' },
    { k: 'life',    label: '🌿 生活職（採集 / 製作 / 市場）' }
  ];
  function catLabel(k) {
    if (k === '__content__') return '🔎 站內內容';
    for (var i = 0; i < CATS.length; i++) if (CATS[i].k === k) return CATS[i].label;
    return '其他';
  }

  function hrefOf(t) { return t.ext ? t.u : (t.p ? ROOT + t.p : 'javascript:void 0'); }
  function searchStr(t) { return (t.n + ' ' + (t.k || '')).toLowerCase(); }

  var overlay, input, listEl, items = [], sel = 0, filtered = TOOLS.slice();

  function injectStyle() {
    if (document.getElementById('sgt-nav-style')) return;
    var css = '' +
      // 頂部工具列（全站切換器入口）：整條貼齊視窗寬，內容置中對齊站內 1500px 容器
      '#sgt-topbar{position:sticky;top:0;z-index:9997;' +
      'background:color-mix(in srgb,var(--bg-surface,#0f1117) 90%,transparent);' +
      'border-bottom:1px solid var(--border,rgba(255,255,255,.08));' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}' +
      '.sgt-tb-inner{max-width:1500px;margin:0 auto;width:100%;box-sizing:border-box;' +
      'display:flex;align-items:center;gap:16px;height:46px;padding:0 24px;}' +
      '.sgt-tb-brand{display:flex;align-items:center;gap:6px;flex:none;text-decoration:none;' +
      'font-size:14px;font-weight:600;color:var(--gold,#c8a96e);white-space:nowrap;}' +
      '.sgt-tb-brand:hover{color:var(--gold-light,#e2c98a);}' +
      '.sgt-tb-search{flex:1;margin-left:auto;display:flex;align-items:center;gap:8px;' +
      'height:32px;padding:0 12px;cursor:text;text-align:left;' +
      'background:var(--bg-card,#14181f);border:1px solid var(--border,rgba(255,255,255,.12));' +
      'border-radius:8px;color:var(--text-muted,#717c91);font-size:13.5px;font-family:inherit;' +
      'transition:border-color .15s,color .15s;}' +
      '.sgt-tb-search:hover{border-color:var(--border-hover,rgba(200,169,110,.45));color:var(--text-secondary,#8892a4);}' +
      '.sgt-tb-search .ph{flex:1;text-align:left;}' +
      '.sgt-tb-search kbd{font:600 11px/1 ui-monospace,Consolas,monospace;color:var(--text-muted,#717c91);' +
      'border:1px solid var(--border,rgba(255,255,255,.18));border-radius:4px;padding:2px 6px;}' +
      '@media print{#sgt-topbar{display:none;}}' +
      '@media (max-width:600px){.sgt-tb-inner{padding:0 14px;gap:10px;}.sgt-tb-brand span:last-child{display:none;}.sgt-tb-search kbd{display:none;}}' +
      // 觸控裝置：頂列是每一頁都在的東西，站名與搜尋鈕原本只有 19／32px 高。
      // 站名不放大字體、改用透明擴張層把命中區推到 44px（見 common.css 同款做法）。
      '@media (pointer:coarse){.sgt-tb-inner{height:52px;}.sgt-tb-search{height:44px;}' +
      '.sgt-tb-brand{position:relative;}' +
      // 手機上站名只剩 ⚓ 一個字（19px 寬），左右各推 13px 才湊得到 44
      '.sgt-tb-brand::after{content:"";position:absolute;left:-13px;right:-13px;top:50%;height:44px;transform:translateY(-50%);}}' +
      // 全站統一頁尾（缺頁尾的 15 頁由本檔補上；已自帶 .page-footer 的頁不注入）
      '#sgt-footer{border-top:1px solid var(--border,rgba(255,255,255,.08));margin-top:48px;' +
      'padding:24px 24px 32px;text-align:center;position:relative;z-index:1;}' +
      '#sgt-footer p{max-width:1500px;margin:0 auto;font-size:13px;line-height:1.7;color:var(--text-muted,#78829a);}' +
      '#sgt-footer a{color:var(--text-secondary,#8892a4);text-decoration:none;}' +
      '#sgt-footer a:hover{color:var(--gold,#c8a96e);}' +
      '@media print{#sgt-footer{display:none;}}' +

      '#sgt-nav-overlay{position:fixed;inset:0;z-index:10000;display:none;background:rgba(0,0,0,.5);' +
      '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);}' +
      '#sgt-nav-overlay.open{display:block;}' +
      '#sgt-nav-panel{position:absolute;left:50%;top:14vh;transform:translateX(-50%);width:min(560px,92vw);' +
      'background:var(--bg-card,#14181f);border:1px solid var(--border-hover,rgba(200,169,110,.4));' +
      'border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;}' +
      '#sgt-nav-input{width:100%;box-sizing:border-box;background:transparent;border:0;' +
      'border-bottom:1px solid var(--border,rgba(255,255,255,.08));color:var(--text-primary,#e8eaf0);' +
      'font-size:16px;padding:16px 18px;outline:none;}' +
      '#sgt-nav-input::placeholder{color:var(--text-muted,#717c91);}' +
      '#sgt-nav-list{max-height:52vh;overflow-y:auto;padding:6px;}' +
      '.sgt-nav-cat{padding:9px 12px 4px;font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--text-muted,#717c91);}' +
      '.sgt-nav-cat:first-child{padding-top:4px;}' +
      '.sgt-nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;color:var(--text-secondary,#8892a4);}' +
      '.sgt-nav-item .ico{font-size:18px;width:24px;text-align:center;flex:none;}' +
      '.sgt-nav-item .nm{font-size:14.5px;color:var(--text-primary,#e8eaf0);}' +
      '.sgt-nav-item .ext{margin-left:auto;font-size:11px;color:var(--text-muted,#717c91);}' +
      '.sgt-nav-item.on,.sgt-nav-item:hover{background:var(--gold-dim,rgba(200,169,110,.15));}' +
      '.sgt-nav-item.on .nm{color:var(--gold-light,#e2c98a);}' +
      '#sgt-nav-empty{padding:22px 18px;color:var(--text-muted,#717c91);font-size:14px;text-align:center;display:none;}' +
      '#sgt-nav-foot{padding:8px 14px;border-top:1px solid var(--border,rgba(255,255,255,.08));' +
      'font-size:11px;color:var(--text-muted,#717c91);display:flex;gap:14px;flex-wrap:wrap;}' +
      // ── ? 快捷鍵說明浮層（色票一律取 tokens.css，別在這裡自己開值）──
      '#sgt-kb-overlay{position:fixed;inset:0;z-index:9999;display:none;' +
      'background:rgba(0,0,0,.55);backdrop-filter:blur(3px);}' +
      '#sgt-kb-overlay.open{display:block;}' +
      '#sgt-kb-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:min(460px,92vw);max-height:80vh;overflow-y:auto;box-sizing:border-box;' +
      'background:var(--bg-card,#14181f);border:1px solid var(--border-hover,rgba(200,169,110,.4));' +
      'border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:18px 20px 16px;}' +
      '.sgt-kb-head{display:flex;align-items:center;gap:12px;margin:0 0 14px;}' +
      '.sgt-kb-head h2{margin:0;font-size:16px;color:var(--gold-light,#e2c98a);}' +
      // 44px 命中區靠 padding 撐，不用 ::after——那招在相鄰連結旁會蓋到鄰居（知識庫 §4.68）
      '.sgt-kb-x{margin-left:auto;background:transparent;border:0;cursor:pointer;' +
      'color:var(--text-muted,#717c91);font-size:15px;line-height:1;padding:12px;min-width:44px;min-height:44px;border-radius:8px;}' +
      '.sgt-kb-x:hover{background:var(--bg-card-hover,#1a1f2b);color:var(--text-primary,#e8eaf0);}' +
      // 焦點環一定要看得見（唯一的可聚焦元素，看不見就等於卡死）
      '.sgt-kb-x:focus-visible{outline:2px solid var(--gold,#c8a96e);outline-offset:2px;}' +
      '.sgt-kb-sec{margin-bottom:14px;}' +
      '.sgt-kb-sec h3{margin:0 0 7px;font-size:11px;font-weight:700;letter-spacing:.05em;' +
      'color:var(--text-muted,#717c91);}' +
      '.sgt-kb-sec dl{margin:0;}' +
      '.sgt-kb-row{display:flex;align-items:baseline;gap:12px;padding:5px 0;}' +
      '.sgt-kb-row dt{flex:none;min-width:92px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;}' +
      '.sgt-kb-row dd{margin:0;font-size:13.5px;color:var(--text-secondary,#8892a4);}' +
      '#sgt-kb-panel kbd{font:600 11.5px/1 ui-monospace,Consolas,monospace;' +
      'color:var(--text-primary,#e8eaf0);background:var(--bg-base,#0a0c10);' +
      'border:1px solid var(--border,rgba(255,255,255,.08));border-bottom-width:2px;' +
      'border-radius:5px;padding:4px 6px;white-space:nowrap;}' +
      '.sgt-kb-or{font-size:10.5px;color:var(--text-muted,#717c91);}' +
      // 小字刻意用 --text-secondary 而非 --text-muted：後者在 --bg-card 上只有約 4.1:1，未達 4.5:1
      '.sgt-kb-note{margin:10px 0 0;font-size:12px;color:var(--text-secondary,#8892a4);}' +
      // 窄螢幕：鍵位欄不再固定寬度，改成上下排，並把說明字放大到好讀
      '@media (max-width:420px){#sgt-kb-panel{padding:16px;}' +
      '.sgt-kb-row{flex-direction:column;align-items:flex-start;gap:3px;padding:7px 0;}' +
      '.sgt-kb-row dt{min-width:0;}.sgt-kb-row dd{font-size:14.5px;}}' +
      // 安裝鈕：只有瀏覽器丟出 beforeinstallprompt 時才會被加進 DOM
      '.sgt-tb-install{display:inline-flex;align-items:center;gap:5px;flex:none;cursor:pointer;' +
      'background:var(--gold-dim,rgba(200,169,110,.15));color:var(--gold-light,#e2c98a);' +
      'border:1px solid var(--border-hover,rgba(200,169,110,.4));border-radius:8px;' +
      'font:600 12px/1 inherit;padding:0 11px;min-height:34px;white-space:nowrap;}' +
      '.sgt-tb-install:hover{background:color-mix(in srgb,var(--gold,#c8a96e) 26%,transparent);}' +
      '.sgt-tb-install:focus-visible{outline:2px solid var(--gold,#c8a96e);outline-offset:2px;}' +
      '@media (max-width:600px){.sgt-tb-install .lbl{display:none;}.sgt-tb-install{padding:0 9px;}}' +
      '@media print{#sgt-nav-launch,.sgt-tb-install{display:none;}}';
    var st = document.createElement('style');
    st.id = 'sgt-nav-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    injectStyle();
    overlay = document.createElement('div');
    overlay.id = 'sgt-nav-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '快速切換工具');
    overlay.innerHTML =
      '<div id="sgt-nav-panel">' +
        '<input id="sgt-nav-input" type="text" autocomplete="off" placeholder="搜尋工具或站內內容…（坐騎／寵物／幻卡／魚／副本…）" aria-label="搜尋工具">' +
        '<div id="sgt-nav-list" role="listbox"></div>' +
        '<div id="sgt-nav-empty">找不到符合的項目</div>' +
        '<div id="sgt-nav-foot"><span>↑↓ 選擇</span><span>↵ 前往</span><span>Esc 關閉</span><span>/ 或 Ctrl/⌘K 開啟</span><span>? 快捷鍵</span></div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('#sgt-nav-input');
    listEl = overlay.querySelector('#sgt-nav-list');

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    input.addEventListener('input', function () { filter(input.value); });
    input.addEventListener('keydown', onKey);
  }

  function render() {
    listEl.innerHTML = '';
    items = [];
    var empty = overlay.querySelector('#sgt-nav-empty');
    empty.style.display = filtered.length ? 'none' : '';
    var lastCat = null;
    filtered.forEach(function (t, i) {
      // filtered 保持 TOOLS 的分類排序，分類變更時插入標題（items[] 仍與 filtered 同序，方向鍵不受影響）
      if (t.c !== lastCat) {
        lastCat = t.c;
        var h = document.createElement('div');
        h.className = 'sgt-nav-cat';
        h.textContent = catLabel(t.c);
        listEl.appendChild(h);
      }
      var row = document.createElement('a');
      row.className = 'sgt-nav-item' + (i === sel ? ' on' : '');
      row.href = hrefOf(t);
      if (t.ext) { row.target = '_blank'; row.rel = 'noopener'; }
      row.setAttribute('role', 'option');
      row.innerHTML = '<span class="ico">' + t.e + '</span><span class="nm"></span>' +
        (t.sub || t.ext ? '<span class="ext"></span>' : '');
      row.querySelector('.nm').textContent = t.n;
      // 內容結果右側標它是什麼（坐騎／幻卡／魚…），不然一長串名字看不出差別
      if (t.sub) row.querySelector('.ext').textContent = t.sub + (t.p ? '' : '（尚無專屬頁）');
      else if (t.ext) row.querySelector('.ext').textContent = '↗ 外部';
      row.addEventListener('mouseenter', function () { sel = i; markSel(); });
      row.addEventListener('click', function (e) { e.preventDefault(); go(t); });
      listEl.appendChild(row);
      items.push(row);
    });
  }

  function markSel() {
    items.forEach(function (el, i) { el.classList.toggle('on', i === sel); });
    if (items[sel] && items[sel].scrollIntoView) items[sel].scrollIntoView({ block: 'nearest' });
  }

  /* ── 全站內容索引（data/site-index.json）──────────────────────────────
     面板原本只搜得到「工具名稱」，但使用者要找的常常是一個東西
     （「那隻寵物叫什麼」「這張卡在哪」），而他不知道那屬於哪個工具頁。

     索引**打字時才載**（5,053 筆／gzip 51KB）：面板是全站注入的，
     開頁就載等於每頁都付這個成本，而多數瀏覽根本不會用到搜尋。
     載入失敗就安靜退回只搜工具——搜不到東西比整個面板壞掉好。

     每筆是 [名稱, 類型 index, keyOf 值?]，走 ?id= 深連結（見 docs/deep-links.md）。 */
  var idx = null, idxState = 'idle';   // idle | loading | ready | failed
  function loadIndex() {
    if (idxState !== 'idle') return;
    idxState = 'loading';
    fetch(ROOT + 'data/site-index.json')
      .then(function (r) { return r.json(); })
      .then(function (j) { idx = j; idxState = 'ready'; if (input && input.value) filter(input.value); })
      .catch(function () { idxState = 'failed'; });
  }

  // 索引裡的一筆 → 面板列（形狀比照 TOOLS，render() 才不用分兩套）
  function entryToRow(name, typeIdx, key) {
    var t = idx.types[typeIdx] || {};
    return {
      e: '🔎', n: name, c: '__content__',
      sub: t.label,
      // 沒有 path 的類別（目前只有副本，站內還沒有副本頁）只顯示不跳轉
      p: t.path ? t.path + (key != null ? '?id=' + encodeURIComponent(key) : '') : null
    };
  }

  function filter(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) { filtered = TOOLS.slice(); sel = 0; render(); return; }

    var tools = TOOLS.filter(function (t) { return searchStr(t).indexOf(q) >= 0; });
    var content = [];
    if (idxState === 'idle') loadIndex();
    if (idxState === 'ready' && q.length >= 1) {
      var seen = {};
      for (var i = 0; i < idx.data.length && content.length < 40; i++) {
        var r = idx.data[i];
        if (r[0].toLowerCase().indexOf(q) < 0) continue;
        var k = r[0] + '|' + r[1];
        if (seen[k]) continue;
        seen[k] = 1;
        content.push(entryToRow(r[0], r[1], r[2]));
      }
    }
    // 市場保底：索引不收一般物品（45,548 筆太大），但使用者打的很可能就是道具名
    var fallback = {
      e: '💰', n: '到市場查價搜「' + q + '」', c: '__content__', sub: '物品',
      p: 'tools/market/?q=' + encodeURIComponent(q)
    };
    filtered = tools.concat(content, [fallback]);
    sel = 0;
    render();
  }

  function go(t) {
    if (t.ext) { window.open(t.u, '_blank', 'noopener'); close(); return; }
    if (!t.p) return;            // 站內還沒有該類別的頁面（目前只有副本），只顯示不跳
    window.location.href = hrefOf(t);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (filtered.length) { sel = (sel + 1) % filtered.length; markSel(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (filtered.length) { sel = (sel - 1 + filtered.length) % filtered.length; markSel(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[sel]) go(filtered[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  function open() {
    if (!overlay) build();
    filter('');
    overlay.classList.add('open');
    input.value = '';
    setTimeout(function () { input.focus(); }, 0);
  }
  function close() { if (overlay) overlay.classList.remove('open'); }


  /* ── 頁內快捷鍵：登記表 ＋ ? 說明浮層 ──────────────────────────────────
     為什麼放在 nav.js 而不是新開一支：nav.js 已經在每一頁載入，放這裡**31 頁零改動**。
     另開檔要在每頁加一行 <script>，而那正是 unlock-banner 付過的代價。

     頁面自己登記想要的鍵：
       SGT_SHORTCUTS.register([{ keys: 's', label: '聚焦搜尋框', run: fn }]);
     `keys` 可以是字串或字串陣列（`['[', 'ArrowLeft']`）。比對用 `e.key` 原值，
     所以大小寫要一致——登記 's' 時按 Shift+S 不會觸發（那是刻意的，避免打字誤觸）。 */
  var SHORTCUTS = [];        // 頁面登記的
  var GLOBAL_KEYS = [        // nav.js 自己提供的，只用來顯示在說明浮層
    { keys: ['/', 'Ctrl/⌘K'], label: '搜尋所有工具與站內內容' },
    { keys: '?', label: '這份快捷鍵說明' },
    { keys: 'Esc', label: '關閉浮層' }
  ];

  function asArray(k) { return Object.prototype.toString.call(k) === '[object Array]' ? k : [k]; }

  // nav.js 其餘部分一律走 textContent，所以本來沒有轉義函式。
  // 說明浮層要一次組出整張表，用 innerHTML 比較短，但那就得自己轉義。
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.SGT_SHORTCUTS = {
    register: function (list) {
      if (!list || !list.length) return;
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s || !s.keys || typeof s.run !== 'function') continue;
        SHORTCUTS.push({ keys: asArray(s.keys), label: s.label || '', run: s.run });
      }
    },
    /** 清掉頁面登記（單頁應用沒有這種需求，留給測試用）。 */
    reset: function () { SHORTCUTS = []; },
    list: function () { return SHORTCUTS.slice(); },
    open: openHelp
  };

  /* ⚠ **時序**：nav.js 是 theme.js 用 `defer` 載進來的，而追蹤頁的 `CollectionTracker.init()`
     是頁面裡的 inline script **同步**跑的——那時候 `window.SGT_SHORTCUTS` 還不存在。
     所以登記端可以先把要登記的東西丟進 `SGT_SHORTCUTS_PENDING`，這裡一次吸乾。
     用佇列而不是「等 DOMContentLoaded 再試」：後者在 init 比 DOMContentLoaded 晚的頁面會整個失效，
     而且失效的樣子是「按鍵沒反應」，沒有任何錯誤訊息。 */
  (function drainPending() {
    var q = window.SGT_SHORTCUTS_PENDING;
    if (!q || !q.length) return;
    for (var i = 0; i < q.length; i++) window.SGT_SHORTCUTS.register(q[i]);
    q.length = 0;
  })();

  var helpEl = null, helpReturnFocus = null;

  function keyHtml(keys) {
    return asArray(keys).map(function (k) { return '<kbd>' + esc(k) + '</kbd>'; }).join('<span class="sgt-kb-or">或</span>');
  }

  function buildHelp() {
    if (helpEl) return;
    injectStyle();
    helpEl = document.createElement('div');
    helpEl.id = 'sgt-kb-overlay';
    helpEl.setAttribute('role', 'dialog');
    helpEl.setAttribute('aria-modal', 'true');
    helpEl.setAttribute('aria-label', '鍵盤快捷鍵');
    helpEl.addEventListener('click', function (e) { if (e.target === helpEl) closeHelp(); });
    document.body.appendChild(helpEl);
  }

  function openHelp() {
    buildHelp();
    var sections = [['全站', GLOBAL_KEYS]];
    if (SHORTCUTS.length) sections.push(['本頁', SHORTCUTS]);
    helpEl.innerHTML =
      '<div id="sgt-kb-panel">' +
        '<div class="sgt-kb-head"><h2>鍵盤快捷鍵</h2>' +
          '<button type="button" class="sgt-kb-x" aria-label="關閉">✕</button></div>' +
        sections.map(function (sec) {
          return '<div class="sgt-kb-sec"><h3>' + esc(sec[0]) + '</h3><dl>' +
            sec[1].map(function (s) {
              return '<div class="sgt-kb-row"><dt>' + keyHtml(s.keys) + '</dt><dd>' + esc(s.label) + '</dd></div>';
            }).join('') + '</dl></div>';
        }).join('') +
        (SHORTCUTS.length ? '' : '<p class="sgt-kb-note">這一頁沒有頁內快捷鍵。</p>') +
        '<p class="sgt-kb-note">在輸入框裡打字時快捷鍵不會觸發。</p>' +
      '</div>';
    helpEl.querySelector('.sgt-kb-x').addEventListener('click', closeHelp);
    helpReturnFocus = document.activeElement;
    helpEl.classList.add('open');
    helpEl.querySelector('.sgt-kb-x').focus();
  }

  function closeHelp() {
    if (!helpEl) return;
    helpEl.classList.remove('open');
    // 焦點還回原處——不還的話按 Esc 之後 Tab 會從頁首重來
    if (helpReturnFocus && helpReturnFocus.focus) { try { helpReturnFocus.focus(); } catch (err) {} }
    helpReturnFocus = null;
  }

  function helpOpen() { return !!(helpEl && helpEl.classList.contains('open')); }

  /* 宣告了 `aria-modal="true"` 就必須把焦點關在浮層裡。沒做的話：
     螢幕閱讀器被告知「這是模態」，但按 Tab 焦點會跑到底下那一頁的連結上，
     使用者聽到的內容與看到的畫面不一致，而且不知道怎麼回到浮層。 */
  function trapTab(e) {
    if (!helpOpen() || e.key !== 'Tab') return;
    var focusables = helpEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) { e.preventDefault(); return; }
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (helpEl.contains(document.activeElement) === false) { e.preventDefault(); first.focus(); }
  }

  // 全域快捷鍵
  function inField(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); open(); return; }

    // 說明浮層開著時只認 Esc（否則會一邊看說明一邊誤觸底下的頁面）
    if (helpOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); closeHelp(); }
      else trapTab(e);
      return;
    }
    var paletteOpen = !!(overlay && overlay.classList.contains('open'));
    if (paletteOpen) return;                       // 命令面板有自己的 onKey

    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (inField(document.activeElement)) return;   // 在輸入框裡打字時一律不攔

    /* ⚠ 有 <dialog open> 時也不攔。站內的詳情彈窗都是 <dialog>，
       在彈窗裡按 s 應該什麼都不做，而不是去聚焦底下那張表的搜尋框。 */
    if (document.querySelector('dialog[open]')) return;

    if (e.key === '/') { e.preventDefault(); open(); return; }
    if (e.key === '?') { e.preventDefault(); openHelp(); return; }

    for (var i = 0; i < SHORTCUTS.length; i++) {
      if (SHORTCUTS[i].keys.indexOf(e.key) >= 0) {
        e.preventDefault();
        try { SHORTCUTS[i].run(e); } catch (err) { if (window.console) console.warn('[快捷鍵] ' + e.key, err); }
        return;
      }
    }
  });


  /* ── 安裝為應用程式 ──────────────────────────────────────────────
     **不彈窗、不擋畫面。** 只有瀏覽器自己判定「這站可以安裝」並丟出
     `beforeinstallprompt` 時，才在頂列長出一顆小鈕；按了才叫原生安裝流程。
     關掉之後記住（`ffxiv_pwa_dismissed`），不再長出來。

     為什麼不做整條橫幅或彈窗：那是全站每一頁都會看到的東西，而安裝是一次性的動作
     ——一次性的動作配上每頁都出現的提示，就是廣告。
     iOS Safari 不支援 `beforeinstallprompt`，所以那裡不會有這顆鈕（它用「分享 → 加入主畫面」）。 */
  var deferredPrompt = null;

  function addInstallBtn(inner) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sgt-tb-install';
    btn.className = 'sgt-tb-install';
    btn.title = '把水神的工具箱安裝成應用程式';
    btn.innerHTML = '<span aria-hidden="true">⬇</span><span class="lbl">安裝</span>';
    btn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (r) {
        // 不論裝不裝，這一輪的 prompt 都用掉了
        deferredPrompt = null;
        btn.remove();
        if (r && r.outcome === 'dismissed') {
          try { localStorage.setItem('ffxiv_pwa_dismissed', '1'); } catch (e) {}
        }
      });
    });
    inner.appendChild(btn);
    return btn;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();                 // 擋掉瀏覽器自己的迷你橫幅，改由這顆鈕觸發
    var off = null;
    try { off = localStorage.getItem('ffxiv_pwa_dismissed'); } catch (err) {}
    if (off) return;
    deferredPrompt = e;
    var inner = document.querySelector('#sgt-topbar .sgt-tb-inner');
    if (inner && !document.getElementById('sgt-tb-install')) addInstallBtn(inner);
  });
  // 頂部細長工具列（全站切換器入口）：站名（連首頁）＋ 搜尋欄（點擊開面板）
  function addTopbar() {
    if (document.getElementById('sgt-topbar')) return;
    injectStyle();
    var bar = document.createElement('div');
    bar.id = 'sgt-topbar';
    var inner = document.createElement('div');
    inner.className = 'sgt-tb-inner';

    var brand = document.createElement('a');
    brand.className = 'sgt-tb-brand';
    brand.href = ROOT || './';
    brand.setAttribute('aria-label', '回水神的工具箱首頁');
    brand.innerHTML = '<span>⚓</span><span>水神的工具箱</span>';

    var search = document.createElement('button');
    search.type = 'button';
    search.className = 'sgt-tb-search';
    search.title = '搜尋所有工具（/ 或 Ctrl/⌘K）';
    search.setAttribute('aria-label', '搜尋所有工具');
    search.innerHTML = '<span>🔍</span><span class="ph">搜尋所有工具…</span><kbd>/</kbd>';
    search.addEventListener('click', open);

    inner.appendChild(brand);
    inner.appendChild(search);
    bar.appendChild(inner);
    document.body.insertBefore(bar, document.body.firstChild);

    addSkipLink(bar);
    addFooter();
  }

  /* ── 跳至主要內容（樣式在 tokens.css 的 .sgt-skip）────────────────────
     本站的篩選頁在內容之前有 20–40 顆標籤鈕，鍵盤／讀屏使用者原本每換一頁
     都要重按一次。必須排在頂列**之前**才是第一個 tab stop。
     目標依序找 <main> → .container → .tool-header 之後的內容；都沒有就掛在
     頂列後面第一個元素上，並補 tabindex="-1" 讓 focus() 有效。 */
  function addSkipLink(bar) {
    if (document.querySelector('.sgt-skip')) return;
    // ※ querySelector 傳選擇器清單時是「文件順序最前者」勝，不是「清單順序」勝。
    //   收藏頁的 .container 包著 .tool-header，寫成一串會選到 .container、
    //   等於只跳過頂列。所以這裡逐項自己試，並把「標題區的下一個兄弟」排在最前面。
    var hdr = document.querySelector('.tool-header');
    var target = (hdr && hdr.nextElementSibling)
              || document.querySelector('main')
              || document.querySelector('.main')
              || document.querySelector('.container')
              || document.querySelector('.wrap');
    if (!target) return;
    if (!target.id) target.id = 'sgt-main';
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    var a = document.createElement('a');
    a.className = 'sgt-skip';
    a.href = '#' + target.id;
    a.textContent = '跳至主要內容';
    // 只用 href 的話，focus 不會真的移過去（僅捲動），讀屏仍停在頂列
    a.addEventListener('click', function () { setTimeout(function () { target.focus(); }, 0); });
    document.body.insertBefore(a, bar);
  }

  /* ── 頁尾 ────────────────────────────────────────────────────────
     2026-08-03 盤點：26 頁只有 11 頁有頁尾，其餘 15 頁捲到底就直接沒了，
     版權聲明與資料來源標示也跟著漏掉。頁尾內容各頁本來就一樣，改由此處統一注入；
     已自帶 .page-footer 的頁（收藏頁走 common.css 那套）維持原樣不動。 */
  function addFooter() {
    if (document.getElementById('sgt-footer')) return;
    if (document.querySelector('.page-footer, footer')) return;
    var f = document.createElement('footer');
    f.id = 'sgt-footer';
    f.innerHTML =
      '<p><a href="' + (ROOT || './') + '">水神的工具箱</a> · 資料來源：遊戲本體、' +
      '<a href="https://xivapi.com" target="_blank" rel="noopener">XIVAPI</a><br>' +
      'FINAL FANTASY XIV © SQUARE ENIX　此為玩家自製非官方工具</p>';
    document.body.appendChild(f);
  }

  /* ── 最近使用的工具（給首頁的「最近使用」用）────────────────────────────
     記錄點放在這裡而不是首頁的卡片點擊，是因為本檔**每一頁都會載入**：不管使用者是
     從首頁點進來、用命令面板跳、還是直接開書籤／從外站連進來，都記得到。
     只存工具路徑與時間戳（localStorage `ffxiv_recent_tools`），不存任何個人資料。 */
  var RECENT_KEY = 'ffxiv_recent_tools';
  var RECENT_MAX = 6;

  function currentTool() {
    var here = window.location.pathname.replace(/index\.html$/, '');
    if (here.charAt(here.length - 1) !== '/') here += '/';
    // 取「最長的相符路徑」：tools/gathering/ 與 tools/gathering-log/ 都以 gathering 開頭，
    // 直接找第一個相符會把 gathering-log 記成 gathering。
    var best = null;
    for (var i = 0; i < TOOLS.length; i++) {
      var t = TOOLS[i];
      if (t.ext || !t.p) continue;
      if (here.slice(-(t.p.length + 1)) === '/' + t.p) {
        if (!best || t.p.length > best.p.length) best = t;
      }
    }
    return best;
  }

  function recordVisit() {
    var t = currentTool();
    if (!t) return;                       // 首頁或非工具頁不記
    try {
      var list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (x) { return x && x.p !== t.p; });
      list.unshift({ p: t.p, at: Date.now() });
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    } catch (e) { /* 無痕模式或配額滿：記不到就算了，不影響頁面 */ }
  }

  // 首頁要拿工具的顯示資料（emoji／名稱）來畫最近使用，這裡一併掛出去
  window.SGT_TOOLS = TOOLS;
  window.SGT_RECENT_KEY = RECENT_KEY;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addTopbar);
  else addTopbar();
  recordVisit();
})();
