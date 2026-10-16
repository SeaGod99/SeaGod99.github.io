// 台服各版本「這一版新開放的內容」——用台服客戶端解包前後兩版的差集產生
//
// 為什麼需要：全站版本閘門（assets/js/patch-gate.js）比的是條目的 patch 標籤，而那些標籤多半來自
// Teamcraft 的**全球**版本表（patch-content／patch-names）或 ffxivcollect。台服的版本切法和國際服不同，
// 而且 Teamcraft 的全球表**沒有 7.25 這一列**（101＝7.2、102＝7.21、103＝7.3）——台服 7.25 的新物品
// 在那邊全被標成 7.3。於是：
//   - 只把 gamePatch 改成 7.25 → `pnum("7.3")＝7.30 > 7.25`，這批一件也放不出來；
//   - 把 gamePatch 改成 7.3   → 連國際服 7.3 獨有、台服還沒開的內容一起放出（其中很多沒有台服名）。
// 解法：每升一個台服版本，就拿「這一版客戶端有名字、上一版沒有」的 id 清單，把那些條目重標回台服版號
// （scripts/patch-tw-release.mjs）。清單是**客戶端自己說的**，不是推測；「有名字」只當放行的必要條件，
// 所以全球標籤比較晚、但台服上一版就已經有名字的預載列（例：7.4 標籤的 44272 金屏風）不會被誤放。
//
// 新增一個台服版本時：在下面加一筆（client＝這一版解包 commit、prev＝上一版），
// 跑 `node scripts/patch-tw-release.mjs --build` 產生清單檔，再照 SOP 跑 `--apply`。
// commit 與版本字串查 https://github.com/thewakingsands/ffxiv-datamining-tc/commits/main

export const TW_RELEASES = [
  {
    version: "7.25",
    client: { version: "2026.09.14.0000.0000", sha: "1cf1f9fb735bad0748848dbd3f4de05721fe619a" },
    prev: { version: "2026.07.22.0000.0000", sha: "e203c7e46dd80fd2a967e5741b30e3c9fad0c767" },
    file: "tw-release-7.25.json",
  },
];

/** 與 assets/js/patch-gate.js 相同的版本數值化：次版號補滿兩位（7.3 → 7.30，7.25 → 7.25） */
export function pnum(p) {
  if (p == null || p === "") return null;
  const m = String(p).match(/^(\d+)\.(\d+)/);
  return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : null;
}
