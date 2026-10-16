/* macro-parse.js — 遊戲巨集的行解析（巨集轉譯頁與製作模擬器共用，2026-10-11）
 *
 * 原本 parseLine 內嵌在 tools/macro-translator/index.html；製作模擬器要做「貼上巨集匯入循環」時
 * 第三輪路線圖 §4 craft-macro-import 要求**先抽成兩頁共用**——兩份解析規則會漂（知識庫 §4.16、§4.63）。
 *
 *   MacroParse.parseLine(line)        有引號的指令行 → { indent, cmd, sp, q, name, rest }；巨集轉譯頁用（只換引號裡的名字）
 *   MacroParse.parseCommand(line)     有引號或沒引號都認 → { cmd, name }（本站匯出的巨集不加引號：台服技能名沒有空白）
 *   MacroParse.importRotation(text, keyOfName)
 *       整段巨集 → { keys, unknown:[{line, text}], skipped }。/echo、/macrolock、/wait 這類不算技能的行略過；
 *       **認不得的行逐行列出**（只報數量的話使用者不知道是哪幾行，同市場頁貼清單的教訓）。
 */
(function () {
  'use strict';

  /* 引號用直引號與全形引號都收——從網頁複製常常變成全形。
     全形引號的**開合是不同字元**（“…”、「…」），不能用反向參照配對。 */
  var QUOTE_PAIRS = { '"': '"', "'": "'", '“': '”', '「': '」', '‘': '’' };

  /* ⚠ 結尾要找「與開頭配對的那個引號」，不能用一個通吃的字元類別：
     `/statusoff "Army's Paeon"` 的撇號會被當成結尾、開合對不上，整行就不轉譯（2026-10-03 前的 bug）。 */
  function parseLine(line) {
    var m = String(line).match(/^(\s*)(\/[a-zA-Z]+)(\s+)(["'“「‘])/);
    if (!m) return null;
    var end = line.indexOf(QUOTE_PAIRS[m[4]], m[0].length);
    if (end < 0) return null;                              // 開合對不上就不動這一行
    return { indent: m[1], cmd: m[2].toLowerCase(), sp: m[3], q: m[4],
      name: line.slice(m[0].length, end), rest: line.slice(end + 1) };
  }

  /** 指令＋名字；引號可有可無，尾巴的 <wait.3>、<se.1> 這類標記去掉 */
  function parseCommand(line) {
    var q = parseLine(line);
    if (q) return { cmd: q.cmd, name: q.name.trim() };
    var m = String(line).match(/^\s*(\/[a-zA-Z]+)(?:\s+([^<]*?))?\s*(?:<[^>]*>\s*)*$/);
    return m ? { cmd: m[1].toLowerCase(), name: (m[2] || '').trim() } : null;
  }

  var SKIP = { '/echo': 1, '/e': 1, '/macrolock': 1, '/mlock': 1, '/wait': 1, '/micon': 1, '/macroicon': 1 };
  var ACTION = { '/ac': 1, '/action': 1 };

  function importRotation(text, keyOfName) {
    var keys = [], unknown = [], skipped = 0;
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (raw, i) {
      if (!raw.trim()) return;
      var c = parseCommand(raw);
      if (c && SKIP[c.cmd]) { skipped++; return; }
      if (!c || !ACTION[c.cmd] || !c.name) { unknown.push({ line: i + 1, text: raw }); return; }
      var k = keyOfName(c.name);
      if (k) keys.push(k); else unknown.push({ line: i + 1, text: raw });
    });
    return { keys: keys, unknown: unknown, skipped: skipped };
  }

  window.MacroParse = { QUOTE_PAIRS: QUOTE_PAIRS, parseLine: parseLine, parseCommand: parseCommand, importRotation: importRotation };
})();
