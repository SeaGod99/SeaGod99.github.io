/* official-terms.js — 台服官方術語（職業／資料片／天氣／種族）
   由 scripts/build-official-terms.mjs 從台服客戶端解包產生，**不要手改**（改了會被 validate-official-terms.mjs 抓到）。
   classic script：載入即同步可用 window.OfficialTerms。alias＝站上用過的非官方寫法，查詢時一律認得。 */
(function () {
  'use strict';
  var T = {"jobs":{"GLA":{"id":1,"name":"劍術士","alias":["劍術師"]},"PGL":{"id":2,"name":"格鬥士","alias":["格鬥家"]},"MRD":{"id":3,"name":"斧術士","alias":["斧術師"]},"LNC":{"id":4,"name":"槍術士","alias":["槍術師"]},"ARC":{"id":5,"name":"弓術士","alias":["弓箭手"]},"CNJ":{"id":6,"name":"幻術士","alias":["幻術師"]},"THM":{"id":7,"name":"咒術士","alias":["咒術師"]},"CRP":{"id":8,"name":"木工師","alias":["刻木匠"]},"BSM":{"id":9,"name":"鍛造師","alias":["鍛鐵匠"]},"ARM":{"id":10,"name":"甲冑師","alias":["鑄甲匠"]},"GSM":{"id":11,"name":"金工師","alias":["雕金匠"]},"LTW":{"id":12,"name":"皮革師","alias":["製革匠"]},"WVR":{"id":13,"name":"裁縫師","alias":["裁衣匠"]},"ALC":{"id":14,"name":"鍊金術師","alias":["煉金術士"]},"CUL":{"id":15,"name":"烹調師"},"MIN":{"id":16,"name":"採掘師","alias":["採礦工"]},"BTN":{"id":17,"name":"園藝師","alias":["園藝工"]},"FSH":{"id":18,"name":"漁師","alias":["捕魚人"]},"PLD":{"id":19,"name":"騎士"},"MNK":{"id":20,"name":"武僧"},"WAR":{"id":21,"name":"戰士"},"DRG":{"id":22,"name":"龍騎士"},"BRD":{"id":23,"name":"吟遊詩人"},"WHM":{"id":24,"name":"白魔道士"},"BLM":{"id":25,"name":"黑魔道士"},"ACN":{"id":26,"name":"巴術士","alias":["秘術師"]},"SMN":{"id":27,"name":"召喚士"},"SCH":{"id":28,"name":"學者"},"ROG":{"id":29,"name":"雙劍士","alias":["雙劍師"]},"NIN":{"id":30,"name":"忍者"},"MCH":{"id":31,"name":"機工士"},"DRK":{"id":32,"name":"暗黑騎士"},"AST":{"id":33,"name":"占星術師"},"SAM":{"id":34,"name":"武士"},"RDM":{"id":35,"name":"赤魔道士"},"BLU":{"id":36,"name":"青魔道士"},"GNB":{"id":37,"name":"絕槍戰士"},"DNC":{"id":38,"name":"舞者"},"RPR":{"id":39,"name":"奪魂者"},"SGE":{"id":40,"name":"賢者"},"VPR":{"id":41,"name":"毒蛇劍士"},"PCT":{"id":42,"name":"繪靈法師"},"ADV":{"id":0,"name":"冒險者"}},"expansions":[{"ex":0,"major":2,"name":"新生艾奧傑亞","short":"2.x","alias":["原初之地"]},{"ex":1,"major":3,"name":"蒼天伊修加爾德","short":"3.x","alias":["蒼天之禁地"]},{"ex":2,"major":4,"name":"紅蓮解放者","short":"4.x","alias":["紅蓮之狂潮"]},{"ex":3,"major":5,"name":"漆黑反叛者","short":"5.x","alias":["暗影之逆焰"]},{"ex":4,"major":6,"name":"曉月之終途","short":"6.x"},{"ex":5,"major":7,"name":"黃金遺產","short":"7.x","alias":["金曦之遺輝"]}],"weather":{"clearSkies":{"id":1,"name":"碧空"},"fairSkies":{"id":2,"name":"晴朗"},"clouds":{"id":3,"name":"陰雲","alias":["陰天"]},"fog":{"id":4,"name":"薄霧"},"wind":{"id":5,"name":"微風"},"gales":{"id":6,"name":"強風"},"rain":{"id":7,"name":"小雨"},"showers":{"id":8,"name":"暴雨"},"thunder":{"id":9,"name":"打雷"},"thunderstorms":{"id":10,"name":"雷雨"},"dustStorms":{"id":11,"name":"揚沙"},"sandstorms":{"id":12,"name":"沙塵暴"},"heatWaves":{"id":14,"name":"熱浪"},"snow":{"id":15,"name":"小雪","alias":["降雪"]},"blizzards":{"id":16,"name":"暴雪"},"gloom":{"id":17,"name":"妖霧"},"umbralWind":{"id":49,"name":"靈風"},"umbralStatic":{"id":50,"name":"靈電","alias":["放電現象"]},"moonDust":{"id":148,"name":"月塵"},"astromagneticStorms":{"id":149,"name":"磁暴","alias":["星磁暴","星磁暴雨"]},"hotSpells":{"id":13,"name":"高溫","alias":["Hot Spells"]},"dimensionalDisruption":{"id":77,"name":"次元","alias":["Dimensional Disruption"]},"everlastingLight":{"id":118,"name":"無盡光","alias":["Everlasting Light"]},"polarization":{"id":151,"name":"星靈","alias":["Polarization"]},"pandaemonium":{"id":157,"name":"萬魔殿","alias":["Pandæmonium"]},"transcendence":{"id":162,"name":"神域","alias":["Transcendence"]},"vacuity":{"id":171,"name":"虛無","alias":["Vacuity"]},"liminality":{"id":181,"name":"閾限","alias":["Liminality"]},"atmosphericPhantasms":{"id":190,"name":"幻怪","alias":["Atmospheric Phantasms"]},"illusoryDisturbances":{"id":191,"name":"幻妖","alias":["Illusory Disturbances"]},"violentGales":{"id":28,"name":"暴風"},"brilliance":{"id":125,"name":"光天","alias":["Brilliance"]}},"races":{"1":{"name":"人族"},"2":{"name":"精靈族"},"3":{"name":"拉拉菲爾族"},"4":{"name":"貓魅族"},"5":{"name":"魯加族"},"6":{"name":"敖龍族"},"7":{"name":"硌獅族"},"8":{"name":"維艾拉族","alias":["維埃拉族"]}}};
  var byName = {};          // 任何寫法 → 職業縮寫
  Object.keys(T.jobs).forEach(function (k) {
    var j = T.jobs[k];
    byName[j.name] = k;
    (j.alias || []).forEach(function (a) { byName[a] = k; });
  });
  var exByName = {};        // 任何寫法（含「2.x 原初之地」這種舊標籤）→ 資料片
  T.expansions.forEach(function (e) {
    [e.name].concat(e.alias || []).forEach(function (n) { exByName[n] = e; exByName[e.short + ' ' + n] = e; });
  });
  var wByName = {};         // 任何寫法 → 天氣鍵
  Object.keys(T.weather).forEach(function (k) {
    var w = T.weather[k];
    wByName[w.name] = k;
    (w.alias || []).forEach(function (a) { wByName[a] = k; });
  });
  function major(patch) { var m = String(patch == null ? '' : patch).match(/^(\d+)/); return m ? +m[1] : null; }
  T.jobName = function (abbr) { var j = T.jobs[abbr]; return j ? j.name : null; };
  T.jobAbbrOf = function (name) { return byName[String(name || '').trim()] || null; };
  /** 2..7 或 '7.25' → 資料片物件 */
  T.expansion = function (majorOrPatch) {
    var n = typeof majorOrPatch === 'number' ? majorOrPatch : major(majorOrPatch);
    for (var i = 0; i < T.expansions.length; i++) if (T.expansions[i].major === n) return T.expansions[i];
    return null;
  };
  /** 「2.x 新生艾奧傑亞」這種版本篩選標籤 */
  T.expansionLabel = function (majorOrPatch) { var e = T.expansion(majorOrPatch); return e ? e.short + ' ' + e.name : null; };
  /** 舊名、舊標籤、官方名都認得 → 資料片物件 */
  T.expansionByName = function (name) { return exByName[String(name || '').trim()] || null; };
  T.weatherName = function (key) { var w = T.weather[key]; return w ? w.name : null; };
  T.weatherKeyOf = function (name) { return wByName[String(name || '').trim()] || null; };
  window.OfficialTerms = T;
})();
