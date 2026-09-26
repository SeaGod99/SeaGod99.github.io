// 貼清單匯入回歸 — 改完 market.js 的 `parsePasteLines`／`importPasted` 必跑。
//
// 這條路徑有三個會安靜出錯的地方：
//   ① **數量解析吃掉名稱的一部分。** 數量前面一定要有分隔符——
//      少了這個要求的話「物品 12345」會被拆成名稱「物品 12」＋數量 345
//      （數量的樣式只吃得下三位數，剩下的黏回名稱裡），而且畫面上看不出來。
//   ② **查不到的行沒有逐行列出來。** 只說「有 N 件查不到」的話使用者不知道是哪幾行，
//      無從判斷是打錯字、台服未開放、還是本站沒收。
//   ③ **`lookupMany()` 回的是台服名不是 itemId。** 直接當 id 用會整批查無，
//      而且不報錯（同 §4.82 那個 Map 誤用的類型）。
//
// 另外釘住一個決定：**不解析 xivgear／Etro 的連結**。
// 兩邊的 API 都回 `ACAO: *`，技術上讀得到，但拿不到真的 gearset 去驗證欄位結構，
// 照猜寫的解析器會在對方改格式時安靜地匯入錯的裝備。
//
// 執行（repo 根目錄）：node scripts/validate-paste-import.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const JS = readFileSync(join(ROOT, 'tools/market/market.js'), 'utf8');
const HTML = readFileSync(join(ROOT, 'tools/market/index.html'), 'utf8');

// ── ① 數量解析：把函式原封不動取出來跑 ──────────────────
{
  /* 從 market.js 直接挖出 `parsePasteLines` 執行，不在測試裡重寫一份——
     重寫的話改了 market.js 這支還會過（同 validate-sw-update 的做法）。 */
  const m = JS.match(/function parsePasteLines\(text\) \{[\s\S]*?\n  \}/);
  push('market.js 有 parsePasteLines()', !!m, m ? '取出成功' : '找不到');
  if (m) {
    const parse = new Function('return ' + m[0].replace(/^\s+/, ''))();
    const cases = [
      ['紫水晶', [['紫水晶', 1]], '沒有數量就是 1'],
      ['紫水晶 3', [['紫水晶', 3]], '名稱後面空白加數量'],
      ['紫水晶 ×3', [['紫水晶', 3]], '×N'],
      ['紫水晶 x3', [['紫水晶', 3]], 'xN'],
      ['紫水晶×3', [['紫水晶', 3]], '×N 沒有空白'],
      ['3 紫水晶', [['紫水晶', 3]], '數量在前'],
      ['- 紫水晶 2', [['紫水晶', 2]], '條列符號'],
      ['Chondrite Ingot 2', [['Chondrite Ingot', 2]], '英文名'],
      ['オリハルコン合金', [['オリハルコン合金', 1]], '日文名'],
      ['紫水晶 (HQ)', [['紫水晶', 1]], 'HQ 標記拿掉'],
      ['', [], '空行略過'],
      ['   ', [], '全空白略過'],
    ];
    for (const [input, want, why] of cases) {
      const got = parse(input).map((r) => [r.name, r.qty]);
      push(`  「${input || '(空)'}」→ ${JSON.stringify(want)}`,
        JSON.stringify(got) === JSON.stringify(want), why + '　實得 ' + JSON.stringify(got));
    }

    /* **名稱本身是純數字時不可以被當成數量而變成空的。**
       「777」這種行雖然不是物品，但不該產生一筆 name 為空的項目。 */
    const numOnly = parse('777');
    push('  純數字的行不會產生空名稱',
      numOnly.every((r) => r.name && r.name.length > 0), JSON.stringify(numOnly));

    const multi = parse('紫水晶 3\nChondrite Ingot 2\n\nオリハルコン合金');
    push('  多行一次解析', multi.length === 3, multi.map((r) => r.name + '×' + r.qty).join('、'));

    /* **數量前面一定要有分隔符**（空白或 ×／x／*）。
       少了這個要求的話「物品 12345」會被拆成名稱「物品 12」＋數量 345——
       因為數量的樣式只吃得下三位數，剩下的兩位就黏回名稱裡了，畫面上看不出來。 */
    const long = parse('物品 12345');
    push('  四位數以上不當成數量（名稱不可以被切斷）',
      long.length === 1 && long[0].name === '物品 12345' && long[0].qty === 1,
      JSON.stringify(long));
  }
}

// ── ② 查不到的要逐行列出來 ─────────────────────────────
{
  push('查不到的行會逐行列出來（不是只報數量）',
    JS.indexOf("'查不到 ' + bad.length + ' 行：'") >= 0 || /查不到 ' \+ bad\.length/.test(JS), '');
  push('  列出來的名稱有轉義（使用者貼的字）', JS.indexOf('esc(bad.slice') >= 0, '');
  push('  超過 8 行時用「等」收尾（不要洗掉整個提示區）',
    JS.indexOf('bad.length > 8') >= 0, '');
}

// ── ③ lookupMany 回的是名字不是 id ─────────────────────
{
  push('用 lookupMany 的 tw 再換成 itemId（不是直接當 id 用）',
    JS.indexOf('byName.get(ItemNames.normalizeName(hit.tw))') >= 0, '');
  push('  查名表沒中時退回用原字串對物品表（直接貼繁中名的情況）',
    JS.indexOf('byName.get(ItemNames.normalizeName(r.name))') >= 0, '');
  push('  正規化走 ItemNames.normalizeName（不自己再寫一份，§4.63）',
    JS.indexOf('function normalizeName') < 0, '');
  push('  itemId 用 == null 判斷（0 不是合法 id，但別用 falsy 擋掉）',
    JS.indexOf('if (id == null)') >= 0, '');
}

// ── 清單上限與合併 ─────────────────────────────────────
{
  push('滿了會講出來而不是靜默丟掉', JS.indexOf('清單已滿（上限 ') >= 0, '');
  push('  併入既有項目時分開計數（使用者才知道發生什麼）',
    JS.indexOf('併入既有 ') >= 0, '');
  push('  逐件走既有的 addToCraft()（上限與合併規則只有一份）',
    JS.indexOf('addToCraft(id, r.qty)') >= 0, '');
}

// ── 不解析外站連結這個決定要留在原始碼與畫面上 ──────────
{
  push('原始碼寫下「為什麼不解析 xivgear／Etro 的連結」',
    JS.indexOf('為什麼不解析 xivgear') >= 0 && JS.indexOf('安靜地匯入錯的裝備') >= 0, '');
  push('  頁面也對使用者講明', HTML.indexOf('不解析配裝網站的連結') >= 0, '');
  /* 只在註解裡提到那兩個站是可以的，但**程式碼裡不該真的去打它們**。
     先把區塊註解拿掉再掃（§4.90：掃程式碼的斷言要先拿掉註解）。 */
  const CODE = JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
  push('  沒有真的去打那兩個站',
    CODE.indexOf('xivgear.app') < 0 && CODE.indexOf('etro.gg') < 0, '');
}

// ── 版面與載入 ─────────────────────────────────────────
{
  push('有貼清單的輸入區',
    HTML.indexOf('id="pasteText"') >= 0 && HTML.indexOf('id="pasteBtn"') >= 0, '');
  push('  預設收起來（<details>，不佔掉製作清單的位置）',
    HTML.indexOf('<details class="paste-box"') >= 0 &&
    !/<details class="paste-box"[^>]*\bopen\b/.test(HTML), '');
  push('  summary 有 44px 命中區',
    /\.paste-box > summary \{[^}]*min-height: 44px/.test(HTML), '');
  push('  頁面載了 item-names.js', HTML.indexOf('assets/js/item-names.js') >= 0, '');
  /* 單頁專屬的顏色寫在該頁自己的 style，但**不可以另開一份 :root 色票**（§3.6）。 */
  push('  沒有在貼清單的樣式附近開 :root 色票（§3.6）',
    !/\.paste-box[\s\S]{0,400}:root/.test(HTML), '');
  push('  Ctrl／Cmd+Enter 可送出（貼完手還在輸入框裡）',
    JS.indexOf("e.key === 'Enter'") >= 0 && JS.indexOf('e.ctrlKey || e.metaKey') >= 0, '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
