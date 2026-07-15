// 建立 blue-magic.json 青魔法資料庫
//
// 來源：XIVAPI v2 AozAction sheet（逐筆抓，transient 含圖示/編號/習得地點）
//       data/zh-actions.json（選用）— Teamcraft 繁中技能名對照表
//         若存在：從 https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/zh/actions.json 下載後放到 data/zh-actions.json
//         若不存在：name 欄位暫用英文名
//
// 為什麼本機跑：Cowork 沙箱擋外網。需 Node 18+（內建 fetch）。
//
// 執行（repo 根目錄）：
//   node scripts/build-blue-magic.mjs
//
// 產出欄位（data/blue-magic.json）：
//   id          AozAction row_id
//   no          手帳編號（transient.Number）
//   name        繁中名（ZH_NAMES 對照表，來源見下）或英文名（fallback）
//   nameEn      英文名（fields.Action.fields.Name）
//   icon        /i/xxxxxx/xxxxxx.png（transient.Icon）
//   rank        星級（fields.Rank）
//   aspect      屬性（從 transient.Stats 解析）
//   type        法術類型（從 transient.Stats 解析）
//   learnFrom     取得方式 [{type, detail, mobs?, cond?, npc?, npcLocation?}]
//   learnFromMob  （已淘汰，怪物併入 learnFrom.mobs）
//   patch       加入版本（手動對照表）
//
// ⚠ 重建後需依序再跑兩個 patch（本檔自身產出的 learnFrom/learnFromMob 僅為過時 baseline）：
//   1) scripts/patch-blue-magic-mechanic.mjs
//        補 mechanic（繁中機制效果：威力/增益秒數/狀態），來源 cafemaker 簡中 tooltip → opencc 轉繁。
//   2) scripts/patch-blue-magic-sources.mjs
//        以繁中來源（data/bluemage-sources-tc.json，ffxiv-collection-tc）「完整覆寫」
//        name 與 learnFrom（含 mobs/圖騰條件）、移除 learnFromMob。此為取得方式與名稱的權威來源。

import { writeFile, readFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "blue-magic.json");

const XIVAPI = "https://v2.xivapi.com";
const DELAY_MS = 150;

// 繁中名對照表（key = 手帳編號 no = AozActionTransient.Number）
// 來源：繁中收藏站 cycleapple/ffxiv-collection-tc（data/bluemage_sources.json 的 spell 欄）
//   https://github.com/cycleapple/ffxiv-collection-tc
//   FFXIV 無官方繁中版，此站為台灣玩家社群繁中譯名（多承襲簡中官方再台灣化，
//   如 水槍/最終刺針/乙太/魚叉）。先前的 ZH_NAMES（無來源、含語意錯誤如 Glower 誤作
//   「炫目射線」）已汰換。對齊以 no 為準（兩邊皆為手帳編號）。
const ZH_NAMES = {
  "1": "水槍", "2": "火炎放射", "3": "水紋吐息", "4": "狂亂", "5": "鑽頭砲",
  "6": "高壓電流", "7": "若隱若現", "8": "最終刺針", "9": "苦悶之歌", "10": "怒視",
  "11": "平原震裂", "12": "怒髮衝冠", "13": "白風", "14": "5級石化", "15": "鋒利菜刀",
  "16": "冰棘屏障", "17": "吸血", "18": "橡果炸彈", "19": "投彈", "20": "破防",
  "21": "自爆", "22": "融合", "23": "拍掌", "24": "投擲沙丁魚", "25": "鼻息",
  "26": "4星噸", "27": "詭異視線", "28": "臭氣", "29": "超硬化", "30": "強力守護",
  "31": "滑舌", "32": "油性分泌物", "33": "冰凍咆哮", "34": "雷電咆哮", "35": "導彈",
  "36": "千根針", "37": "噴墨", "38": "火投槍", "39": "月之笛", "40": "甩尾",
  "41": "精神衝擊", "42": "死亡宣告", "43": "驚奇光", "44": "飛翎雨", "45": "噴發",
  "46": "山崩", "47": "轟雷", "48": "冰雪亂舞", "49": "水神的面紗", "50": "高山氣流",
  "51": "萬變水波", "52": "狂風暴雪", "53": "生物電", "54": "寒光", "55": "深淵貫穿",
  "56": "嘰嘰喳喳", "57": "怪音波", "58": "澎澎療傷", "59": "哥布防禦", "60": "魔法錘",
  "61": "防禦指示", "62": "蛙腿", "63": "音爆", "64": "口笛", "65": "白騎士之旅",
  "66": "黑騎士之旅", "67": "5級致死一擊", "68": "火箭砲", "69": "永恆射線", "70": "仙人盾",
  "71": "復仇衝擊", "72": "天使低語", "73": "蛻皮", "74": "逆流", "75": "捕食",
  "76": "小偵測", "77": "乙太複製", "78": "穿甲散彈", "79": "類星體", "80": "正義飛踢",
  "81": "魚叉三段", "82": "霹靂霹靂", "83": "掀地板之術", "84": "冷霧", "85": "讚歌",
  "86": "聖光射線", "87": "污泥潑灑", "88": "天使的點心", "89": "玄結界", "90": "鬥靈彈",
  "91": "鬥爭本能", "92": "超振動", "93": "冰焰", "94": "芥末炸彈", "95": "龍之力",
  "96": "乙太火花", "97": "水力吸引", "98": "水脈詛咒", "99": "陸行鳥隕石", "100": "馬特拉魔法飛彈",
  "101": "生成外設", "102": "如意大旋風", "103": "鬼宿腳", "104": "月下彼岸花", "105": "哥布林拳",
  "106": "大迴旋", "107": "刺陣", "108": "補水", "109": "魔法吐息", "110": "獸魂的憤怒",
  "111": "玩泥球", "112": "大掃除", "113": "紅寶石電圈", "114": "魔之符文", "115": "空間轉換",
  "116": "加強信音", "117": "力場", "118": "斷罪飛翔", "119": "激射眼", "120": "糖果手杖",
  "121": "必滅之炎", "122": "咕嚕咕嚕", "123": "默示錄", "124": "終有一死",
};

// icon.path = "ui/icon/072000/072201.tex" → "/i/072000/072201.png"
function iconPath(icon) {
  if (!icon?.path) return null;
  const m = icon.path.match(/ui\/icon\/(\d+)\/(\d+)\.tex/);
  return m ? `/i/${m[1]}/${m[2]}.png` : null;
}

// 解析 transient.Stats 字串
// 格式範例："Type: Magic\nAspect: Wind\nRank: ★★★★\n"
// 或部分欄位缺失
function parseStats(stats) {
  if (!stats) return { aspect: null, spellType: null };
  const aspectMatch = stats.match(/Aspect:\s*(.+)/);
  const typeMatch = stats.match(/Type:\s*(.+)/);
  return {
    aspect: aspectMatch?.[1]?.trim() ?? null,
    spellType: typeMatch?.[1]?.trim() ?? null,
  };
}

// 屬性英文 → 繁中
const ASPECT_ZH = {
  Fire: "火", Ice: "冰", Wind: "風", Earth: "土", Lightning: "雷",
  Water: "水", Dark: "暗", Light: "光", Physical: "物理", None: "無",
  Magic: null, // Type 欄位，不是 Aspect
};

// 法術類型英文 → 繁中
const TYPE_ZH = {
  Physical: "物理",
  Magic: "魔法",
  Breath: "吐息",
  "Magical": "魔法",
};

// 野外地圖名稱 set（用於判斷 learnFrom type）
const FIELD_ZONES = new Set([
  "Central Shroud", "East Shroud", "North Shroud",
  "Middle La Noscea", "Lower La Noscea", "Eastern La Noscea", "Upper La Noscea",
  "Western Thanalan", "Southern Thanalan", "Northern Thanalan",
  "Mor Dhona", "Coerthas Western Highlands",
  "The Sea of Clouds", "Azys Lla",
  "The Dravanian Forelands", "The Dravanian Hinterlands",
  "The Lochs", "The Peaks", "Yanxia",
  "Kholusia", "Amh Araeng",
]);

// 習得地點英文 → 繁中（副本 + 野外地圖）
const LOCATION_ZH = {
  // 副本
  "the Tam–Tara Deepcroft": "坦姆·塔拉神廟",
  "Copperbell Mines (Hard)": "銅鈴銅礦（困難）",
  "Haukke Manor": "豪庫修别墅",
  "Cutter's Cry": "刀鳴洞穴",
  "the Stone Vigil (Hard)": "石衛城（困難）",
  "the Aurum Vale": "黃金谷",
  "the Wanderer's Palace": "放浪神宮殿",
  "Amdapor Keep": "阿姆達普爾古城",
  "Pharos Sirius": "塞壬燈塔",
  "Copperbell Mines (Hard)": "銅鈴銅礦（困難）",
  "Haukke Manor (Hard)": "豪庫修别墅（困難）",
  "Brayflox's Longstop (Hard)": "布雷弗洛克斯的露營地（困難）",
  "the Wanderer's Palace (Hard)": "放浪神宮殿（困難）",
  "Sastasha (Hard)": "薩薩塔（困難）",
  "the Sunken Temple of Qarn (Hard)": "卡爾恩沉沒神殿（困難）",
  "Battle in the Big Keep": "大城砦之戰",
  "the Binding Coil of Bahamut - Turn 1": "巴哈姆特大迷宮 邂逅篇1",
  "the Howling Eye (Extreme)": "嚎哭之眼（極難）",
  "the Bowl of Embers (Extreme)": "灼熱炭盆（極難）",
  "the Navel (Extreme)": "大地之臍（極難）",
  "the Striking Tree (Extreme)": "雷神木（極難）",
  "the Akh Afah Amphitheatre (Extreme)": "阿法圓形競技場（極難）",
  "the Whorleater (Extreme)": "海神之嗥（極難）",
  "the Dragon's Neck": "龍頸",
  "the Dusk Vigil": "黃昏前哨站",
  "the Great Gubal Library": "古巴拉大圖書館",
  "the Great Gubal Library (Hard)": "古巴拉大圖書館（困難）",
  "Saint Mocianne's Arboretum": "聖莫西安植物園",
  "Saint Mocianne's Arboretum (Hard)": "聖莫西安植物園（困難）",
  "Pharos Sirius (Hard)": "塞壬燈塔（困難）",
  "the Vault": "聖教騎士團教堂",
  "Baelsar's Wall": "貝爾薩斯長城",
  "Alexander - The Fist of the Father": "亞歷山大機神城 起動篇1",
  "Alexander - The Arm of the Father": "亞歷山大機神城 起動篇2",
  "Alexander - The Burden of the Father": "亞歷山大機神城 起動篇4",
  "Alexander - The Burden of the Son": "亞歷山大機神城 律動篇4",
  "Thok ast Thok (Hard)": "托克阿斯托克（困難）",
  "Containment Bay P1T6": "禁獄P1T6",
  "Thornmarch (Hard)": "荊棘冠（困難）",
  "Kugane Castle": "黃金宮殿",
  "Emanation": "神體顯現",
  "the Aery": "龍巢",
  "the Vault": "聖教騎士團教堂",
  "the Temple of the Fist": "拳神殿",
  "Deltascape V1.0": "歐米茄機神城 次元篇1",
  "Sigmascape V1.0": "歐米茄機神城 小宇宙篇1",
  "Alphascape V3.0": "歐米茄機神城 宇宙篇3",
  "the Burn": "灼熱地帶",
  "the Drowned City of Skalla": "水都斯卡拉",
  "Hells' Lid": "魔界島蓋子",
  "the Swallow's Compass": "燕王盤",
  "Castrum Fluminis": "河川要塞",
  "Hells' Kier": "魔界島歸處",
  "Dohn Mheg": "多恩·梅格",
  "the Dancing Plague": "妖精の宴（極難）",
  "the Crown of the Immaculate": "純白之冠",
  "Eden's Gate: Resurrection": "伊甸希望樂園 覺醒篇1",
  "Eden's Promise: Eternity": "伊甸誓約樂園 共鳴篇4",
  "Mt. Gulg": "古爾格山",
  "the Grand Cosmos": "大宇宙",
  "the Heroes' Gauntlet": "英雄試煉",
  "Malikah's Well": "瑪利卡之井",
  "Matoya's Relict": "瑪托雅的遺蹟",
  "Cinder Drift": "煤渣漂移",
  "Amaurot": "阿瑪烏洛特",
  // 野外地圖
  "Central Shroud": "黑衣森林中央林區",
  "East Shroud": "黑衣森林東部林區",
  "North Shroud": "黑衣森林北部林區",
  "Middle La Noscea": "拉諾西亞中部",
  "Lower La Noscea": "拉諾西亞低地",
  "Eastern La Noscea": "拉諾西亞東部",
  "Upper La Noscea": "拉諾西亞高地",
  "Western Thanalan": "薩納蘭西部",
  "Southern Thanalan": "薩納蘭南部",
  "Northern Thanalan": "薩納蘭北部",
  "Mor Dhona": "摩杜納",
  "Coerthas Western Highlands": "庫爾札斯西部高地",
  "The Sea of Clouds": "雲海",
  "Azys Lla": "阿吉斯·拉",
  "The Dravanian Forelands": "龍族領地前地",
  "The Dravanian Hinterlands": "龍族領地後地",
  "The Lochs": "阿拉戈海",
  "The Peaks": "基拉巴尼亞山岳地帯",
  "Yanxia": "揚夏",
  "Kholusia": "庫洛西亞",
  "Amh Araeng": "安·阿拉恩",
};

// patch 版本對照（依手帳編號）
function getPatch(no) {
  if (no <= 49) return "4.5";
  if (no <= 71) return "5.1";
  if (no <= 80) return "5.15";
  if (no <= 103) return "5.25";
  if (no <= 124) return "6.1";
  if (no <= 144) return "6.5";
  if (no <= 168) return "7.0";
  return "7.2";
}

// 習得怪物資料（來源：gamerescape，2026-06-09 擷取）
// key = 青魔法手帳編號，value = [{mobName, location}]
const MOB_SOURCES = {"1":[],"2":[],"3":[{"mobName":"Leviathan","location":"The Whorleater"},{"mobName":"Ultros","location":""}],"4":[],"5":[{"mobName":"Abandoned Vanguard","location":"Raubahn's Push"},{"mobName":"Magitek Vanguard H-2","location":"Raubahn's Push"}],"6":[{"mobName":"ADS","location":"Meteor Fissure"},{"mobName":"ADS","location":"Sector VI"},{"mobName":"Bestial Node","location":""}],"7":[{"mobName":"Baalzephon","location":"The Lost City of Amdapor"},{"mobName":"Dantalion","location":"The Tam-Tara Deepcroft (Hard)"},{"mobName":"Flame Sergeant Dalvag","location":""}],"8":[{"mobName":"Killer Wespe","location":"Three-malm Bend"},{"mobName":"Temple Bee","location":"The Sunken Temple of Qarn"}],"9":[],"10":[],"11":[{"mobName":"Azulmagia (Boss)","location":"Blue Sky"},{"mobName":"Basalt Golem","location":"The Floating City of Nym"},{"mobName":"Clay Golem","location":""}],"12":[{"mobName":"Angry Sow","location":"Lifemend Stump"},{"mobName":"Wild Boar","location":"The Bramble Patch"}],"13":[],"14":[{"mobName":"Manor Sentry","location":"Ground Floor (Haukke Manor)"}],"15":[{"mobName":"Marberry","location":"Upper La Noscea"}],"16":[{"mobName":"Azulmagia (Boss)","location":"Blue Sky"},{"mobName":"Thievish Imp","location":"Chocobo Forest"},{"mobName":"Thievish Imp","location":""}],"17":[{"mobName":"Black Bat","location":"Sastasha"},{"mobName":"Cave Bat","location":"Blind Iron Mines"},{"mobName":"Chigoe","location":""}],"18":[{"mobName":"Treant Sapling","location":"Treespeak"},{"mobName":"Treant Sapling","location":"Jadeite Thick"},{"mobName":"Treant Sapling","location":""}],"19":[{"mobName":"Goblin Fisher","location":"Summerford"},{"mobName":"Goblin Gambler","location":"Summerford"},{"mobName":"Goblin Outlaw","location":"Central Shroud"}],"20":[],"21":[{"mobName":"Blasting Cap","location":"Shaft E1"},{"mobName":"Gas Bomb","location":"Halatali"},{"mobName":"Glide Bomb","location":""}],"22":[],"23":[{"mobName":"Qiqirn Gullroaster","location":"Gullperch Tower"},{"mobName":"Qiqirn Gullroaster","location":"Bloodshore"},{"mobName":"Qiqirn Scrambler","location":""}],"24":[{"mobName":"Apkallu","location":"Bloodshore"}],"25":[{"mobName":"Typhon","location":"Halatali (Zone)"}],"26":[{"mobName":"Ultros","location":"Halatali (Zone)"}],"27":[{"mobName":"Anantaboga","location":"The Presence Chamber (Amdapor Keep)"},{"mobName":"Bibliolater","location":"The Great Gubal Library (Hard) (Zone)"},{"mobName":"Denizen of the Dark","location":""}],"28":[{"mobName":"Goldvine","location":"The Aurum Vale"},{"mobName":"Halitostroper","location":"Sorrel Haven"},{"mobName":"Miser's Mistress","location":""}],"29":[{"mobName":"Cuca Fera","location":"The Stone Vigil (Hard) (Zone)"}],"30":[],"31":[{"mobName":"Cane Toad","location":"Moraby Bay"},{"mobName":"Ledge Leaper","location":"Western Thanalan"},{"mobName":"Nether Nix","location":"The Aurum Vale"},{"mobName":"Nix","location":""}],"32":[],"33":[{"mobName":"Apademak","location":"Blue Sky"},{"mobName":"Azulmagia (Boss)","location":"Blue Sky"},{"mobName":"Chimera","location":""}],"34":[{"mobName":"Apademak","location":"Blue Sky"},{"mobName":"Azulmagia (Boss)","location":"Blue Sky"},{"mobName":"Chimera","location":""}],"35":[],"36":[{"mobName":"Flowering Sabotender","location":"Broken Water"},{"mobName":"Sabotender Bailaor","location":"Broken Water"},{"mobName":"Sabotender Desertor","location":""}],"37":[{"mobName":"Kraken","location":"Sastasha (Hard)"}],"38":[],"39":[],"40":[{"mobName":"Brutal Barber","location":"Rustrock"},{"mobName":"Clay Claw","location":"Strategeion - 4F"},{"mobName":"Crag Claw","location":""}],"41":[{"mobName":"Blaster","location":"Machinery Bay 67"},{"mobName":"Blaster","location":"Machinery Bay 67"},{"mobName":"Blaster","location":""}],"42":[],"43":[{"mobName":"Lentic Mudpuppy","location":"Fogfens"},{"mobName":"Surf Eft","location":"Mudstop Watergush"}],"44":[],"45":[],"46":[],"47":[{"mobName":"Ramuh","location":"The Striking Tree"},{"mobName":"Ramuh","location":"The Striking Tree"}],"48":[{"mobName":"Shiva","location":"Akh Afah Amphitheatre"}],"49":[{"mobName":"Leviathan","location":"The Whorleater"},{"mobName":"Leviathan","location":"The Whorleater"}],"50":[{"mobName":"Griffin","location":"The Sea of Clouds"},{"mobName":"Griffin","location":"The Sea of Clouds"},{"mobName":"Gryps","location":""}],"51":[{"mobName":"Living Liquid","location":"Condensate Demineralizer 9"},{"mobName":"Living Liquid","location":"Condensate Demineralizer 9"},{"mobName":"Shikigami of the Undertow","location":""}],"52":[{"mobName":"Lone Yeti","location":"The Bed of Bones"},{"mobName":"Mirka","location":"Coerthas Western Highlands"},{"mobName":"Slate Yeti","location":""}],"53":[{"mobName":"Conodont","location":"Voor Sian Siran"}],"54":[{"mobName":"Faust","location":"Machinery Bay 44"},{"mobName":"Faust","location":"Machinery Bay 44"},{"mobName":"Faust","location":""}],"55":[{"mobName":"Arch Demon","location":"The Paths of Creation"}],"56":[{"mobName":"Paissa","location":"Cloudtop"},{"mobName":"Squonk","location":"The Sea of Clouds"}],"57":[{"mobName":"Empuse","location":"Beta Quadrant"},{"mobName":"Empuse","location":"Beta Quadrant"},{"mobName":"Empuse","location":""}],"58":[{"mobName":"Furryfoot Kupli Kipp","location":"Thornmarch"},{"mobName":"Furryfoot Kupli Kipp","location":"Thornmarch"}],"59":[{"mobName":"Slipkinx Steeljoints","location":"The Dravanian Hinterlands"}],"60":[{"mobName":"Epilogi","location":"Blue Sky"}],"61":[],"62":[{"mobName":"Bero Roggo","location":"The Ruling Quarter"},{"mobName":"Poroggo","location":"The Ruling Quarter"}],"63":[{"mobName":"Anzu (Mob)","location":"The Gauntlet"},{"mobName":"Cornu","location":"Outer La Noscea"}],"64":[{"mobName":"Dhalmel","location":"Last Step"},{"mobName":"Jhammel","location":"Mount Yorn"}],"65":[{"mobName":"White Knight","location":"The Vault (Zone)"}],"66":[{"mobName":"Black Knight","location":"The Vault (Zone)"}],"67":[{"mobName":"Page 64","location":"Middle Floors"},{"mobName":"Page 64","location":"Convocation House"},{"mobName":"Page 64","location":""}],"68":[{"mobName":"Armored Weapon","location":"Magitek Installation"},{"mobName":"Doman Armored Weapon","location":"Hall of the Four Pillars"},{"mobName":"Gamma","location":""}],"69":[{"mobName":"The Manipulator","location":"The Burden of the Father"},{"mobName":"The Manipulator","location":"The Burden of the Father"}],"70":[{"mobName":"Sabotender Guardia","location":"The Sunken Temple of Qarn (Hard) (Zone)"}],"71":[],"72":[],"73":[{"mobName":"Abalathian Wamoura","location":"The Blue Window"}],"74":[{"mobName":"Cloud Wyvern","location":"Four Arms"}],"75":[{"mobName":"Caduceus","location":"Allagan Megastructure"}],"76":[{"mobName":"Arena Scribe","location":"Blue Sky"}],"77":[{"mobName":"Corruption","location":"Fuel Chamber"}],"78":[],"79":[],"80":[{"mobName":"Brute Justice","location":"The Burden of the Son"},{"mobName":"Brute Justice","location":"The Burden of the Son"}],"81":[{"mobName":"Ebisu Catfish","location":"Valley of the Fallen Rainbow"},{"mobName":"Thieving Namazu","location":"The Glittering Basin"}],"82":[{"mobName":"Ebisu Catfish","location":"Valley of the Fallen Rainbow"}],"83":[],"84":[],"85":[],"86":[],"87":[{"mobName":"The Mudman","location":"Il Mheg"},{"mobName":"Tokkapchi","location":"Kingsloam"}],"88":[],"89":[],"90":[],"91":[{"mobName":"Master Coeurl","location":"Fool Falls"}],"92":[{"mobName":"Kongamato (Monster)","location":"Wightrock"}],"93":[],"94":[{"mobName":"Omega (Alphascape V3.0)","location":"Final Verification"},{"mobName":"Omega (Alphascape V3.0)","location":"Final Verification"}],"95":[],"96":[{"mobName":"Salt Dhruva","location":"The White Aisle"}],"97":[{"mobName":"Kelpie","location":"The Green Screams"}],"98":[],"99":[{"mobName":"Courser Chocobo","location":"Chocobo Forest"}],"100":[],"101":[{"mobName":"Omega (Alphascape V3.0)","location":"Final Verification"},{"mobName":"Omega (Alphascape V3.0)","location":"Final Verification"}],"102":[],"103":[{"mobName":"Suzaku","location":"Hells' Kier (Zone)"},{"mobName":"Suzaku","location":"Hells' Kier (Zone)"}],"104":[{"mobName":"Tsukuyomi","location":"Castrum Fluminis (Zone)"},{"mobName":"Tsukuyomi","location":"Castrum Fluminis (Zone)"}],"105":[{"mobName":"Hobgoblin","location":"Cracked Shell Beach"}],"106":[],"107":[{"mobName":"Long-tailed Armadillo","location":"Ladle"},{"mobName":"Vajrakumara","location":"Thavnair"}],"108":[{"mobName":"Slippery Armadillo","location":"Qasr Sharl"}],"109":[],"110":[],"111":[{"mobName":"Mudman","location":"Clayclot Cauldron"}],"112":[],"113":[],"114":[],"115":[],"116":[],"117":[],"118":[],"119":[],"120":[],"121":[],"122":[],"123":[],"124":[]};

// 鯨勇圖騰取得的技能（no = 手帳編號）
// 這些技能沒有打怪來源，需從 Ul'dah Steps of Thal 的 Wayward Gaheel Ja NPC 以鯨勇圖騰兌換
// 來源：gamerescape Blue Mage Spell 頁面「Requires: Whalaqee X Totem」
const TOTEM_SOURCES = {
   1: "鯨勇水炮圖騰",
  13: "鯨勇白風圖騰",
  20: "鯨勇刺激圖騰",
  22: "鯨勇吸血圖騰",
  30: "鯨勇鬥氣守護圖騰",
  39: "鯨勇月之笛圖騰",
  42: "鯨勇死亡宣告圖騰",
  71: "鯨勇復仇爆破圖騰",
  72: "鯨勇天使耳語圖騰",
  88: "鯨勇天使點心圖騰",
  95: "鯨勇龍之力量圖騰",
 100: "鯨勇魔導魔法圖騰",
 109: "鯨勇魔法之息圖騰",
 117: "鯨勇力場圖騰",
};

// 分頁抓整張 sheet（帶 transient 參數）
async function fetchAllRows() {
  const fields = "Rank,Action.Name";
  const transient = "Icon,Number,Stats,Location.Name";
  const rows = [];
  let after = 0;
  while (true) {
    const url = `${XIVAPI}/api/sheet/AozAction?fields=${encodeURIComponent(fields)}&transient=${encodeURIComponent(transient)}&limit=500&after=${after}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} @ after=${after}`);
    const json = await res.json();
    const batch = json.rows || [];
    if (!batch.length) break;
    rows.push(...batch);
    after = batch[batch.length - 1].row_id;
    if (batch.length < 500) break;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  return rows;
}


async function main() {
  console.log("📡 抓 AozAction sheet...");
  const rows = await fetchAllRows();
  console.log(`  ✅ ${rows.length} 筆`);

  // 載入 monsters.json 建立英文名 → 繁中名 map
  const monstersJson = JSON.parse(await readFile(join(DATA, "monsters.json"), "utf-8"));
  const enToTw = new Map();
  for (const m of monstersJson.data) {
    if (m.nameEn && m.name) enToTw.set(m.nameEn.toLowerCase(), m.name);
  }

  const data = [];
  for (const row of rows) {
    const f = row.fields || {};
    const t = row.transient || {};

    const nameEn = f.Action?.fields?.Name || null;
    if (!nameEn || nameEn.trim() === "") continue;

    const no = t.Number ?? null;

    // 繁中名：以手帳編號 no 查對照表（來源 ffxiv-collection-tc），fallback 英文名
    const name = (no != null && ZH_NAMES[String(no)]) || nameEn;

    const { aspect: aspectEn, spellType: spellTypeEn } = parseStats(t.Stats);
    const aspect = aspectEn ? (ASPECT_ZH[aspectEn] ?? aspectEn) : null;
    const type = spellTypeEn ? (TYPE_ZH[spellTypeEn] ?? spellTypeEn) : null;

    const learnFrom = [];
    const loc = t.Location;
    if (loc?.fields?.Name && loc.value) {
      const locNameEn = loc.fields.Name;
      const locNameZh = LOCATION_ZH[locNameEn] ?? locNameEn;
      const locType = FIELD_ZONES.has(locNameEn) ? "野外" : "副本";
      const idKey = locType === "副本" ? "contentId" : "mapId";
      learnFrom.push({ type: locType, [idKey]: loc.value, detail: locNameZh });
    }

    data.push({
      id: row.row_id,
      no,
      name,
      nameEn,
      icon: iconPath(t.Icon),
      rank: f.Rank ?? null,
      aspect,
      type,
      learnFrom,
      patch: no ? getPatch(no) : null,
    });
  }

  // 補充 monsters.json 找不到的特殊怪物名
  const EXTRA_NAME_MAP = {
    "ledge leaper": "跳崖豹",
    "omega (alphascape v3.0)": "歐米茄",
  };
  // 註：以下 learnFrom/learnFromMob（gamerescape baseline）會被 patch-blue-magic-sources.mjs
  //     依繁中來源 ffxiv-collection-tc 完整覆寫，僅作為未跑 patch 時的暫時備援。

  // 套用 MOB_SOURCES hardcode 資料，怪物名轉繁中（查不到則保留英文）
  for (const spell of data) {
    const mobs = (MOB_SOURCES[String(spell.no)] || [])
      .filter((m, i, arr) => m.mobName && arr.findIndex(x => x.mobName === m.mobName) === i)
      .map(m => {
        const rawName = m.mobName.replace(/\s*\((Boss|Monster|Mob|Enemy)\)\s*/i, "").trim();
        const key = rawName.toLowerCase();
        const twName = enToTw.get(key) || EXTRA_NAME_MAP[m.mobName.toLowerCase()] || rawName;
        return m.location ? `${twName}（${m.location}）` : twName;
      });
    spell.learnFromMob = mobs;

    // 鯨勇圖騰取得方式
    const totemName = TOTEM_SOURCES[spell.no];
    if (totemName) {
      spell.learnFrom.push({
        type: "圖騰",
        detail: totemName,
        npc: "Wayward Gaheel Ja",
        npcLocation: "烏爾達哈 薩爾之階",
      });
    }
  }

  data.sort((a, b) => (a.no ?? 9999) - (b.no ?? 9999));

  const output = {
    schema: "blue-magic",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "xivapi",
    count: data.length,
    data,
  };

  const { writeFile: wf, readFile: rf, copyFile: cf } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const TMP = join(tmpdir(), "blue_magic_build.json");
  const jsonStr = JSON.stringify(output, null, 2);
  await writeFile(TMP, jsonStr, "utf-8");

  const verify = await readFile(TMP, "utf-8");
  if (!verify.endsWith("}\n")) {
    throw new Error(`JSON 完整性檢查失敗！結尾：${JSON.stringify(verify.slice(-20))}`);
  }
  JSON.parse(verify);

  await copyFile(TMP, OUT);
  console.log(`✅ 完成！${data.length} 筆 → ${OUT}`);

  const noZh = data.filter(d => d.name === d.nameEn).length;
  if (noZh > 0) console.log(`⚠️  ${noZh} 筆暫用英文名`);

  console.log("\n前 3 筆預覽：");
  console.log(JSON.stringify(data.slice(0, 3), null, 2));
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});
