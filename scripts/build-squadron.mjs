// 建立 data/squadron.json 冒險者小隊資料庫（小隊計算機用）
//
// 來源（2026-06-12 抓取，小隊內容自 4.x 後未變動，故直接內嵌原始數值）：
//   XIVAPI v2  GcArmyExpedition / GcArmyTraining / GcArmyExpeditionTrait /
//              GcArmyExpeditionTraitCond / GcArmyCaptureTactics / GcArmyMemberGrow
//     https://v2.xivapi.com/api/sheet/GcArmyExpedition?fields=Name,RequiredLevel,...
//   thewakingsands ffxiv-datamining-cn 同名 CSV（簡中名 → OpenCC 轉繁）
//     https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/GcArmyExpedition.csv
//   驗證：ffxiv.consolegameswiki.com/wiki/Squadron_Missions（門檻為 6 組輪替變體之一、
//         經驗值 wiki 為 4.2 加成前數值 ×1.5 = sheet 現值，吻合）
//
// 為什麼內嵌：Cowork 沙箱擋外網；且小隊資料量小又多年未改版。
// 重新抓取方式見上列 URL（陣列欄位語法 RequiredPhysical[0..5] 等）。
//
// 執行（repo 根目錄）： node scripts/build-squadron.mjs
//
// data[] 以 kind 區分六類：
//   mission(34)            訓練/一般/特殊任務。requireVariants 為 6 組每週輪替門檻；
//                          旗艦任務(flagged) 6 組相同 → require 給固定值，未達全部門檻必失敗
//   training(7)            訓練項目（sheet 僅載加值；屬性總和達上限時其他屬性會下降-社群觀察）
//   chemistry(23)          化學反應效果。valuesByRank/chanceByRank 為等級 1~5 的效果值/觸發率(%)
//   chemistryCondition(26) 化學反應觸發條件（與效果隨機配對）
//   tactic(4)              指令任務（副本）作戰方針 buff
//   memberGrowth(9)        各職業隊員 Lv1~60 屬性成長表（隊員屬性僅由職業+等級決定）

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as OpenCC from "opencc-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const occ = OpenCC.Converter({ from: "cn", to: "tw" });
// 台灣慣用詞與引號後處理（OpenCC cn->tw 不涵蓋）
const conv = (s) => occ(s).replaceAll("\u5e7e\u7387", "\u6a5f\u7387").replaceAll("\u201c", "\u300c").replaceAll("\u201d", "\u300d");

// ---------------------------------------------------------------------------
// 原始資料：missions（GcArmyExpedition rows 1-34）
// 欄位：id, en, cn, lvl, sealsCost, exp, base(PercentBase), type(1簡單/2普通/3特殊),
//       item/qty（獎勵道具，0=無）, p/m/t = Required{Physical|Mental|Tactical}[0..5]
// 非旗艦：Percent{Physical|Mental|Tactical}Met=20, PercentAllMet=20
// 旗艦(base=0)：per-stat 0, PercentAllMet=100
// ---------------------------------------------------------------------------
const MISSIONS = [
  { id:1,  en:"City Patrol",            cn:"巡逻城内",           lvl:1,  seals:0,    exp:7500,  base:100, type:1, item:0,     qty:0,
    p:[145,145,145,145,145,145], m:[140,140,140,140,140,140], t:[140,140,140,140,140,140] },
  { id:2,  en:"Military Courier",       cn:"向附近据点传令",     lvl:1,  seals:500,  exp:7500,  base:20, type:1, item:0,     qty:0,
    p:[165,165,165,150,160,150], m:[160,160,170,170,150,160], t:[160,160,150,165,175,175] },
  { id:3,  en:"Outskirts Patrol",       cn:"巡逻城市周边道路",   lvl:1,  seals:500,  exp:9000,  base:20, type:1, item:0,     qty:0,
    p:[245,245,150,195,155,195], m:[155,200,255,255,195,155], t:[200,155,195,150,250,250] },
  { id:4,  en:"Beastmen Recon",         cn:"侦察蛮族部队",       lvl:5,  seals:500,  exp:10500, base:20, type:1, item:0,     qty:0,
    p:[150,195,155,245,245,195], m:[255,155,195,200,155,255], t:[195,250,250,155,200,150] },
  { id:5,  en:"Supply Wagon Escort",    cn:"护卫补给部队",       lvl:10, seals:500,  exp:12000, base:20, type:1, item:0,     qty:0,
    p:[210,125,305,305,210,115], m:[125,210,210,130,320,320], t:[310,310,130,210,115,210] },
  { id:6,  en:"Pest Eradication",       cn:"驱除魔物",           lvl:15, seals:500,  exp:13500, base:20, type:1, item:14945, qty:1,
    p:[140,225,320,320,130,225], m:[225,140,145,225,335,335], t:[325,325,225,145,225,130] },
  { id:7,  en:"Flagged Mission: Voidsent Elimination", cn:"重要任务：消灭低级妖异", lvl:20, seals:2000, exp:21000, base:0, type:1, item:15772, qty:1,
    p:[225,225,225,225,225,225], m:[205,205,205,205,205,205], t:[230,230,230,230,230,230],
    note:"consolegameswiki 舊資料載 235/245/255（4.2 版有下修門檻），sheet 現值 225/205/230，待實測覆核" },
  { id:8,  en:"Frontline Support",      cn:"支援前线部队",       lvl:20, seals:1000, exp:15000, base:20, type:2, item:0,     qty:0,
    p:[265,410,265,140,410,125], m:[140,145,435,265,270,435], t:[420,270,125,420,145,265] },
  { id:9,  en:"Officer Escort",         cn:"护卫同盟军军官",     lvl:20, seals:1000, exp:16500, base:20, type:2, item:0,     qty:0,
    p:[270,130,270,145,415,415], m:[440,440,145,270,275,150], t:[130,270,425,425,150,275] },
  { id:10, en:"Border Patrol",          cn:"巡逻郊外道路",       lvl:25, seals:1000, exp:19500, base:20, type:2, item:0,     qty:0,
    p:[425,140,280,425,280,155], m:[285,450,155,160,450,280], t:[160,280,435,285,140,435] },
  { id:11, en:"Stronghold Recon",       cn:"侦察蛮族据点",       lvl:30, seals:1000, exp:22500, base:20, type:2, item:0,     qty:0,
    p:[170,440,440,295,155,295], m:[295,300,175,465,465,170], t:[450,175,300,155,295,450] },
  { id:12, en:"Search and Rescue",      cn:"搜索失踪人员",       lvl:35, seals:1000, exp:25500, base:20, type:2, item:0,     qty:0,
    p:[310,185,455,170,310,455], m:[480,310,315,480,185,190], t:[170,465,190,310,465,315] },
  { id:13, en:"Allied Maneuvers",       cn:"与同盟军的联合演习", lvl:35, seals:1000, exp:27000, base:20, type:2, item:14945, qty:1,
    p:[455,310,170,310,185,455], m:[190,480,480,185,310,315], t:[315,170,310,465,465,190] },
  { id:14, en:"Flagged Mission: Crystal Recovery", cn:"重要任务：夺取水晶", lvl:40, seals:4000, exp:30000, base:0, type:2, item:0, qty:0,
    p:[315,315,315,315,315,315], m:[325,325,325,325,325,325], t:[340,340,340,340,340,340] },
  { id:15, en:"Flagged Mission: Crystal Recovery", cn:"重要任务：夺取水晶", lvl:40, seals:4000, exp:30000, base:0, type:2, item:0, qty:0,
    p:[315,315,315,315,315,315], m:[325,325,325,325,325,325], t:[340,340,340,340,340,340],
    note:"資料表中與 id14 同名同值的重複列（解鎖旗標不同），遊戲內為同一任務" },
  { id:16, en:"Stronghold Assault",     cn:"强袭蛮族据点",       lvl:40, seals:2000, exp:30000, base:20, type:3, item:14946, qty:5,
    p:[530,530,385,245,385,265], m:[385,275,560,560,265,385], t:[275,385,245,385,540,540] },
  { id:17, en:"Black Market Crackdown", cn:"取缔违法武器交易",   lvl:40, seals:2000, exp:30000, base:20, type:3, item:14947, qty:5,
    p:[385,245,385,265,530,530], m:[560,560,265,385,385,275], t:[245,385,540,540,275,385] },
  { id:18, en:"Imperial Recon",         cn:"侦察帝国军据点",     lvl:40, seals:2000, exp:30000, base:20, type:3, item:14948, qty:5,
    p:[385,265,530,530,385,245], m:[265,385,385,275,560,560], t:[540,540,275,385,245,385] },
  { id:19, en:"Imperial Pursuit",       cn:"追踪帝国军逃兵",     lvl:40, seals:2000, exp:30000, base:20, type:3, item:14949, qty:5,
    p:[530,385,245,385,265,530], m:[275,560,560,265,385,385], t:[385,245,385,540,540,275] },
  { id:20, en:"Imperial Feint",         cn:"发动对帝国军的牵制攻击", lvl:40, seals:2000, exp:30000, base:20, type:3, item:14950, qty:5,
    p:[245,385,265,530,530,385], m:[560,265,385,385,275,560], t:[385,540,540,275,385,245] },
  { id:21, en:"Supply Line Disruption", cn:"切断蛮族补给线作战", lvl:40, seals:2000, exp:30000, base:20, type:3, item:14951, qty:5,
    p:[265,530,530,385,245,385], m:[385,385,275,560,560,265], t:[540,275,385,245,385,540] },
  { id:22, en:"Criminal Pursuit",       cn:"追踪通缉犯",         lvl:40, seals:2000, exp:30000, base:20, type:3, item:14952, qty:5,
    p:[530,530,245,385,265,385], m:[275,385,560,560,385,265], t:[385,275,385,245,540,540] },
  { id:23, en:"Supply Wagon Destruction", cn:"歼灭帝国军补给部队", lvl:40, seals:2000, exp:30000, base:20, type:3, item:14953, qty:5,
    p:[245,385,265,385,530,530], m:[560,560,385,265,275,385], t:[385,245,540,540,385,275] },
  { id:24, en:"Chimerical Elimination", cn:"消灭合成生物",       lvl:40, seals:2000, exp:30000, base:20, type:3, item:14954, qty:5,
    p:[265,385,530,530,245,385], m:[385,265,275,385,560,560], t:[540,540,385,275,385,245] },
  { id:25, en:"Primal Recon",           cn:"与拂晓的共同作战",   lvl:50, seals:3000, exp:37500, base:20, type:3, item:14946, qty:10,
    p:[295,430,590,590,275,430], m:[430,295,305,430,620,620], t:[600,600,430,305,430,275] },
  { id:26, en:"Counter-magitek Exercises", cn:"开发反魔导兵器战术", lvl:50, seals:3000, exp:37500, base:20, type:3, item:14947, qty:10,
    p:[275,430,295,430,590,590], m:[620,620,430,295,305,430], t:[430,275,600,600,430,305] },
  { id:27, en:"Infiltrate and Rescue",  cn:"市民救出作战",       lvl:50, seals:3000, exp:37500, base:20, type:3, item:14948, qty:10,
    p:[590,590,275,430,295,430], m:[305,430,620,620,430,295], t:[430,305,430,275,600,600] },
  { id:28, en:"Outlaw Subjugation",     cn:"消灭武装集团",       lvl:50, seals:3000, exp:37500, base:20, type:3, item:14949, qty:10,
    p:[295,590,590,430,275,430], m:[430,430,305,620,620,295], t:[600,305,430,275,430,600] },
  { id:29, en:"Cult Crackdown",         cn:"取缔违法邪教教团",   lvl:50, seals:3000, exp:37500, base:20, type:3, item:14950, qty:10,
    p:[275,430,295,590,590,430], m:[620,295,430,430,305,620], t:[430,600,600,305,430,275] },
  { id:30, en:"Voidsent Elimination",   cn:"消灭非法召唤的妖异", lvl:50, seals:3000, exp:37500, base:20, type:3, item:14951, qty:10,
    p:[590,430,275,430,295,590], m:[305,620,620,295,430,430], t:[430,275,430,600,600,305] },
  { id:31, en:"Armor Annihilation",     cn:"击破帝国军废弃兵器", lvl:50, seals:3000, exp:37500, base:20, type:3, item:14952, qty:10,
    p:[430,295,590,590,430,275], m:[295,430,430,305,620,620], t:[600,600,305,430,275,430] },
  { id:32, en:"Invasive Testing",       cn:"排除哥布林族集团",   lvl:50, seals:3000, exp:37500, base:20, type:3, item:14953, qty:10,
    p:[430,275,430,295,590,590], m:[620,620,295,430,430,305], t:[275,430,600,600,305,430] },
  { id:33, en:"Impostor Alert",         cn:"揭发假副牙士",       lvl:50, seals:3000, exp:37500, base:20, type:3, item:14954, qty:10,
    p:[590,590,430,275,430,295], m:[430,305,620,620,295,430], t:[305,430,275,430,600,600] },
  { id:34, en:"Flagged Mission: Sapper Strike", cn:"重要任务：歼灭帝国军特殊部队", lvl:50, seals:5000, exp:40000, base:0, type:2, item:0, qty:0,
    p:[370,370,370,370,370,370], m:[355,355,355,355,355,355], t:[345,345,345,345,345,345] },
];

const TYPE = {
  1: { en: "Trainee Mission",  cn: "简单任务", key: "trainee" },
  2: { en: "Routine Mission",  cn: "普通任务", key: "routine" },
  3: { en: "Priority Mission", cn: "特殊任务", key: "priority" },
};

// trainings（GcArmyTraining rows 1-7）
const TRAININGS = [
  { id:1, en:"Basic Training: Physical",  cn:"基础训练：体能", descCn:"综合体能＋40", p:40, m:0,  t:0,  exp:2000 },
  { id:2, en:"Basic Training: Mental",    cn:"基础训练：心智", descCn:"综合心智＋40", p:0,  m:40, t:0,  exp:2000 },
  { id:3, en:"Basic Training: Tactical",  cn:"基础训练：战术", descCn:"综合战术＋40", p:0,  m:0,  t:40, exp:2000 },
  { id:4, en:"Advanced Training: Physical & Mental",   cn:"组合训练：体能＆心智", descCn:"综合体能、综合心智＋20", p:20, m:20, t:0,  exp:2000 },
  { id:5, en:"Advanced Training: Physical & Tactical", cn:"组合训练：体能＆战术", descCn:"综合体能、综合战术＋20", p:20, m:0,  t:20, exp:2000 },
  { id:6, en:"Advanced Training: Mental & Tactical",   cn:"组合训练：心智＆战术", descCn:"综合心智、综合战术＋20", p:0,  m:20, t:20, exp:2000 },
  { id:7, en:"Comprehensive Training Course",          cn:"综合训练",             descCn:"分队综合能力无变化",   p:0,  m:0,  t:0,  exp:3000 },
];

// chemistry（GcArmyExpeditionTrait rows 1-23）values/chance = 反應等級 1~5
const CHEMISTRY = [
  { id:1,  en:"physical ability is increased by {value}%",  cn:"体能＋{value}%",  values:[10,10,15,15,20], chance:[100,100,100,100,100] },
  { id:2,  en:"mental ability is increased by {value}%",    cn:"心智＋{value}%",  values:[10,10,15,15,20], chance:[100,100,100,100,100] },
  { id:3,  en:"tactical ability is increased by {value}%",  cn:"战术＋{value}%",  values:[10,10,15,15,20], chance:[100,100,100,100,100] },
  { id:4,  en:"physical ability for all squadron members is increased by {value}%", cn:"全员体能＋{value}%", values:[3,3,3,3,5], chance:[100,100,100,100,100] },
  { id:5,  en:"mental ability for all squadron members is increased by {value}%",   cn:"全员心智＋{value}%", values:[3,3,3,3,5], chance:[100,100,100,100,100] },
  { id:6,  en:"tactical ability for all squadron members is increased by {value}%", cn:"全员战术＋{value}%", values:[3,3,3,3,5], chance:[100,100,100,100,100] },
  { id:7,  en:"EXP earned is increased by {value}%",                                cn:"获得经验值＋{value}%",     values:[10,10,20,20,30], chance:[100,100,100,100,100] },
  { id:8,  en:"EXP earned by all squadron members is increased by {value}%",        cn:"全员获得经验值＋{value}%", values:[5,5,10,10,15],   chance:[100,100,100,100,100] },
  { id:9,  en:"party chemistry trigger rates increase by {value}%",                 cn:"全员吉兆获得率＋{value}%", values:[10,20,30,40,50], chance:[100,100,100,100,100] },
  { id:10, en:"there is a {value}% chance to receive Contemporary Warfare: Defense", cn:"有{value}%几率获得“战斗技巧教材：守势”", values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:11, en:"there is a {value}% chance to receive Contemporary Warfare: Magicks", cn:"有{value}%几率获得“战斗技巧教材：魔法”", values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:12, en:"there is a {value}% chance to receive Contemporary Warfare: Offense", cn:"有{value}%几率获得“战斗技巧教材：攻势”", values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:13, en:"there is a {value}% chance to receive bonus gil",            cn:"有{value}%几率获得金币",   values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:14, en:"there is a {value}% chance to receive bonus company seals",  cn:"有{value}%几率获得军票",   values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:15, en:"there is a {value}% chance to receive bonus MGP",            cn:"有{value}%几率获得金碟币", values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:16, en:"there is a {value}% chance to receive tank-specific materia",         cn:"有{value}%几率获得防护职业用魔晶石",     values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:17, en:"there is a {value}% chance to receive physical DPS-specific materia", cn:"有{value}%几率获得物理进攻职业用魔晶石", values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:18, en:"there is a {value}% chance to receive DoM-specific materia",          cn:"有{value}%几率获得魔法导师用魔晶石",     values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:19, en:"there is a {value}% chance to receive DoL-specific materia",          cn:"有{value}%几率获得大地使者用魔晶石",     values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:20, en:"there is a {value}% chance to receive DoH-specific materia",          cn:"有{value}%几率获得能工巧匠用魔晶石",     values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:21, en:"there is a {value}% chance to receive crystal clusters",  cn:"有{value}%几率获得晶簇",     values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:22, en:"there is a {value}% chance to receive gatherers' scrips", cn:"有{value}%几率获得大地工票", values:[0,0,0,0,0], chance:[10,20,30,40,50] },
  { id:23, en:"there is a {value}% chance to receive crafters' scrips",  cn:"有{value}%几率获得巧手工票", values:[0,0,0,0,0], chance:[10,20,30,40,50] },
];

// chemistry 觸發條件（GcArmyExpeditionTraitCond rows 1-26）
const CHEM_COND = [
  { id:1,  en:"When an active squadron member",                       cn:"执行任务" },
  { id:2,  en:"When at or above a duty's recommended level",          cn:"达到分队任务所需等级" },
  { id:3,  en:"When above level 50",                                  cn:"等级达到50级或更高" },
  { id:4,  en:"When accompanying a Hyur",                             cn:"与人族同行" },
  { id:5,  en:"When accompanying an Elezen",                          cn:"与精灵族同行" },
  { id:6,  en:"When accompanying a Miqo'te",                          cn:"与猫魅族同行" },
  { id:7,  en:"When accompanying a Lalafell",                         cn:"与拉拉菲尔族同行" },
  { id:8,  en:"When accompanying a Roegadyn",                         cn:"与鲁加族同行" },
  { id:9,  en:"When accompanying an Au Ra",                           cn:"与敖龙族同行" },
  { id:10, en:"When accompanying a gladiator",                        cn:"与剑术师同行" },
  { id:11, en:"When accompanying a marauder",                         cn:"与斧术师同行" },
  { id:12, en:"When accompanying an archer",                          cn:"与弓箭手同行" },
  { id:13, en:"When accompanying a lancer",                           cn:"与枪术师同行" },
  { id:14, en:"When accompanying a rogue",                            cn:"与双剑师同行" },
  { id:15, en:"When accompanying a pugilist",                         cn:"与格斗家同行" },
  { id:16, en:"When accompanying a conjurer",                         cn:"与幻术师同行" },
  { id:17, en:"When accompanying a thaumaturge",                      cn:"与咒术师同行" },
  { id:18, en:"When accompanying an arcanist",                        cn:"与秘术师同行" },
  { id:19, en:"When accompanying someone of the same race",           cn:"与自己同种族人同行" },
  { id:20, en:"When not accompanying someone of the same race",       cn:"同行者与自己的种族不同" },
  { id:21, en:"When accompanying someone of the same class",          cn:"与自己同职业人同行" },
  { id:22, en:"When not accompanying someone of the same class",      cn:"同行者与自己的职业不同" },
  { id:23, en:"When all squadron members are of a different race",    cn:"同行者的种族均不相同" },
  { id:24, en:"When all squadron members are of a different class",   cn:"同行者的职业均不相同" },
  { id:25, en:"With 3 or more members of the same race",              cn:"同种族者大于等于3人" },
  { id:26, en:"With 3 or more members of the same class",             cn:"同职业者大于等于3人" },
];

// 指令任務作戰方針（GcArmyCaptureTactics rows 0-3；名稱/說明 = Status 1439-1442）
const TACTICS = [
  { id:0, statusId:1439, en:"Independent Tactics", cn:"自由作战", descCn:"自由行动的状态，体力最大值提高，攻击所造成的伤害提高，受到攻击的伤害减少", hp:4, dealt:4, received:4 },
  { id:1, statusId:1440, en:"Offensive Tactics",   cn:"攻势作战", descCn:"重视攻击的状态，攻击所造成的伤害提高",                                   hp:0, dealt:12, received:0 },
  { id:2, statusId:1441, en:"Defensive Tactics",   cn:"守势作战", descCn:"重视防御的状态，体力最大值提高，受到攻击的伤害减少",                     hp:6, dealt:0, received:6 },
  { id:3, statusId:1442, en:"Balanced Tactics",    cn:"定式作战", descCn:"重视平衡的状态，体力最大值提高，攻击所造成的伤害提高",                   hp:6, dealt:6, received:0 },
];

// 隊員職業屬性成長表（GcArmyMemberGrow rows 1-9；陣列索引 0 = Lv1，共 Lv1~60）
const STD = [12,12,12,12,13,13,14,14,14,14,15,15,16,16,16,16,17,17,18,18,18,18,19,19,20,20,20,20,21,21,22,22,22,22,23,23,24,24,24,24,25,25,26,26,26,26,27,27,28,28,28,28,29,29,30,30,30,30,31,31];
const GROWTH = [
  { id:1, job:3,  abbr:"MRD", cn:"斧术师",
    p:[60,61,63,64,65,66,66,68,70,72,73,74,74,75,77,78,79,80,80,82,84,86,87,88,88,89,91,92,93,94,94,96,98,100,101,102,102,103,105,106,107,108,108,110,112,114,115,116,116,117,119,120,121,122,122,124,126,128,129,130],
    m:STD,
    t:[24,25,25,26,26,27,28,28,28,28,28,29,30,31,31,32,32,33,34,34,34,34,34,35,36,37,37,38,38,39,40,40,40,40,40,41,42,43,43,44,44,45,46,46,46,46,46,47,48,49,49,50,50,51,52,52,52,52,52,53] },
  { id:2, job:1,  abbr:"GLA", cn:"剑术师",
    p:[48,50,52,54,55,56,56,57,59,60,61,62,62,64,66,68,69,70,70,71,73,74,75,76,76,78,80,82,83,84,84,85,87,88,89,90,90,92,94,96,97,98,98,99,101,102,103,104,104,106,108,110,111,112,112,113,115,116,117,118],
    m:STD,
    t:[36,36,36,36,36,37,38,39,39,40,40,41,42,42,42,42,42,43,44,45,45,46,46,47,48,48,48,48,48,49,50,51,51,52,52,53,54,54,54,54,54,55,56,57,57,58,58,59,60,60,60,60,60,61,62,63,63,64,64,65] },
  { id:3, job:5,  abbr:"ARC", cn:"弓箭手",
    p:[12,13,13,14,14,15,16,17,17,18,18,19,20,21,21,22,22,23,24,25,25,26,26,27,28,29,29,30,30,31,32,33,33,34,34,35,36,37,37,38,38,39,40,41,41,42,42,43,44,45,45,46,46,47,48,49,49,50,50,51],
    m:STD,
    t:[72,73,75,76,77,78,78,79,81,82,83,84,84,85,87,88,89,90,90,91,93,94,95,96,96,97,99,100,101,102,102,103,105,106,107,108,108,109,111,112,113,114,114,115,117,118,119,120,120,121,123,124,125,126,126,127,129,130,131,132] },
  { id:4, job:29, abbr:"ROG", cn:"双剑师",
    p:[24,24,24,24,24,25,26,27,27,28,28,29,30,30,30,30,30,31,32,33,33,34,34,35,36,36,36,36,36,37,38,39,39,40,40,41,42,42,42,42,42,43,44,45,45,46,46,47,48,48,48,48,48,49,50,51,51,52,52,53],
    m:STD,
    t:[60,62,64,66,67,68,68,69,71,72,73,74,74,76,78,80,81,82,82,83,85,86,87,88,88,90,92,94,95,96,96,97,99,100,101,102,102,104,106,108,109,110,110,111,113,114,115,116,116,118,120,122,123,124,124,125,127,128,129,130] },
  { id:5, job:4,  abbr:"LNC", cn:"枪术师",
    p:[36,37,37,38,38,39,40,40,40,40,40,41,42,43,43,44,44,45,46,46,46,46,46,47,48,49,49,50,50,51,52,52,52,52,52,53,54,55,55,56,56,57,58,58,58,58,58,59,60,61,61,62,62,63,64,64,64,64,64,65],
    m:STD,
    t:[48,49,51,52,53,54,54,56,58,60,61,62,62,63,65,66,67,68,68,70,72,74,75,76,76,77,79,80,81,82,82,84,86,88,89,90,90,91,93,94,95,96,96,98,100,102,103,104,104,105,107,108,109,110,110,112,114,116,117,118] },
  { id:6, job:2,  abbr:"PGL", cn:"格斗家",
    p:[36,37,37,38,38,39,40,41,41,42,42,43,44,45,45,46,46,47,48,49,49,50,50,51,52,53,53,54,54,55,56,57,57,58,58,59,60,61,61,62,62,63,64,65,65,66,66,67,68,69,69,70,70,71,72,73,73,74,74,75],
    m:[24,24,24,24,25,25,26,26,26,26,27,27,28,28,28,28,29,29,30,30,30,30,31,31,32,32,32,32,33,33,34,34,34,34,35,35,36,36,36,36,37,37,38,38,38,38,39,39,40,40,40,40,41,41,42,42,42,42,43,43],
    t:[36,37,39,40,41,42,42,43,45,46,47,48,48,49,51,52,53,54,54,55,57,58,59,60,60,61,63,64,65,66,66,67,69,70,71,72,72,73,75,76,77,78,78,79,81,82,83,84,84,85,87,88,89,90,90,91,93,94,95,96] },
  { id:7, job:6,  abbr:"CNJ", cn:"幻术师",
    p:STD,
    m:[72,73,75,76,77,78,78,80,82,84,85,86,86,87,89,90,91,92,92,94,96,98,99,100,100,101,103,104,105,106,106,108,110,112,113,114,114,115,117,118,119,120,120,122,124,126,127,128,128,129,131,132,133,134,134,136,138,140,141,142],
    t:[12,13,13,14,14,15,16,16,16,16,16,17,18,19,19,20,20,21,22,22,22,22,22,23,24,25,25,26,26,27,28,28,28,28,28,29,30,31,31,32,32,33,34,34,34,34,34,35,36,37,37,38,38,39,40,40,40,40,40,41] },
  { id:8, job:7,  abbr:"THM", cn:"咒术师",
    p:STD,
    m:[60,61,63,64,65,66,66,67,69,70,71,72,72,73,75,76,77,78,78,79,81,82,83,84,84,85,87,88,89,90,90,91,93,94,95,96,96,97,99,100,101,102,102,103,105,106,107,108,108,109,111,112,113,114,114,115,117,118,119,120],
    t:[24,25,25,26,26,27,28,29,29,30,30,31,32,33,33,34,34,35,36,37,37,38,38,39,40,41,41,42,42,43,44,45,45,46,46,47,48,49,49,50,50,51,52,53,53,54,54,55,56,57,57,58,58,59,60,61,61,62,62,63] },
  { id:9, job:26, abbr:"ACN", cn:"秘术师",
    p:STD,
    m:[48,49,51,52,53,54,54,55,57,58,59,60,60,61,63,64,65,66,66,67,69,70,71,72,72,73,75,76,77,78,78,79,81,82,83,84,84,85,87,88,89,90,90,91,93,94,95,96,96,97,99,100,101,102,102,103,105,106,107,108],
    t:[36,37,37,38,38,39,40,41,41,42,42,43,44,45,45,46,46,47,48,49,49,50,50,51,52,53,53,54,54,55,56,57,57,58,58,59,60,61,61,62,62,63,64,65,65,66,66,67,68,69,69,70,70,71,72,73,73,74,74,75] },
];

// --------------------------------------------------------------------------
// 組裝
// --------------------------------------------------------------------------
const data = [];

const uniq = (a) => a.every((v) => v === a[0]);

for (const ms of MISSIONS) {
  const flagged = ms.base === 0;
  if (flagged && !(uniq(ms.p) && uniq(ms.m) && uniq(ms.t)))
    throw new Error(`mission ${ms.id}: flagged 但門檻非固定值`);
  for (const k of ["p", "m", "t"])
    if (ms[k].length !== 6) throw new Error(`mission ${ms.id}: ${k} 長度錯誤`);
  data.push({
    kind: "mission",
    id: ms.id,
    name: conv(ms.cn),
    nameEn: ms.en,
    nameSource: "cn-opencc",
    type: TYPE[ms.type].key,
    typeName: conv(TYPE[ms.type].cn),
    level: ms.lvl,
    flagged,
    sealsCost: ms.seals,
    rewardExp: ms.exp,
    rewardItem: ms.item ? { itemId: ms.item, quantity: ms.qty } : null,
    require: flagged ? { physical: ms.p[0], mental: ms.m[0], tactical: ms.t[0] } : null,
    requireVariants: { physical: ms.p, mental: ms.m, tactical: ms.t },
    success: flagged
      ? { base: 0, perStatMet: 0, allMet: 100 }
      : { base: ms.base, perStatMet: 20, allMet: 20 },
    ...(ms.note ? { note: ms.note } : {}),
  });
}

for (const tr of TRAININGS) {
  data.push({
    kind: "training",
    id: tr.id,
    name: conv(tr.cn),
    nameEn: tr.en,
    nameSource: "cn-opencc",
    desc: conv(tr.descCn),
    bonus: { physical: tr.p, mental: tr.m, tactical: tr.t },
    exp: tr.exp,
  });
}
// sheet 僅記載加值；遊戲內屬性總和有上限（依小隊軍銜），達上限後訓練會使其他屬性下降。
// 社群普遍觀察：基礎訓練 +40/-20/-20、組合訓練 +20/+20/-40（總和不變）。此推導值標註待驗證。
for (const d of data) {
  if (d.kind !== "training" || d.id === 7) continue;
  const b = d.bonus;
  const minus = b.physical && b.mental ? { tactical: -40 } : b.physical && b.tactical ? { mental: -40 } : b.mental && b.tactical ? { physical: -40 } :
    b.physical ? { mental: -20, tactical: -20 } : b.mental ? { physical: -20, tactical: -20 } : { physical: -20, mental: -20 };
  d.deltaAtCap = { physical: b.physical, mental: b.mental, tactical: b.tactical, ...minus };
  d.deltaNote = "屬性總和達上限時其他屬性下降（社群觀察推導，sheet 僅載加值，待實測驗證）";
}

const chemTpl = (s) => conv(s.replace("{value}", "{value}")); // conv 不動 {value} 佔位符
for (const c of CHEMISTRY) {
  data.push({
    kind: "chemistry",
    id: c.id,
    text: chemTpl(c.cn),
    textEn: c.en,
    nameSource: "cn-opencc",
    valuesByRank: c.values,
    chanceByRank: c.chance,
  });
}
for (const c of CHEM_COND) {
  data.push({
    kind: "chemistryCondition",
    id: c.id,
    text: conv(c.cn),
    textEn: c.en,
    nameSource: "cn-opencc",
  });
}
for (const t of TACTICS) {
  data.push({
    kind: "tactic",
    id: t.id,
    statusId: t.statusId,
    name: conv(t.cn),
    nameEn: t.en,
    nameSource: "cn-opencc",
    desc: conv(t.descCn),
    bonus: { hpPct: t.hp, damageDealtPct: t.dealt, damageReceivedPct: t.received },
  });
}
for (const g of GROWTH) {
  for (const k of ["p", "m", "t"]) {
    if (g[k].length !== 60) throw new Error(`growth ${g.abbr}: ${k} 長度 ${g[k].length} != 60`);
    for (let i = 1; i < 60; i++)
      if (g[k][i] < g[k][i - 1]) throw new Error(`growth ${g.abbr}: ${k}[${i}] 遞減`);
  }
  data.push({
    kind: "memberGrowth",
    id: g.id,
    classJobId: g.job,
    classAbbr: g.abbr,
    className: conv(g.cn),
    nameSource: "cn-opencc",
    note: "陣列索引 0 = Lv1（Lv1~60）；隊員屬性僅由職業與等級決定",
    growth: { physical: g.p, mental: g.m, tactical: g.t },
  });
}

const out = {
  schema: "squadron",
  patch: "7.2",
  updated: new Date().toISOString().slice(0, 10),
  source: "xivapi-v2(GcArmy* sheets) + thewakingsands cn-csv(OpenCC 轉繁) + consolegameswiki(驗證)",
  count: data.length,
  data,
};

await writeFile(join(ROOT, "data", "squadron.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`squadron.json written: ${data.length} entries`);
const byKind = {};
for (const d of data) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
console.log(byKind);
