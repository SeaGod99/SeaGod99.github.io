// 坐騎資料
// 來源類型：
//   "主線任務" - 主線劇情獎勵
//   "副本掉落" - 副本 / 討伐妖異 掉落
//   "高難度副本" - 極神、絕境戰掉落
//   "狩獵" - 狩獵貨幣兌換（S 怪、A 怪）
//   "PvP" - PvP 相關獎勵
//   "製作" - 製作職業製作
//   "任務" - 支線任務、職業任務獎勵
//   "藍魔" - 藍魔法師相關
//   "金碟" - 金碟遊樂場 MGP 兌換
//   "商店" - Mog 工房商店 / 遊戲內商店
//   "節慶活動" - 節慶限定活動
//   "市場板" - 可在市場購買
//   "成就" - 成就系統獎勵
//   "信任系統" - 信任系統積分
//   "探索航行" - 潛水艇 / 飛空艇探索
//   "聯名活動" - 外部聯名合作
//   "其他" - 其他
//
// 格式：{ id, name, patch, sources: [{ type, detail }], icon }
// icon 為 XIVAPI 圖示路徑（選填）

const MOUNT_DATA = [
  // ── ARR 2.x ─────────────────────────────────────────────
  { id: 1,  name: "陸行鳥",            patch: "2.0", sources: [{ type: "主線任務", detail: "職業等級達 20 可購買" }] },
  { id: 2,  name: "黑陸行鳥",          patch: "2.0", sources: [{ type: "任務",    detail: "完成「向騎乘進發！」任務" }] },
  { id: 3,  name: "戰馬",              patch: "2.0", sources: [{ type: "PvP",     detail: "狼群評價達 A 階" }] },
  { id: 4,  name: "逐影騎乘",          patch: "2.0", sources: [{ type: "成就",    detail: "成就「戰鬥在外野之一」" }] },
  { id: 5,  name: "鐵姆拉牛",          patch: "2.0", sources: [{ type: "副本掉落", detail: "莫頓城巨城廢墟（困難）" }] },
  { id: 6,  name: "陸行鳥帽",          patch: "2.0", sources: [{ type: "金碟",    detail: "金碟 MGP 兌換" }] },
  { id: 7,  name: "盧德西特天馬",      patch: "2.0", sources: [{ type: "成就",    detail: "成就「盧德西特之星」" }] },
  { id: 8,  name: "大型銅齒幸運蟲",    patch: "2.0", sources: [{ type: "金碟",    detail: "金碟 MGP 兌換" }] },
  { id: 9,  name: "天之龍",            patch: "2.0", sources: [{ type: "副本掉落", detail: "巴哈姆特邊境（第五層）" }] },
  { id: 10, name: "大型甲蟲",          patch: "2.0", sources: [{ type: "市場板",  detail: "可於市場購買" }] },
  { id: 11, name: "法爾法德",          patch: "2.0", sources: [{ type: "高難度副本", detail: "極神「極地神」" }] },
  { id: 12, name: "加魯達的羽翼",      patch: "2.0", sources: [{ type: "高難度副本", detail: "極神「風神加魯達」" }] },
  { id: 13, name: "伊夫利特的追焰",    patch: "2.0", sources: [{ type: "高難度副本", detail: "極神「火神伊夫利特」" }] },
  { id: 14, name: "泰坦的命石",        patch: "2.0", sources: [{ type: "高難度副本", detail: "極神「土神泰坦」" }] },
  { id: 15, name: "牛頭人",            patch: "2.2", sources: [{ type: "副本掉落", detail: "哈卡茲宮（困難）" }] },
  { id: 16, name: "水晶蟲族飛空艇",    patch: "2.3", sources: [{ type: "任務",    detail: "我方飛空艇「解鎖飛空艇」" }] },
  { id: 17, name: "白虎",              patch: "2.3", sources: [{ type: "高難度副本", detail: "極神「白虎三巴」" }] },
  { id: 18, name: "歡笑宮廷陸行鳥",    patch: "2.3", sources: [{ type: "副本掉落", detail: "萊姆利亞歡笑宮廷" }] },
  { id: 19, name: "佩加索斯",          patch: "2.4", sources: [{ type: "高難度副本", detail: "極神「女神Shiva」" }] },
  { id: 20, name: "閃光戰馬",          patch: "2.5", sources: [{ type: "成就",    detail: "成就「偉大的航海家」" }] },

  // ── HW 3.x ─────────────────────────────────────────────
  { id: 21, name: "希斯塔尼飛龍",      patch: "3.0", sources: [{ type: "主線任務", detail: "完成蒼天之理主線" }] },
  { id: 22, name: "極龍",              patch: "3.0", sources: [{ type: "高難度副本", detail: "極神「相克龍」" }] },
  { id: 23, name: "冰霜之龍",          patch: "3.0", sources: [{ type: "高難度副本", detail: "極神「祈龍 Nidhogg」" }] },
  { id: 24, name: "浮空機",            patch: "3.0", sources: [{ type: "副本掉落", detail: "真代達羅斯" }] },
  { id: 25, name: "赤色格里芬",        patch: "3.1", sources: [{ type: "成就",    detail: "成就「蒼天騎士」" }] },
  { id: 26, name: "馬芙里特",          patch: "3.1", sources: [{ type: "高難度副本", detail: "極神「剛魂 Ravana」" }] },
  { id: 27, name: "寢室貘",            patch: "3.2", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },
  { id: 28, name: "辛蒙德鳥",          patch: "3.2", sources: [{ type: "高難度副本", detail: "極神「偉大的神明 Bismarck」" }] },
  { id: 29, name: "希臘神牛",          patch: "3.2", sources: [{ type: "副本掉落", detail: "亞歷山大黃金之篇（零式）" }] },
  { id: 30, name: "奧爾特羅斯",        patch: "3.3", sources: [{ type: "高難度副本", detail: "極神「海神 Leviathan」" }] },
  { id: 31, name: "哈迪斯",            patch: "3.4", sources: [{ type: "高難度副本", detail: "絕境「絕巴哈姆特討滅戰」" }] },
  { id: 32, name: "幻龍",              patch: "3.5", sources: [{ type: "高難度副本", detail: "極神「龍神 Nidhogg」" }] },
  { id: 33, name: "凜藍鵜鶘",          patch: "3.5", sources: [{ type: "狩獵",    detail: "傳說狩獵貨幣兌換" }] },

  // ── SB 4.x ─────────────────────────────────────────────
  { id: 34, name: "紅蓮陸行鳥",        patch: "4.0", sources: [{ type: "主線任務", detail: "完成紅蓮之狂潮主線" }] },
  { id: 35, name: "九尾狐",            patch: "4.0", sources: [{ type: "高難度副本", detail: "極神「悲哭者 Lakshmi」" }] },
  { id: 36, name: "赤焰鳳凰",          patch: "4.0", sources: [{ type: "高難度副本", detail: "絕境「絕神兵討滅戰」" }] },
  { id: 37, name: "金色陸行鳥",        patch: "4.1", sources: [{ type: "副本掉落", detail: "超越天堂" }] },
  { id: 38, name: "骨幻獸",            patch: "4.1", sources: [{ type: "市場板",  detail: "副本掉落可於市場購買" }] },
  { id: 39, name: "魚人王",            patch: "4.2", sources: [{ type: "高難度副本", detail: "極神「神武 Susano」" }] },
  { id: 40, name: "神鷹",              patch: "4.3", sources: [{ type: "高難度副本", detail: "極神「魔后 Shinryu」" }] },
  { id: 41, name: "帝王幻象",          patch: "4.4", sources: [{ type: "高難度副本", detail: "極神「邪神 Byakko」" }] },
  { id: 42, name: "精靈",              patch: "4.4", sources: [{ type: "副本掉落", detail: "奧米加白金之篇（零式）" }] },
  { id: 43, name: "黃金幻象",          patch: "4.5", sources: [{ type: "高難度副本", detail: "極神「刑神 Tsukuyomi」" }] },
  { id: 44, name: "黑騎士",            patch: "4.5", sources: [{ type: "絕境",    detail: "絕境「絕龍詩討滅戰」" }] },
  { id: 45, name: "水鳥",              patch: "4.5", sources: [{ type: "狩獵",    detail: "傳說狩獵貨幣兌換" }] },

  // ── ShB 5.x ─────────────────────────────────────────────
  { id: 46, name: "漆黑陸行鳥",        patch: "5.0", sources: [{ type: "主線任務", detail: "完成暗影之逆焰主線" }] },
  { id: 47, name: "隕星陸行鳥",        patch: "5.0", sources: [{ type: "高難度副本", detail: "極神「冥界女王 Titania」" }] },
  { id: 48, name: "玫瑰幻象",          patch: "5.0", sources: [{ type: "高難度副本", detail: "極神「邪龍 Innocence」" }] },
  { id: 49, name: "蛇女神",            patch: "5.1", sources: [{ type: "高難度副本", detail: "極神「破滅 Hades」" }] },
  { id: 50, name: "白銀幻象",          patch: "5.1", sources: [{ type: "副本掉落", detail: "伊甸墮落之篇（零式）" }] },
  { id: 51, name: "馬車",              patch: "5.2", sources: [{ type: "高難度副本", detail: "極神「英雄 Ruby Weapon」" }] },
  { id: 52, name: "不死鳥",            patch: "5.3", sources: [{ type: "高難度副本", detail: "極神「縹緲 Emerald Weapon」" }] },
  { id: 53, name: "千幻之龍",          patch: "5.4", sources: [{ type: "副本掉落", detail: "伊甸誓約之篇（零式）" }] },
  { id: 54, name: "龍騎士座騎",        patch: "5.4", sources: [{ type: "高難度副本", detail: "絕境「絕亞歷山大討滅戰」" }] },
  { id: 55, name: "銀月幻象",          patch: "5.5", sources: [{ type: "高難度副本", detail: "極神「無盡 Diamond Weapon」" }] },
  { id: 56, name: "地獄馬",            patch: "5.5", sources: [{ type: "狩獵",    detail: "傳說狩獵貨幣兌換" }] },

  // ── EW 6.x ─────────────────────────────────────────────
  { id: 57, name: "萬物終焉陸行鳥",    patch: "6.0", sources: [{ type: "主線任務", detail: "完成曉月之終途主線" }] },
  { id: 58, name: "白鯨",              patch: "6.0", sources: [{ type: "高難度副本", detail: "極神「諸天神 Zodiark」" }] },
  { id: 59, name: "炎獄幻象",          patch: "6.0", sources: [{ type: "高難度副本", detail: "極神「星占師 Hydaelyn」" }] },
  { id: 60, name: "彩虹天馬",          patch: "6.0", sources: [{ type: "副本掉落", detail: "萬魔殿煉獄之篇（零式）" }] },
  { id: 61, name: "骷髏幻象",          patch: "6.1", sources: [{ type: "高難度副本", detail: "極神「邪龍 Endsinger」" }] },
  { id: 62, name: "水晶龍",            patch: "6.1", sources: [{ type: "高難度副本", detail: "絕境「絕欧米茄討滅戰」" }] },
  { id: 63, name: "白鷺",              patch: "6.2", sources: [{ type: "高難度副本", detail: "極神「毀滅者 Barbariccia」" }] },
  { id: 64, name: "金翅大鵬",          patch: "6.2", sources: [{ type: "副本掉落", detail: "萬魔殿邊境之篇（零式）" }] },
  { id: 65, name: "地底幻象",          patch: "6.3", sources: [{ type: "高難度副本", detail: "極神「殺戮者 Rubicante」" }] },
  { id: 66, name: "冰雪幻象",          patch: "6.4", sources: [{ type: "高難度副本", detail: "極神「縊死者 Golbez」" }] },
  { id: 67, name: "萬魔殿頂點幻象",    patch: "6.4", sources: [{ type: "副本掉落", detail: "萬魔殿天獄之篇（零式）" }] },
  { id: 68, name: "終末天使",          patch: "6.4", sources: [{ type: "高難度副本", detail: "絕境「絕龍詩 再演」" }] },
  { id: 69, name: "光之守護者",        patch: "6.5", sources: [{ type: "高難度副本", detail: "極神「悟道者 Zeromus」" }] },
  { id: 70, name: "幻影狩獵獸",        patch: "6.5", sources: [{ type: "狩獵",    detail: "傳說狩獵貨幣兌換" }] },

  // ── DT 7.x ─────────────────────────────────────────────
  { id: 71, name: "黃金之鄉陸行鳥",    patch: "7.0", sources: [{ type: "主線任務", detail: "完成金曦之遺輝主線" }] },
  { id: 72, name: "雷雨幻象",          patch: "7.0", sources: [{ type: "高難度副本", detail: "極神「轟鳴者 Valigarmanda」" }] },
  { id: 73, name: "骨龍",              patch: "7.0", sources: [{ type: "副本掉落", detail: "阿卡迪亞樂園序篇（零式）" }] },
  { id: 74, name: "混沌幻象",          patch: "7.05", sources: [{ type: "高難度副本", detail: "絕境「絕伊甸討滅戰」" }] },
  { id: 75, name: "熔岩幻象",          patch: "7.1", sources: [{ type: "高難度副本", detail: "極神「石化者 Sphene」" }] },
  { id: 76, name: "黃金戰馬",          patch: "7.1", sources: [{ type: "副本掉落", detail: "阿卡迪亞樂園正篇（零式）" }] },
  { id: 77, name: "奇美拉",            patch: "7.2", sources: [{ type: "高難度副本", detail: "極神「天道者 Zoraal Ja」" }] },
  { id: 78, name: "虛空飛龍",          patch: "7.2", sources: [{ type: "副本掉落", detail: "阿卡迪亞樂園秘境（零式）" }] },

  // ── 商店 / 活動 ─────────────────────────────────────────
  { id: 100, name: "胖貓咪",           patch: "2.0", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },
  { id: 101, name: "光之鳥",           patch: "3.0", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },
  { id: 102, name: "蒼白幻象",         patch: "3.0", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },
  { id: 103, name: "帝國機甲",         patch: "4.0", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },
  { id: 104, name: "彩虹陸行鳥",       patch: "3.0", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },
  { id: 105, name: "白虎幻象",         patch: "5.0", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },
  { id: 106, name: "水精靈",           patch: "6.0", sources: [{ type: "商店",    detail: "Mog 工房商店" }] },

  // ── 聯名活動 ────────────────────────────────────────────
  { id: 110, name: "Yo-Kai 飛天板",   patch: "3.3", sources: [{ type: "聯名活動", detail: "妖怪手錶聯名活動（2016）" }] },
  { id: 111, name: "鏡面騎士",         patch: "3.3", sources: [{ type: "聯名活動", detail: "妖怪手錶聯名（任務）" }] },
  { id: 112, name: "FF15 帝國飛行艦",  patch: "4.1", sources: [{ type: "聯名活動", detail: "FF15 聯名活動（2017）" }] },
  { id: 113, name: "FF16 魔法盔甲",    patch: "6.5", sources: [{ type: "聯名活動", detail: "FF16 聯名活動（2023）" }] },

  // ── 節慶活動 ────────────────────────────────────────────
  { id: 120, name: "南瓜馬車",         patch: "2.2", sources: [{ type: "節慶活動", detail: "全靈節限定活動" }] },
  { id: 121, name: "馴鹿陸行鳥",       patch: "2.2", sources: [{ type: "節慶活動", detail: "星靈節限定活動" }] },
  { id: 122, name: "復活節陸行鳥",     patch: "2.2", sources: [{ type: "節慶活動", detail: "卵祭節限定活動" }] },

  // ── 探索航行 ────────────────────────────────────────────
  { id: 130, name: "深海幻影",         patch: "5.3", sources: [{ type: "探索航行", detail: "潛水艇探索 Sub-海域 Z" }] },
  { id: 131, name: "虛空漁夫",         patch: "3.0", sources: [{ type: "探索航行", detail: "飛空艇探索 D-海域" }] },

  // ── 金碟 ────────────────────────────────────────────────
  { id: 140, name: "煙火座騎",         patch: "3.2", sources: [{ type: "金碟",    detail: "金碟 MGP 兌換 200,000" }] },
  { id: 141, name: "陸行鳥衝浪板",     patch: "5.1", sources: [{ type: "金碟",    detail: "金碟 MGP 兌換" }] },

  // ── PvP ─────────────────────────────────────────────────
  { id: 150, name: "黑暗騎士",         patch: "4.0", sources: [{ type: "PvP",    detail: "Crystal Conflict 系列 25" }] },
  { id: 151, name: "末日幻象",         patch: "6.0", sources: [{ type: "PvP",    detail: "Crystalline Conflict 積分" }] },

  // ── 成就 ────────────────────────────────────────────────
  { id: 160, name: "戰鬥馬",           patch: "2.0", sources: [{ type: "成就",    detail: "成就「剿滅危機」" }] },
  { id: 161, name: "白金陸行鳥",       patch: "2.0", sources: [{ type: "成就",    detail: "成就「萬能的陸行鳥」" }] },
  { id: 162, name: "古老陸行鳥",       patch: "4.0", sources: [{ type: "成就",    detail: "成就「FATE 征服者」" }] },
  { id: 163, name: "宇宙船",           patch: "5.0", sources: [{ type: "成就",    detail: "成就「漂流者」" }] },
  { id: 164, name: "火鳳凰",           patch: "6.0", sources: [{ type: "成就",    detail: "成就「終焉傳說」" }] },
];

// 來源類型清單（用於篩選按鈕）
const SOURCE_TYPES = [
  "主線任務", "副本掉落", "高難度副本", "狩獵", "PvP",
  "任務", "成就", "金碟", "商店", "節慶活動",
  "市場板", "探索航行", "聯名活動", "其他"
];

// 版本清單
const PATCHES = [
  { label: "ARR 2.x", min: "2.0", max: "2.9" },
  { label: "HW 3.x",  min: "3.0", max: "3.9" },
  { label: "SB 4.x",  min: "4.0", max: "4.9" },
  { label: "ShB 5.x", min: "5.0", max: "5.9" },
  { label: "EW 6.x",  min: "6.0", max: "6.9" },
  { label: "DT 7.x",  min: "7.0", max: "7.9" },
];
