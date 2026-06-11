/**
 * patch-dungeon-names.mjs
 * 從 thewakingsands ContentFinderCondition.csv（簡中）補 dungeons.json 的 name 欄位
 * 再用 OpenCC 轉繁體（需安裝 opencc-js 或 node-opencc）
 *
 * 用法：node scripts/patch-dungeon-names.mjs
 * 需求：Node 18+
 *
 * 若不想安裝 opencc，腳本會先輸出簡中版本，並在 TODO 中標記需轉換的項目
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUNGEONS_PATH = resolve(__dirname, '../data/dungeons.json');
const CSV_URL = 'https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/ContentFinderCondition.csv';

// 台服特有用詞修正（OpenCC 轉換後再套）
// 台服有些用詞與 OpenCC 標準繁中不同
const TW_GAME_FIXES = {
  '魔導': '魔导',   // 台服保留簡體「魔导」
  '復甦': '復甦',   // 已正確，不需修改
};

// opencc-js 轉換器（lazy init）
let openccConverter = null;
async function getConverter() {
  if (openccConverter) return openccConverter;
  try {
    const require = createRequire(import.meta.url);
    const OpenCC = require('opencc-js');
    openccConverter = OpenCC.Converter({ from: 'cn', to: 'tw' });
    console.log('  使用 opencc-js 轉換');
  } catch {
    console.warn('  ⚠ opencc-js 未安裝，使用內建字表（品質較低）');
    console.warn('    建議：npm install opencc-js');
    openccConverter = builtinS2T;
  }
  return openccConverter;
}

function builtinS2T(str) {
  const TABLE = '監獄廢靈鐵鋼銀戰場傳說毀滅遺聖審覺復魂無盡絕決麗龍風時間臨斷炼擇歷險層樓階級偵碼頭導師長對話陣線權貴榮惡夢樹峽熱帶島尋記憶實驗終結歸還隱紋織細絲運轉變態勢園藝術館宮橋門關鎮莊邊際國區鄉遠廣紅綠藍黃曉霧煙塵礦脈湧濤淵灣嶺叢灘澤濕窟壇墳陵塚鎖鏈籠綁縛讨伐尔处团队还'.split('');
  const MAP = {
    '监':'監','狱':'獄','废':'廢','灵':'靈','铁':'鐵','钢':'鋼','银':'銀',
    '战':'戰','场':'場','传':'傳','说':'說','毁':'毀','灭':'滅','遗':'遺',
    '圣':'聖','审':'審','觉':'覺','复':'復','苏':'甦','魂':'魂','无':'無',
    '尽':'盡','绝':'絕','决':'決','丽':'麗','龙':'龍','风':'風','时':'時',
    '间':'間','临':'臨','断':'斷','炼':'煉','择':'擇','历':'歷','险':'險',
    '层':'層','楼':'樓','阶':'階','级':'級','侦':'偵','码':'碼','头':'頭',
    '导':'導','师':'師','长':'長','对':'對','话':'話','阵':'陣','线':'線',
    '权':'權','贵':'貴','荣':'榮','恶':'惡','梦':'夢','树':'樹','峡':'峽',
    '热':'熱','带':'帶','岛':'島','寻':'尋','记':'記','忆':'憶','实':'實',
    '验':'驗','终':'終','结':'結','归':'歸','还':'還','隐':'隱','纹':'紋',
    '织':'織','细':'細','丝':'絲','运':'運','转':'轉','变':'變','态':'態',
    '势':'勢','园':'園','艺':'藝','术':'術','馆':'館','宫':'宮','桥':'橋',
    '门':'門','关':'關','镇':'鎮','庄':'莊','边':'邊','际':'際','国':'國',
    '区':'區','乡':'鄉','远':'遠','广':'廣','红':'紅','绿':'綠','蓝':'藍',
    '黄':'黃','晓':'曉','雾':'霧','烟':'煙','尘':'塵','矿':'礦','脉':'脈',
    '涌':'湧','涛':'濤','渊':'淵','湾':'灣','岭':'嶺','丛':'叢','滩':'灘',
    '泽':'澤','湿':'濕','窟':'窟','坛':'壇','坟':'墳','陵':'陵','冢':'塚',
    '锁':'鎖','链':'鏈','笼':'籠','绑':'綁','缚':'縛','讨':'討','伐':'伐',
    '尔':'爾','处':'處','团':'團','队':'隊',
  };
  return str.split('').map(c => MAP[c] || c).join('');
}

async function main() {
  console.log('=== patch-dungeon-names.mjs ===');

  // 下載 CSV
  console.log('下載 ContentFinderCondition.csv（簡中）...');
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csvText = await res.text();

  // 解析 CSV：key=col[0], Name=col[44]
  const lines = csvText.split('\n');
  const zhNames = {};
  for (let i = 3; i < lines.length; i++) {  // 跳過 3 行 header
    const cols = lines[i].split(',');
    if (cols.length < 45) continue;
    const key = cols[0].trim().replace(/^"/, '').replace(/"$/, '');
    const name = cols[44].trim().replace(/^"/, '').replace(/"$/, '');
    if (/^\d+$/.test(key) && name) {
      zhNames[parseInt(key)] = name;
    }
  }
  console.log(`  CSV 解析完成：${Object.keys(zhNames).length} 筆簡中名稱`);

  // 讀取 dungeons.json
  const raw = readFileSync(DUNGEONS_PATH, 'utf-8');
  const db = JSON.parse(raw);

  const convert = await getConverter();
  let hit = 0, miss = 0;
  for (const entry of db.data) {
    const zhName = zhNames[entry.id];
    if (zhName) {
      entry.name = convert(zhName);
      hit++;
    } else {
      miss++;
    }
  }

  db.count = db.data.length;
  db.updated = new Date().toISOString().slice(0, 10);

  function sanitize(key, val) {
    if (typeof val === 'string') return val.replace(/\0/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '');
    return val;
  }
  const outStr = JSON.stringify(db, sanitize, 2);
  // 確保無多餘 null bytes
  const buf = Buffer.from(outStr + '\n', 'utf-8');
  const clean = buf.filter(b => b !== 0);
  writeFileSync(DUNGEONS_PATH, clean);

  console.log(`\n完成：${hit} 筆補名、${miss} 筆無對照（name=null）`);
  console.log('→', DUNGEONS_PATH);

  // 顯示範例
  console.log('\n範例（前10）：');
  for (const x of db.data.slice(0, 10)) {
    console.log(`  [${x.id}] ${x.name ?? '(無)'} / ${x.nameEn}`);
  }

  if (miss > 0) {
    console.log(`\n⚠ ${miss} 筆無簡中對照（可能是新版本副本，台服尚未開放）`);
    const missing = db.data.filter(x => !x.name);
    missing.slice(0, 5).forEach(x => console.log(`  ${x.id} ${x.nameEn}`));
    if (missing.length > 5) console.log(`  ... 等 ${missing.length} 筆`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
