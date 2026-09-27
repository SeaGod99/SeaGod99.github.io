/* share-card.js — 套裝分享圖卡（1200×630 PNG）
 *
 * ── 只在資料齊全的套上提供，這是刻意的 ──────────────────────────────
 * 路線圖的閘門是「多數卡片會開天窗就先補名再做圖」。2026-09-27 量測：
 *
 *   精選 95 套：500 件裝備裡 99 件沒有台服名 → **66% 的套至少缺一件**
 *   官方 1977 套：11,054 件裡 641 件缺名（6%），但**35% 的套連整套繁中名都沒有**
 *
 * 而那 99 件的 `iid`（46890／46879／49282…）在主庫 `items.json`（台服 7.21）裡
 * **完全不存在**——它們是台服還沒開放的物品，所以「先補名」做不到，
 * 不是還沒補，是台服沒有這個名字（鐵則：對不到＝未開放，不用日英補）。
 *
 * 閘門的用意是「不要產出開天窗的卡」。與其挑一邊妥協，這裡從根本滿足它：
 * **資料不齊全的套根本不提供這顆按鈕。** 齊全的有 1,308 套
 * （精選 32／官方 1,276），而且每一張都不會有空行。
 *
 * ── 為什麼不畫染色色塊 ──────────────────────────────────────────────
 * 染劑的 RGB 不在本站資料裡（`dyes.json` 只有名稱與分類），
 * 自己配色會畫出與遊戲內不同的顏色。所以染色**只寫名字**。
 *
 * 用法（掛 window.ShareCard）：
 *   ShareCard.canMake(entry)   → { ok, why }   // why 是給畫面用的原因
 *   ShareCard.rows(entry)      → [{ slot, name, dye }]
 *   ShareCard.make(entry)      → Promise<void>（觸發下載）
 */
(function () {
  'use strict';

  var W = 1200, H = 630;
  var PAD = 36;

  /** 這個字串能不能印在卡上。與站內的守門一致：要有漢字、不可以有假名。 */
  function isTw(s) {
    var v = (s == null ? '' : String(s)).trim();
    if (!v) return false;
    if (/[ぁ-ゖァ-ヺ]/.test(v)) return false;   // 假名＝日文原文
    return /[一-鿿]/.test(v);
  }

  function pieces(e) {
    return e && (e.type === 'mirapri' ? (e.equipments || []) : (e.pieces || []));
  }

  /** 一件裝備的台服名。`zh` 沒有就試主庫（前端已有的 ITEM_NAME 對照，沒有就放棄）。 */
  function pieceName(p) {
    if (!p) return null;
    if (isTw(p.zh)) return p.zh;
    // 前端如果有主庫名稱對照就用（index.html 的 ITEM_SRC 只有來源，名稱要另外查）
    var id = p.iid || p.id;
    if (id && typeof window.glamourItemName === 'function') {
      var n = window.glamourItemName(id);
      if (isTw(n)) return n;
    }
    return null;
  }

  function setTitle(e) {
    if (!e) return null;
    if (e.type === 'set') return isTw(e.name_zh) ? e.name_zh : null;
    return isTw(e.name) ? e.name : null;
  }

  /** 卡上的列。**缺名的整列不畫**——但 canMake 已經擋掉了，這裡是雙保險。 */
  function rows(e) {
    var out = [];
    (pieces(e) || []).forEach(function (p) {
      var nm = pieceName(p);
      if (!nm) return;
      var dyes = [p.dye1, p.dye2].filter(function (d) { return d && d !== '—'; });
      out.push({ slot: p.slot || '', name: nm, dye: dyes.join('／') });
    });
    return out;
  }

  /**
   * 這一套能不能做圖卡。**社群投稿一律不提供**——那是別人拍的照片，
   * 本站不替使用者把它包成一張看起來像本站作品的圖再散出去。
   */
  function canMake(e) {
    if (!e) return { ok: false, why: '沒有這一套的資料' };
    if (e.type === 'mirapri') return { ok: false, why: '社群投稿不提供圖卡（那是投稿者的照片）' };
    if (!setTitle(e)) return { ok: false, why: '這一套還沒有台服繁中套名' };
    var ps = pieces(e) || [];
    if (!ps.length) return { ok: false, why: '這一套沒有逐件資料' };
    var missing = ps.filter(function (p) { return !pieceName(p); });
    if (missing.length) {
      return { ok: false, why: '有 ' + missing.length + ' 件還沒有台服繁中名（台服未開放），圖卡會開天窗' };
    }
    if (!imgOf(e)) return { ok: false, why: '這一套沒有圖片' };
    return { ok: true, why: '' };
  }

  function imgOf(e) {
    if (!e) return null;
    if (e.type === 'set') return e.img || e.imgSrc || null;
    return e.image || null;
  }

  // ── 繪圖 ──────────────────────────────────────────────
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      // 同源（本站自己的圖），不設 crossOrigin 才不會因為沒有 CORS 標頭而失敗
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('圖片載入失敗：' + src)); };
      im.src = src;
    });
  }

  /** 讀 tokens.css 的實際色值，卡片才跟站上同一套顏色（§3.6：不自己開色票） */
  function tok(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function drawWrapped(ctx, text, x, y, maxW, lineH, maxLines) {
    var line = '', lines = [];
    for (var i = 0; i < text.length; i++) {
      var t = line + text[i];
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = text[i]; }
      else line = t;
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * lineH); });
    return lines.length * lineH;
  }

  function make(e) {
    var gate = canMake(e);
    if (!gate.ok) return Promise.reject(new Error(gate.why));

    var bg = tok('--bg-card', '#161a21');
    var fg = tok('--text', '#e8e6e3');
    var dim = tok('--text-dim', '#a8a29b');
    var gold = tok('--gold', '#c8a96e');
    var border = tok('--border', 'rgba(255,255,255,0.12)');

    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    return loadImage(imgOf(e)).then(function (im) {
      // 左側：套裝圖，等比縮放塞進固定框，不裁切變形
      var boxW = 380, boxH = H - PAD * 2;
      var s = Math.min(boxW / im.width, boxH / im.height);
      var dw = im.width * s, dh = im.height * s;
      ctx.drawImage(im, PAD + (boxW - dw) / 2, PAD + (boxH - dh) / 2, dw, dh);

      var x = PAD + boxW + 32;
      var maxW = W - x - PAD;
      var y = PAD + 14;

      // 標題
      ctx.fillStyle = gold;
      ctx.font = '700 40px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      y += drawWrapped(ctx, setTitle(e), x, y, maxW, 48, 2);
      y += 10;

      // 副標：資料片／來源
      var sub = [e.patch ? '版本 ' + e.patch : '', e.source || ''].filter(Boolean).join('　·　');
      if (sub) {
        ctx.fillStyle = dim;
        ctx.font = '400 20px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        y += drawWrapped(ctx, sub, x, y, maxW, 26, 1) + 12;
      }

      // 分隔線
      ctx.strokeStyle = border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + maxW, y); ctx.stroke();
      y += 22;

      // 逐件：部位｜裝備名（染色）
      var list = rows(e);
      var lineH = 30;
      /* 放不下時**不要縮字級到讀不到**，寫「…另外 N 件」。
         1200×630 是分享卡的標準比例，不為了塞滿而改。 */
      var room = Math.floor((H - PAD - 34 - y) / lineH);
      var show = list.slice(0, room);
      show.forEach(function (r) {
        ctx.fillStyle = dim;
        ctx.font = '400 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        ctx.fillText(r.slot, x, y);
        ctx.fillStyle = fg;
        ctx.font = '500 21px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        ctx.fillText(r.name, x + 74, y);
        if (r.dye) {
          var wName = ctx.measureText(r.name).width;
          ctx.fillStyle = gold;
          ctx.font = '400 17px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
          ctx.fillText('· ' + r.dye, x + 74 + wName + 10, y);
        }
        y += lineH;
      });
      if (list.length > show.length) {
        ctx.fillStyle = dim;
        ctx.font = '400 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        ctx.fillText('…另外 ' + (list.length - show.length) + ' 件', x, y);
      }

      // 頁尾署名：這是玩家自製工具，不要讓卡片看起來像官方出品
      ctx.fillStyle = dim;
      ctx.font = '400 17px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      ctx.fillText('水神的工具箱 · 幻化配裝圖鑑　|　FINAL FANTASY XIV © SQUARE ENIX（玩家自製非官方工具）',
        PAD, H - PAD + 10);

      return new Promise(function (res) {
        cv.toBlob(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '幻化-' + setTitle(e).replace(/[\\/:*?"<>|]/g, '') + '.png';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          res();
        }, 'image/png');
      });
    });
  }

  window.ShareCard = { canMake: canMake, rows: rows, make: make, isTw: isTw, W: W, H: H };
})();
