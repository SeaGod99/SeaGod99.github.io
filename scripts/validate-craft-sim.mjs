// 製作模擬引擎回歸驗證 — 拿 Teamcraft 模擬器的官方測試案例驗 tools/crafting-sim/craft-engine.js
//
// 為什麼需要這支：製作公式的取整點很多（基礎值 floor、效率 fround、增益相乘後再 floor），
// 差一個 Math.floor 就會在高階配方上差幾百品質，而且**畫面上看起來完全正常**。
// 這裡的期望值全部來自 Teamcraft simulator 的 test/simulation.spec.ts（MIT），
// 那些數字是拿遊戲內實測比對過的。改動 craft-engine.js 後務必跑這支。
//
// 執行：node scripts/validate-craft-sim.mjs
// 退出碼：有任何案例不符 → 1

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const require = createRequire(import.meta.url);

const Engine = require(join(REPO, "tools", "crafting-sim", "craft-engine.js"));
Engine.init(JSON.parse(readFileSync(join(REPO, "data", "craft-actions.json"), "utf8")));

const ST = Engine.ST;

/* ── 對應 Teamcraft test/mocks.ts 的三個產生器 ─────────────────────────── */

function recipe(rlvl, progress, quality, progressDivider, qualityDivider, conditionsFlag = 15, extra = {}) {
  return {
    id: 3864, jobId: 14, rlvl, durability: 80, quality: quality || 20287,
    progress: progress || 3943, lvl: 80, hq: 1, expert: false,
    conditionsFlag, progressDivider, qualityDivider,
    progressModifier: 100, qualityModifier: 100,
    craftsmanshipReq: 0, controlReq: 0, requiredQuality: 0, hqIngredients: [],
    ...extra,
  };
}

function starRecipe(rlvl, progress, quality, pd, qd, pm, qm, expert = false, conditionsFlag = 15, extra = {}) {
  return {
    id: 33904, jobId: 14, rlvl, durability: 70, quality, progress, lvl: 80, hq: 1,
    expert, conditionsFlag, progressDivider: pd, qualityDivider: qd,
    progressModifier: pm, qualityModifier: qm,
    craftsmanshipReq: 0, controlReq: 0, requiredQuality: 0, hqIngredients: [],
    ...extra,
  };
}

function stats(level, craftsmanship, control = 3000, cp = 539, relicTool = false) {
  return { level, craftsmanship, control, cp, specialist: true, relicTool };
}

/* ── 測試骨架 ─────────────────────────────────────────────────────────── */

let pass = 0, fail = 0;
const failures = [];

function check(label, actual, expected) {
  if (actual === expected) { pass++; return; }
  fail++;
  failures.push(`${label}：預期 ${expected}，實得 ${actual}`);
}

function sim(r, rotation, s, opts = {}) {
  return Engine.run({ recipe: r, stats: s, rotation, linear: true, ...opts });
}

function buffOf(res, key) {
  return res.buffs.find((b) => b.buff === key);
}

/* ── 案例（編號對應 spec 檔內的 it(...) 順序）───────────────────────────── */

// 1 閒靜的內靜階數
{
  const r = sim(recipe(16, 31, 866, 50, 30),
    ["reflect", "basicTouch", "carefulSynthesis"], stats(80, 2278, 2348, 532));
  check("閒靜後內靜階數", buffOf(r, "innerQuiet")?.stacks, 3);
}

// 2 低階循環與遊戲內一致
{
  const r = sim(recipe(16, 31, 866, 50, 30),
    ["reflect", "basicTouch", "byregotsBlessing", "carefulSynthesis"], stats(80, 2278, 2348, 532));
  check("低階循環 成功", r.success, true);
  check("低階循環 step3 進度", r.steps[3].addedProgress, 685);
  check("低階循環 step0 品質", r.steps[0].addedQuality, 2451);
  check("低階循環 step1 品質", r.steps[1].addedQuality, 980);
  check("低階循環 step2 品質", r.steps[2].addedQuality, 1699);
}

// 3 改革的交互作用
{
  const r = sim(recipe(517, 2000, 5200, 121, 105), [
    "reflect", "delicateSynthesis", "delicateSynthesis", "wasteNot", "groundwork",
    "innovation", "preparatoryTouch", "preparatoryTouch", "mastersMend", "preparatoryTouch",
  ], stats(80, 2763, 2780, 545));
  check("改革交互 step0", r.steps[0].addedQuality, 897);
  check("改革交互 step1", r.steps[1].addedQuality, 358);
  check("改革交互 step2", r.steps[2].addedQuality, 388);
  check("改革交互 step6", r.steps[6].addedQuality, 1255);
  check("改革交互 step7", r.steps[7].addedQuality, 1435);
  check("改革交互 step9", r.steps[9].addedQuality, 1614);
}

// 4 取整
{
  const r = sim(recipe(517, 2000, 5200, 121, 105),
    ["basicTouch", "basicTouch", "basicTouch", "basicTouch"], stats(80, 1645, 1532, 400));
  check("取整 四次加工", r.quality, 828);
}

// 5–7 DT 循環取整
{
  const r = sim(recipe(685, 6300, 11400, 167, 147),
    ["reflect", "innovation", "preparatoryTouch", "prudentTouch"], stats(94, 3957, 3896, 563));
  check("DT 取整", r.quality, 2610);

  const r2 = sim(recipe(685, 6300, 11400, 167, 147), [
    "reflect", "innovation", "preparatoryTouch", "prudentTouch", "greatStrides",
    "preparatoryTouch", "greatStrides", "innovation", "preparatoryTouch", "immaculateMend",
    "greatStrides", "byregotsBlessing", "wasteNot", "veneration", "groundwork",
    "groundwork", "groundwork", "groundwork", "veneration", "groundwork",
  ], stats(100, 4045, 3902, 601));
  check("DT 長循環 品質", r2.quality, 11400);
  check("DT 長循環 進度", r2.progress, 6585);

  const r3 = sim(starRecipe(710, 7500, 16500, 170, 150, 90, 75), [
    "reflect", "manipulation", "wasteNotII", "preparatoryTouch", "innovation",
    "preparatoryTouch", "preparatoryTouch", "preparatoryTouch", "byregotsBlessing",
    "veneration", "groundwork", "wasteNotII", "groundwork", "groundwork",
    "veneration", "groundwork", "groundwork",
  ], stats(100, 5408, 5255, 630));
  check("710★ 品質", r3.quality, 8321);
  check("710★ 進度", r3.progress, 7775);
}

// 8 精煉加工接加工
{
  const r = sim(recipe(517, 1000, 5200, 121, 105), ["basicTouch", "refinedTouch"], stats(100, 2763, 2780, 545));
  check("精煉加工連段 內靜", buffOf(r, "innerQuiet")?.stacks, 3);
}

// 9–10 上級加工的連段折扣
{
  const r = sim(recipe(517, 1000, 5200, 121, 105), ["observe", "advancedTouch"], stats(90, 2763, 2780, 545));
  check("觀察→上級加工 CP", r.steps[1].cpCost, 18);

  const r2 = sim(recipe(517, 1000, 5200, 121, 105), ["standardTouch", "advancedTouch"], stats(90, 2763, 2780, 545));
  check("未連段的中級→上級 CP", r2.steps[1].cpCost, 46);

  const r3 = sim(recipe(517, 1000, 5200, 121, 105),
    ["basicTouch", "standardTouch", "advancedTouch"], stats(90, 2763, 2780, 545));
  check("加工→中級→上級 CP", r3.steps[2].cpCost, 18);
}

// 11 90 級數值
{
  const r = sim(starRecipe(560, 1000, 5200, 130, 115, 90, 80),
    ["reflect", "basicSynthesis", "basicTouch"], stats(90, 2659, 2803, 548));
  check("90級 step0 品質", r.steps[0].addedQuality, 666);
  check("90級 step1 進度", r.steps[1].addedProgress, 222);
  check("90級 step2 品質", r.steps[2].addedQuality, 266);
}

// 12 改革＋闊步
{
  const r = sim(recipe(16, 31, 866, 50, 30),
    ["reflect", "innovation", "greatStrides", "basicTouch"], stats(80, 2278, 2348, 532));
  check("改革闊步 step0", r.steps[0].addedQuality, 2451);
  check("改革闊步 step3", r.steps[3].addedQuality, 2451);
}

// 13 80 級二星
{
  const r = sim(starRecipe(450, 2050, 9000, 110, 90, 80, 70),
    ["basicSynthesis", "basicTouch"], stats(80, 2626, 2477, 522));
  check("80★★ 進度", r.progress, 230);
  check("80★★ 品質", r.quality, 217);
}

// 14 高階數比爾格
{
  const r = sim(recipe(16, 31, 866, 50, 30), [
    "reflect", "basicTouch", "basicTouch", "mastersMend", "basicTouch", "basicTouch",
    "basicTouch", "mastersMend", "basicTouch", "basicTouch", "basicTouch",
    "byregotsBlessing", "carefulSynthesis",
  ], stats(80, 2278, 2348, 10000));
  check("高階比爾格 成功", r.success, true);
  check("高階比爾格 品質", r.steps[11].addedQuality, 4902);
}

// 15–16 高效（PLIANT）CP 減半
{
  const r = sim(starRecipe(480, 4943, 32328, 2480, 2195, 80, 70, true),
    ["muscleMemory", "wasteNot"], stats(80, 2800, 2500, 541), { stepStates: { 1: ST.PLIANT } });
  check("高效 CP 減半", r.cp, 541 - 6 - Math.floor(56 / 2));

  const r2 = sim(starRecipe(480, 4943, 32328, 2480, 2195, 80, 70, true),
    ["prudentTouch"], stats(80, 2800, 2500, 541), { stepStates: { 0: ST.PLIANT } });
  check("高效 儉約加工 CP", r2.cp, 541 - 13);
}

// 17 結實（STURDY）耐久減半
{
  const r = sim(starRecipe(480, 4943, 32328, 2480, 2195, 80, 70, true),
    ["prudentTouch"], stats(80, 2800, 2500, 541), { stepStates: { 0: ST.STURDY } });
  check("結實 耐久", r.durability, 70 - 3);

  const r2 = sim(starRecipe(480, 4943, 32328, 2480, 2195, 80, 70, true),
    ["wasteNot", "carefulSynthesis"], stats(80, 2800, 2500, 541), { stepStates: { 1: ST.STURDY } });
  check("結實＋儉約 耐久", r2.durability, 70 - 3);
}

// 18 技能失敗時不結算增益
{
  const r = sim(recipe(480, 6178, 36208, 110, 90),
    ["greatStrides", "tricksOfTheTrade"], stats(80, 2486, 2318, 613), { fails: [1] });
  check("失敗不結算增益", buffOf(r, "greatStrides")?.duration, 3);
}

// 19 最終確認／設計變動不消耗作業時間
{
  const r = sim(recipe(480, 6178, 36208, 110, 90),
    ["greatStrides", "finalAppraisal", "carefulObservation"], stats(80, 2486, 2318, 613));
  check("不消耗作業時間", buffOf(r, "greatStrides")?.duration, 3);
}

// 20 加工→中級加工的 CP 折扣
{
  const r = sim(recipe(480, 6178, 36208, 110, 90), ["basicTouch", "standardTouch"], stats(80, 2486, 2318, 613));
  check("中級加工連段 CP", r.steps[1].cpCost, 18);
}

// 22 進度取整
{
  const r = sim(recipe(535, 3000, 6700, 125, 109), ["carefulSynthesis"], stats(90, 2606, 2457, 507));
  check("進度取整 模範製作", r.progress, 378);

  const r2 = sim(starRecipe(740, 9000, 18700, 170, 150, 90, 75), ["basicSynthesis"], stats(100, 5406, 4662, 633));
  check("進度取整 製作", r2.progress, 345);

  const r3 = sim(starRecipe(740, 9000, 18700, 170, 150, 90, 75), [
    "muscleMemory", "wasteNotII", "veneration", "groundwork", "groundwork", "groundwork",
    "delicateSynthesis", "delicateSynthesis", "delicateSynthesis", "delicateSynthesis",
  ], stats(100, 5419, 4996, 630));
  check("進度取整 長循環", r3.progress, 8510);
}

// 23 品質增益取整
{
  const r = sim(recipe(285, 980, 3420, 88, 68),
    ["innovation", "prudentTouch", "prudentTouch", "prudentTouch"], stats(66, 813, 683, 283));
  check("品質增益取整", r.quality, 667);
}

// 24 品質取整
{
  const r = sim(recipe(145, 3000, 6700, 68, 48),
    ["innovation", "basicTouch", "standardTouch", "basicTouch"], stats(58, 2606, 434, 507));
  check("品質取整 step3", r.steps[3].addedQuality, 225);

  const r2 = sim(starRecipe(610, 5060, 12628, 130, 115, 80, 70), [
    "muscleMemory", "manipulation", "veneration", "wasteNotII", "groundwork",
    "groundwork", "delicateSynthesis", "preparatoryTouch", "preparatoryTouch",
  ], stats(90, 3702, 3792, 588));
  check("品質取整 610★ step8", r2.steps[8].addedQuality, 663);

  const r4 = sim(starRecipe(710, 4125, 12000, 170, 150, 90, 75), [
    "reflect", "manipulation", "innovation", "basicTouch", "refinedTouch", "prudentTouch",
    "prudentTouch", "innovation", "basicTouch", "standardTouch", "advancedTouch",
    "manipulation", "trainedPerfection", "greatStrides", "innovation", "preparatoryTouch",
    "greatStrides", "byregotsBlessing",
  ], stats(100, 5300, 4601, 540));
  check("品質取整 710★ step8", r4.steps[8].addedQuality, 652);
  check("品質取整 710★ step9", r4.steps[9].addedQuality, 864);
  check("品質取整 710★ step10", r4.steps[10].addedQuality, 1094);

  const r5 = sim(starRecipe(710, 4125, 12000, 170, 150, 90, 75), [
    "reflect", "innovation", "wasteNotII", "delicateSynthesis", "delicateSynthesis",
    "delicateSynthesis", "immaculateMend", "trainedPerfection", "greatStrides", "innovation",
    "preparatoryTouch", "delicateSynthesis", "greatStrides", "preparatoryTouch",
    "greatStrides", "innovation", "innovation", "preparatoryTouch", "greatStrides", "byregotsBlessing",
  ], stats(100, 5408, 5313, 722));
  check("品質取整 710★ 精密 step3", r5.steps[3].addedQuality, 523);
  check("品質取整 710★ 精密 step4", r5.steps[4].addedQuality, 567);
  check("品質取整 710★ 精密 step5", r5.steps[5].addedQuality, 611);
}

// 28 收藏品的品質門檻
{
  const rot = [
    "muscleMemory", "manipulation", "veneration", "wasteNotII", "finalAppraisal",
    "groundwork", "groundwork", "carefulSynthesis", "innovation", "preparatoryTouch",
    "preparatoryTouch", "preparatoryTouch", "preparatoryTouch", "innovation",
    "prudentTouch", "prudentTouch", "observe", "advancedTouch", "innovation",
    "trainedFinesse", "trainedFinesse", "greatStrides", "byregotsBlessing", "basicSynthesis",
  ];
  const r = sim(starRecipe(590, 4300, 12800, 130, 115, 80, 70, false, 15, { requiredQuality: 12800 }),
    rot, stats(90, 3392, 3338, 675));
  check("品質門檻 未達成", r.success, false);

  const r2 = sim(starRecipe(590, 4300, 12800, 130, 115, 80, 70, false, 15, { requiredQuality: 6400 }),
    rot, stats(90, 3392, 3338, 675));
  check("品質門檻 達成", r2.success, true);
}

// 29 秘訣與專心致志
{
  const r = sim(starRecipe(590, 4300, 12800, 130, 115, 80, 70, false, 15),
    ["heartAndSoul", "preparatoryTouch", "tricksOfTheTrade"], stats(90, 500, 500, 675),
    { stepStates: { 2: ST.GOOD } });
  check("高品質下用秘訣 專心致志保留", !!buffOf(r, "heartAndSoul"), true);

  const r2 = sim(starRecipe(590, 4300, 12800, 130, 115, 80, 70, false, 15),
    ["heartAndSoul", "preparatoryTouch", "tricksOfTheTrade"], stats(90, 500, 500, 675));
  check("一般狀態下用秘訣 專心致志消耗", !!buffOf(r2, "heartAndSoul"), false);
}

// 30 名匠工具的高品質加成
{
  const r = sim(recipe(1, 9, 80, 50, 30), ["observe", "basicTouch"],
    stats(90, 4041, 3987, 616, true), { stepStates: { 1: ST.GOOD } });
  check("名匠工具 高品質品質", r.quality, 2387);
}

// 31 11 級以下不累積內靜
{
  const r = sim(recipe(1, 9, 80, 50, 30), ["basicTouch"], stats(10, 10, 10, 20));
  check("10 級無內靜", r.buffs.length, 0);
}

// 32 工匠的絕技
{
  const r = sim(recipe(1, 9, 80, 50, 30), ["trainedPerfection", "basicTouch", "basicTouch"],
    stats(100, 4041, 3987, 616, true));
  check("絕技 下一次不耗耐久", r.steps[1].durabilityCost, 0);
  check("絕技 之後恢復耗耐久", r.steps[2].durabilityCost, 10);

  const r2 = sim(recipe(1, 9, 80, 50, 30), ["trainedPerfection", "innovation", "basicTouch"],
    stats(100, 4041, 3987, 616, true));
  check("絕技 中間插增益仍有效", r2.steps[2].durabilityCost, 0);

  const r3 = sim(recipe(1, 9, 80, 50, 30),
    ["trainedPerfection", "innovation", "basicTouch", "basicTouch"], stats(100, 4041, 3987, 616, true));
  check("絕技 用掉後消失", !!buffOf(r3, "trainedPerfection"), false);
}

// 33 冒進只能接在倉促成功之後
{
  const r = sim(recipe(1, 9, 80, 50, 30), ["hastyTouch", "daringTouch", "daringTouch"],
    stats(100, 4041, 3987, 616, true));
  check("冒進 第一次可用", r.steps[1].success, true);
  check("冒進 第二次不可用", r.steps[2].success, null);
}

// 34 坯料製作在工匠的絕技下不減半
{
  const r = { ...recipe(1, 9, 80, 50, 30), durability: 10 };
  const a = sim(r, ["groundwork"], stats(100, 4041, 3987, 616, true));
  const b = sim(r, ["trainedPerfection", "groundwork"], stats(100, 4041, 3987, 616, true));
  check("坯料製作 絕技不減半", a.steps[0].addedProgress < b.steps[1].addedProgress, true);
}

/* ── 內建範本：頁面的四套範本都必須在「宣稱的驗證條件」下真的做得完 ──────
   範本是唯一「我們自己宣稱可行」的東西，改了引擎又沒重驗＝直接騙人。
   配方數值取自 data/craft-recipes.json 的真實列（rlvl 55／430／560／690）。 */
{
  const db = JSON.parse(readFileSync(join(REPO, "data", "craft-recipes.json"), "utf8"));
  const col = Object.fromEntries(db.columns.map((c, i) => [c, i]));
  const decode = (row) => {
    const o = {};
    db.columns.forEach((c, i) => { o[c] = row[i]; });
    const t = db.rlvlTable[o.rlvl];
    o.progressDivider = t[0]; o.qualityDivider = t[1];
    o.progressModifier = t[2]; o.qualityModifier = t[3];
    return o;
  };
  const pick = (rlvl, dur, prog) => decode(db.data.find((r) =>
    r[col.rlvl] === rlvl && r[col.durability] === dur && (prog == null || r[col.progress] === prog)));

  const templates = [
    { name: "50 級前後 · 小配方", rlvl: 55, dur: 80, s: stats(52, 600, 580, 330),
      rot: ["innovation", "basicTouch", "standardTouch", "basicTouch", "standardTouch",
            "greatStrides", "byregotsBlessing", "veneration", "basicSynthesis"] },
    { name: "80 級 · 80 耐久", rlvl: 430, dur: 80, s: stats(80, 2500, 2400, 480),
      rot: ["muscleMemory", "innovation", "wasteNotII", "preparatoryTouch", "preparatoryTouch",
            "preparatoryTouch", "preparatoryTouch", "innovation", "preparatoryTouch",
            "delicateSynthesis", "delicateSynthesis", "wasteNot", "groundwork"] },
    { name: "90 級 · 80 耐久", rlvl: 560, dur: 80, s: stats(90, 3300, 3200, 520),
      rot: ["muscleMemory", "veneration", "groundwork", "mastersMend", "innovation",
            "preparatoryTouch", "wasteNotII", "preparatoryTouch", "preparatoryTouch",
            "preparatoryTouch", "preparatoryTouch", "greatStrides", "byregotsBlessing", "groundwork"] },
    { name: "100 級 · 三星 80 耐久", rlvl: 690, dur: 80, prog: 6600, s: stats(100, 4200, 4000, 600),
      rot: ["muscleMemory", "veneration", "groundwork", "trainedPerfection", "groundwork",
            "groundwork", "groundwork", "immaculateMend", "preparatoryTouch", "wasteNotII",
            "innovation", "preparatoryTouch", "preparatoryTouch", "preparatoryTouch",
            "preparatoryTouch", "greatStrides", "byregotsBlessing", "groundwork"] },
  ];

  for (const t of templates) {
    const r = pick(t.rlvl, t.dur, t.prog);
    const res = sim(r, t.rot, t.s);
    check(`範本「${t.name}」完成`, res.success, true);
    check(`範本「${t.name}」無跳過的步驟`, res.steps.filter((s) => s.skipped).length, 0);
  }
}

/* ── 額外自檢：不在 Teamcraft 案例內，但關係到本站前端的行為 ────────────── */

// HQ 對照表端點
check("HQ% 品質 0", Engine.hqPercent(0, 1000), 1);
check("HQ% 品質滿", Engine.hqPercent(1000, 1000), 100);
check("HQ% 品質半", Engine.hqPercent(500, 1000), 15);

// 初期品質＝HQ 材料的品質貢獻
check("HQ 材料初期品質",
  Engine.startingQualityFrom({ hqIngredients: [[100, 2, 300], [200, 3, 100]] }, { 100: 2, 200: 1 }),
  700);
check("HQ 材料超過上限不加倍",
  Engine.startingQualityFrom({ hqIngredients: [[100, 2, 300]] }, { 100: 9 }), 600);

/* ── 結果 ─────────────────────────────────────────────────────────────── */

console.log(`製作模擬引擎驗證：${pass} 過、${fail} 不符`);
if (failures.length) {
  console.log("");
  failures.forEach((f) => console.log("  ❌ " + f));
  process.exit(1);
}
console.log("✓ 公式與 Teamcraft 官方測試案例一致，內建範本在宣稱的條件下都做得完");
