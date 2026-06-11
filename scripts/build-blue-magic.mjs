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
//   name        繁中名（zh-actions.json）或英文名（fallback）
//   nameEn      英文名（fields.Action.fields.Name）
//   icon        /i/xxxxxx/xxxxxx.png（transient.Icon）
//   rank        星級（fields.Rank）
//   aspect      屬性（從 transient.Stats 解析）
//   type        法術類型（從 transient.Stats 解析）
//   description 效果說明（transient.Description，英文）
//   learnFrom     [{type, detail}]（type = "副本"|"野外"|"圖騰"）
//                  圖騰額外有 npc, npcLocation 欄位
//   learnFromMob  ["怪物名（地點）", ...]（gamerescape 習得怪物，文字格式）
//   patch       加入版本（手動對照表）

import { writeFile, readFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "blue-magic.json");

const XIVAPI = "https://v2.xivapi.com";
const DELAY_MS = 150;

// 繁中名對照表（key = AozAction row_id）
// 來源：台服官方青魔法手帳
const ZH_NAMES = {
  1: "噴嚏", 2: "四噸重物", 3: "水炮", 4: "痛苦之歌", 5: "高壓電",
  6: "口臭", 7: "狂飛亂舞", 8: "水之吐息", 9: "地裂", 10: "橡果炸彈",
  11: "振毛", 12: "精神衝擊", 13: "吸血", 14: "投擲炸彈", 15: "千針",
  16: "鑽頭炮", 17: "凝視", 18: "尖銳之刃", 19: "瞬間移動", 20: "火焰放射",
  21: "恐嚇", 22: "炫目射線", 23: "導彈", 24: "白風", 25: "蜂刺",
  26: "自爆", 27: "輸血", 28: "蟾蜍油", 29: "弱點暴露", 30: "黏舌頭",
  31: "尾刺", 32: "五級石化", 33: "月之笛", 34: "死亡宣告", 35: "鬥氣守護",
  36: "冰刺", 37: "山羊之聲", 38: "龍之聲", 39: "奇異之光", 40: "墨汁噴射",
  41: "飛沙丁魚", 42: "金剛防禦", 43: "火焰投槍", 44: "羽毛雨", 45: "熔岩爆發",
  46: "山崩", 47: "雷擊", 48: "冰之舞", 49: "波濤之衣", 50: "山風",
  51: "波動波", 52: "寒流", 53: "靜電感應", 54: "冰刀斬", 55: "深淵貫穿",
  56: "啾啾聲", 57: "恐怖音波", 58: "呸姆治療", 59: "哥布林皮膚", 60: "魔法之鎚",
  61: "迴避", 62: "蛙腿", 63: "音爆", 64: "口哨", 65: "白騎士之旅",
  66: "黑騎士之旅", 67: "五級死亡", 68: "發射器", 69: "永恆射線", 70: "仙人掌守護",
  71: "復仇爆破", 72: "天使耳語", 73: "蛻皮", 74: "反流", 75: "吞噬",
  76: "濃縮天秤", 77: "以太模仿", 78: "索帕那卡", 79: "類星體", 80: "J踢",
  81: "三叉矛擊", 82: "刺激", 83: "榻榻米翻轉", 84: "寒霧", 85: "讚美詩",
  86: "聖光射線", 87: "汙穢洪水", 88: "天使點心", 89: "龜甲之門", 90: "毀滅之薔薇",
  91: "本能直覺", 92: "超高頻振動", 93: "燃燒", 94: "芥末炸彈", 95: "龍之力量",
  96: "以太火花", 97: "水流牽引", 98: "水之詛咒", 99: "喬科流星", 100: "魔導魔法",
  101: "外圍合成", 102: "極終", 103: "鬼魅連擊", 104: "夜之花",
  105: "哥布林重擊", 106: "旋轉", 107: "護盾陣", 108: "再水化",
  109: "魔法之息", 110: "狂暴", 111: "泥炭皮", 112: "深層清潔",
  113: "紅寶石動力", 114: "占卜盧恩", 115: "次元移位", 116: "信念詠嘆調",
  117: "力場", 118: "翼翅懲戒", 119: "激光眼", 120: "糖果杖",
  121: "不滅之炎", 122: "海洋之歌", 123: "啟示錄", 124: "凡人終途",
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

    // 繁中名：優先硬編碼對照表，fallback 英文名
    const name = ZH_NAMES[row.row_id] || nameEn;

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

    const no = t.Number ?? null;

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
