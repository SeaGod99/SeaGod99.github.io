// 產出 data/equip.json：物品裝備限制（裝備等級＋可裝職業）供市場查價「物品查詢」篩選用。
// 來源：out_data/equipment.msgpack（itemId → level/jobs 縮寫）
// 職業繁中名權威（2026-07-06 以 tw-items 官方物品名逐一校驗，勿憑記憶改動）：
//   1. 戰鬥特職＝tw-items「XX之證」官方名（白魔道士/召喚士/占星術師/奪魂者/毒蛇劍士…
//      與 CN 簡轉繁差異極大，絕不可用 s2t）
//   2. 基礎職＝tw-items 職業戒指系列官方名（劍術士/格鬥士/弓術士/巴術士…「士」非「師」）
//   3. 製作職＝recipes.json jobId 對照（站內 UI 一致；官方「鍊金」與站內「煉金術士」並存，取站內）
//   4. 採集職＝站內採集/釣魚工具既有名（採礦工/園藝工/捕魚人）
// 遇到任何缺對照的縮寫一律 exit 1，嚴禁靜默輸出殘缺對照表。
//
// 用法：node scripts/build-equip.mjs [ClassJob.csv 路徑，預設 /tmp/ClassJob.csv]
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(REPO + '/package.json');
const { decode } = require('@msgpack/msgpack');
const OpenCC = require('opencc-js');
const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });

const csvPath = process.argv[2] || '/tmp/ClassJob.csv';

function parseCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur); return out;
}

// ---- 載入來源 ----
const equipment = decode(readFileSync(REPO + '/out_data/equipment.msgpack'));
const twItems = decode(readFileSync(REPO + '/out_data/tw-items.msgpack'));
const recipes = JSON.parse(readFileSync(REPO + '/data/recipes.json', 'utf8'));

// ClassJob.csv：key=jobId、row[1]=Name(CN)、row[2]=Abbreviation、row[42]=Item{SoulCrystal}
const lines = readFileSync(csvPath, 'utf8').split('\n').slice(3);
const cnByAbbr = new Map();       // abbr -> { id, cn, soul }
for (const line of lines) {
  const r = parseCSVLine(line.trim());
  if (!r[0] || !/^\d+$/.test(r[0])) continue;
  if (r[2]) cnByAbbr.set(r[2], { id: Number(r[0]), cn: r[1], soul: Number(r[42]) || 0 });
}

// 製作職：recipes.json 的 jobId → job（站內 UI 一致名）
const craftNameByJobId = new Map();
for (const r of recipes.data) {
  if (r.jobId && r.job && !craftNameByJobId.has(r.jobId)) craftNameByJobId.set(r.jobId, r.job);
}

// 基礎職／採集職／特殊：以 tw-items 戒指系列與站內既有名逐一校驗過的固定表
const FIXED = {
  ADV: '冒險者',
  GLA: '劍術士', PGL: '格鬥士', MRD: '斧術士', LNC: '槍術士', ARC: '弓術士',
  CNJ: '幻術士', THM: '咒術士', ACN: '巴術士', ROG: '雙劍士',
  MIN: '採礦工', BTN: '園藝工', FSH: '捕魚人',
};

// ---- 收集 equipment 用到的縮寫 ----
const usedAbbrs = new Set();
for (const id of Object.keys(equipment)) {
  for (const j of equipment[id].jobs || []) usedAbbrs.add(j);
}

// ---- 三層權威解析繁中名 ----
function twName(id) { const e = twItems[id]; return e && e.tw ? e.tw : null; }
const names = {};
const report = [];
const missing = [];
for (const abbr of Array.from(usedAbbrs).sort()) {
  const cj = cnByAbbr.get(abbr);
  if (!cj) { missing.push(abbr + '（ClassJob.csv 查無此縮寫）'); continue; }
  let name = null, src = '';
  if (FIXED[abbr]) { name = FIXED[abbr]; src = '固定表（戒指系列/站內既有名）'; }
  else if (craftNameByJobId.has(cj.id)) { name = craftNameByJobId.get(cj.id); src = 'recipes.json jobId'; }
  else if (cj.soul > 0) {
    const soulTw = twName(cj.soul);                 // 例：「戰士之證」「白魔道士之證」
    const m = soulTw && !soulTw.endsWith('專家之證') && soulTw.match(/^(.+)之證$/);
    if (m) { name = m[1]; src = '之證官方名'; }
  }
  if (!name) { missing.push(abbr + '（無官方名可考，拒絕以 s2t 猜測）：s2t=' + s2t(cj.cn)); continue; }
  names[abbr] = name;
  report.push(`${abbr.padEnd(4)} ${name}（${src}）`);
}
if (missing.length) {
  console.error('✗ 以下職業縮寫無繁中對照，中止輸出：\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log('職業對照（' + report.length + ' 個，請校驗）：\n' + report.join('\n'));

// ---- 輸出緊湊格式（jobs 依 ClassJob id＝遊戲慣例順序，前端下拉直接沿用）----
const jobList = Array.from(usedAbbrs).sort((a, b) => (cnByAbbr.get(a).id) - (cnByAbbr.get(b).id));
const jobIdx = new Map(jobList.map((a, i) => [a, i]));
const items = {};
let n = 0;
for (const id of Object.keys(equipment)) {
  const e = equipment[id];
  const idxs = (e.jobs || []).map(a => jobIdx.get(a)).filter(x => x != null);
  if (!idxs.length && !e.level) continue;
  items[id] = [e.level || 1, idxs];
  n++;
}

const out = {
  schema: 'equip',
  updated: new Date().toISOString().slice(0, 10),
  source: 'equipment.msgpack + ClassJob.csv(s2t) + tw-items 靈魂水晶校驗',
  jobs: jobList,
  names,
  items,
};
writeFileSync(REPO + '/data/equip.json', JSON.stringify(out), 'utf8');
console.log(`✓ data/equip.json：${n} 件裝備、${jobList.length} 個職業`);
