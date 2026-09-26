// 系統解鎖對照表 —— 「本站的某個工具／系統，是由哪個任務解鎖的」
//
// ── 為什麼這張表是人工維護的 ──
// 遊戲資料裡沒有「系統 → 解鎖任務」的欄位。能自動抓到的只有反方向的線索：
// 任務的 `QuestParams` 帶 `HOW_TO*`／`UNLOCK_IMAGE_*` 這類腳本指令（全部 5,533 個任務裡
// 有 465 個帶這種訊號、61 個相異 HOW_TO id），但那些 id 指向的 `HowTo` sheet **沒有台服語系檔**，
// 所以「系統叫什麼名字」不能從遊戲資料拿。
// 解法：**系統名用本站自己的頁面名稱**（本來就是中文，不涉及翻譯），
// 人工維護的只有「哪個任務解鎖哪個工具」這一條對應，其餘欄位（任務名、NPC、地點、等級、章節）
// 一律由台服官方來源解出。
//
// ── 查找鍵為什麼用英文任務名而不是 questId ──
// 英文名是可驗證的機械規則（§4.12）：建置腳本要求**恰好唯一命中**，命中 0 或 2 筆就中止，
// 表壞了會當場爆掉而不是安靜給錯答案。寫死 questId 反而看不出對錯。
// 每條都附 `basis`＝當初是憑什麼認定它是解鎖任務（遊戲資料裡的訊號），日後要複查有依據。
//
// ── 大國防聯軍三版本 ──
// 部分系統的解鎖任務依所屬大國防聯軍分成三條（雙蛇黨／黑渦團／不滅隊），內容相同。
// 這種寫 `gcVariants: true`，腳本允許命中 3 筆並全部列出。
//
// 新增條目時：先用 scripts/build-system-unlocks.mjs 的 `--find <關鍵字>` 查出候選與其訊號，
// 確認唯一命中再寫進來，並把 basis 寫清楚。**不要憑印象寫任務名。**

export const SYSTEMS = [
  // ── 本站有對應工具頁的 ──
  {
    key: "triple-triad", name: "九宮幻卡", tool: "/collections/triple-triad/",
    questEn: "Triple Triad Trial",
    basis: "QuestParams HOW_TO0=199；本站幻卡追蹤頁的前提",
  },
  {
    key: "gold-saucer", name: "金碟遊樂園", tool: "/tools/cactpot/",
    questEn: "It Could Happen to You",
    basis: "金碟入場任務；仙人微彩／幻巧戰／幻卡皆在金碟內",
  },
  {
    key: "wondrous-tails", name: "天書奇談", tool: "/tools/wondrous-tails/",
    questEn: "Keeping Up with the Aliapohs",
    basis: "天書奇談發放 NPC（可蘿伊）的開放任務",
  },
  {
    key: "faux-hollows", name: "幻巧戰", tool: "/tools/faux-hollows/",
    questEn: "Fantastic Mr. Faux",
    basis: "幻巧戰開放任務",
  },
  {
    key: "fashion-report", name: "時尚品鑑", tool: "/tools/fashion-report/",
    questEn: "Passion for Fashion",
    basis: "時尚品鑑開放任務",
  },
  {
    key: "island-sanctuary", name: "無人島開拓", tool: "/tools/island/",
    questEn: "Seeking Sanctuary",
    basis: "無人島開放任務",
  },
  {
    key: "blue-magic", name: "青魔法師", tool: "/collections/blue-magic/",
    questEn: "Out of the Blue",
    basis: "QuestParams UNLOCK_IMAGE_CLASS=694／HOW_TO_JOB=94（職業解放）",
  },
  {
    key: "treasure-maps", name: "藏寶圖", tool: "/tools/treasure-maps/",
    questEn: "Treasures and Tribulations",
    basis: "陳舊的地圖開放任務",
  },
  {
    key: "squadron", name: "冒險者小隊", tool: "/tools/squadron/",
    questEn: "Squadron and Commander", gcVariants: true,
    basis: "QuestParams UNLOCK_IMAGE_GC_TEAM=407（三個大國防聯軍各一條）",
  },
  {
    key: "levequest", name: "理符任務", tool: null,
    questEn: "Leves of Bentbranch",
    basis: "QuestParams UNLOCK_IMAGE_LEVE=30＋UNLOCK_IMAGE_GUILDORDER=21（第一個理符發行處）",
  },
  {
    key: "hunt", name: "狩獵任務（討伐筆記）", tool: null,
    questEn: "Let the Hunt Begin", gcVariants: true,
    basis: "狩獵任務開放（三個大國防聯軍各一條）",
  },
  {
    key: "grand-company", name: "大國防聯軍（軍票）", tool: "/tools/gc-exchange/",
    questEn: "For Coin and Country",
    basis: "入團任務；軍票變現排行的前提",
  },
  {
    key: "retainer", name: "雇員", tool: null,
    questEn: "The Scions of the Seventh Dawn",
    basis: "雇員開放任務",
  },
  {
    key: "chocobo", name: "陸行鳥同伴", tool: "/collections/barding/",
    questEn: "My Little Chocobo", gcVariants: true,
    basis: "陸行鳥同伴開放（三個大國防聯軍各一條）；鳥鞍收藏的前提",
  },
  {
    key: "glamour", name: "幻化（投影）", tool: "/tools/glamour/",
    questEn: "If I Had a Glamour",
    basis: "QuestParams HOW_TO_PROJECTION=164／HOW_TO_MIRAGE_PLATE=247",
  },
  {
    key: "glamour-dresser", name: "幻化收藏櫃", tool: "/tools/glamour/",
    questEn: "Absolutely Glamourous",
    basis: "幻想藥／收藏櫃開放任務",
  },
  {
    key: "materia-meld", name: "禁忌鑲嵌", tool: null,
    questEn: "Melding Materia Muchly",
    basis: "QuestParams HOW_TO_01=99＋UNLOCK_IMAGE_MATERIA_FORBIDDEN=248",
  },
  {
    key: "materia-transmute", name: "魔晶石精製", tool: null,
    questEn: "Marvelously Mutable Materia",
    basis: "QuestParams UNLOCK_MATERIA_TRANSMUTATION=211",
  },
  {
    key: "beast-tribe", name: "友好部族任務", tool: null,
    questEn: "Peace for Thanalan",
    basis: "第一個友好部族（小蛇神族）開放任務",
  },
  {
    key: "custom-delivery", name: "客戶委託", tool: null,
    questEn: "Inscrutable Tastes",
    basis: "客戶委託開放任務",
  },
  {
    key: "eureka", name: "優雷卡", tool: null,
    questEn: "And We Shall Call It Eureka",
    basis: "優雷卡開放任務",
  },
  {
    key: "bozja", name: "南方戰線（博茲雅）", tool: null,
    questEn: "Hail to the Queen",
    basis: "博茲雅開放任務",
  },
  {
    key: "deep-dungeon", name: "深層迷宮", tool: null,
    questEn: "The House That Death Built",
    basis: "死者宮殿開放任務",
  },
  {
    key: "ishgard-restoration", name: "伊修加德重建", tool: null,
    questEn: "Litany of Peace",
    basis: "蒼天街開放任務",
  },
  // ── 採集／製作職業（採集紀錄與製作模擬器的前提）──
  {
    key: "miner", name: "採礦工", tool: "/tools/gathering-log/",
    questEn: "Way of the Miner",
    basis: "QuestParams UNLOCK_IMAGE_GATHER_BOOK=17／UNLOCK_IMAGE_CLASS_MIN=52（職業解放＋採集筆記）",
  },
  {
    key: "botanist", name: "園藝工", tool: "/tools/gathering-log/",
    questEn: "Way of the Botanist",
    basis: "QuestParams UNLOCK_IMAGE_GATHER_BOOK=17／UNLOCK_IMAGE_CLASS_HRV=26",
  },
];

// 本站有頁面、但**查不到單一解鎖任務**的系統。
// 列在這裡是為了讓建置腳本的缺口報告有對照，不會每次重查一輪；
// 不寫進輸出資料，也不在頁面上宣稱任何解鎖條件。
export const NO_SINGLE_QUEST = [
  ["orchestrion", "管弦樂琴樂譜", "英文名含 Orchestrion 的任務 0 筆；樂譜播放器綁房屋／公寓，非單一任務"],
  ["sightseeing", "探索筆記", "英文名含 Sightsee 的任務只有遊末邦見聞（無關）；未找到開放任務"],
  ["aether-current", "風脈泉", "每個地區各自解鎖，沒有單一任務"],
  ["market-board", "市場板", "未找到開放任務；疑似隨主線自然開放"],
  ["fc-workshop", "部隊工房／飛空艇／潛水艇", "英文名含 Workshop／Airship／Submersible 的任務 0 筆；需部隊等級而非任務"],
  ["cosmic", "宇宙探索", "A Cosmic Homecoming（70789）尚無台服名，台服未開放"],
];

// ── 職業行會任務（20 個基礎職）──────────────────────────────────────────
//
// 進階職業（騎士、武僧…共 24 個）**不需要人工維護**：`ClassJob.UnlockQuest` 直接指向解鎖任務，
// 建置腳本照抓即可。基礎職的 `UnlockQuest` 是 0，所以只有這 20 條要對照。
//
// 三道驗證（都在 build-system-unlocks.mjs 裡強制執行）：
//   ① 英文任務名必須**恰好唯一命中**（同 SYSTEMS 的規則）
//   ② 9 個戰鬥職的任務帶 `Quest.ClassJobUnlock`，**必須等於這裡寫的 classJob**，
//      對不上就中止——等於有一半條目是遊戲資料自己驗過的
//   ③ 台服任務名必須含「行會」。這條擋的是抓錯任務：
//      「So You Want to Be a Jockey」（陸行鳥訓練師）與「So You Want to Be a Machinist」
//      （機工士，真正的解鎖任務是 ClassJob.UnlockQuest 指的 67232）名字很像但都不是行會任務。
//
// 11 個生產採集職沒有 `ClassJobUnlock` 可交叉驗證，依據只有「英文任務名指名該職業」＋閘門③。
// classJob 是 ClassJob 的 row_id，對應 data/equip.json 的 jobs 陣列索引（職業繁中名由該檔的 names 表解出）。
export const GUILD_QUESTS = [
  // 戰鬥職（9）——ClassJobUnlock 可交叉驗證
  { classJob: 1, questEn: "So You Want to Be a Gladiator" },
  { classJob: 2, questEn: "So You Want to Be a Pugilist" },
  { classJob: 3, questEn: "So You Want to Be a Marauder" },
  { classJob: 4, questEn: "So You Want to Be a Lancer" },
  { classJob: 5, questEn: "So You Want to Be an Archer" },
  { classJob: 6, questEn: "So You Want to Be a Conjurer" },
  { classJob: 7, questEn: "So You Want to Be a Thaumaturge" },
  { classJob: 26, questEn: "So You Want to Be an Arcanist" },
  { classJob: 29, questEn: "So You Want to Be a Rogue" },
  // 能工巧匠（8）
  { classJob: 8, questEn: "So You Want to Be a Carpenter" },
  { classJob: 9, questEn: "So You Want to Be a Blacksmith" },
  { classJob: 10, questEn: "So You Want to Be an Armorer" },
  { classJob: 11, questEn: "So You Want to Be a Goldsmith" },
  { classJob: 12, questEn: "So You Want to Be a Leatherworker" },
  { classJob: 13, questEn: "So You Want to Be a Weaver" },
  { classJob: 14, questEn: "So You Want to Be an Alchemist" },
  { classJob: 15, questEn: "So You Want to Be a Culinarian" },
  // 大地使者（3）
  { classJob: 16, questEn: "So You Want to Be a Miner" },
  { classJob: 17, questEn: "So You Want to Be a Botanist" },
  { classJob: 18, questEn: "So You Want to Be a Fisher" },
];
