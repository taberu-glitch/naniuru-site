/**
 * =========================================================
 * ナニウル｜自動更新オールインワン（このファイル1つだけでOK）
 * ---------------------------------------------------------
 * ・金相場       … 毎朝10:00ちょうど に data/gold.json を更新（土日はスキップ）
 *                  金 / プラチナ / シルバー の3カラム・インゴット価格＋前日比つき
 * ・Googleレビュー … 毎朝10:00 に ★4以上を評価順で data/reviews.json に更新
 *
 * ▼すでに稼働中の場合（コードを差し替えるだけ）
 *   1. GASエディタのコードを全部消して、このファイルを全文貼り付け → 保存
 *   2. 「testFetchOnly」を実行 → ログに新しい金種・前日比が出ればOK
 *   3. 「updateGoldPrice」を実行 → サイトにすぐ反映（トリガーは設定済みのまま動きます）
 *
 * ▼新規に設定する場合
 *   1. script.google.com → 新規プロジェクト → このコードを全文貼り付け
 *   2. プロジェクトの設定 → スクリプトプロパティに登録
 *        GITHUB_TOKEN / GITHUB_REPO / GITHUB_BRANCH / PLACES_API_KEY / PLACE_ID
 *   3. 「testFetchOnly」→「updateGoldPrice」→「setupAllTriggers」の順に実行
 * =========================================================
 */

/* =========================================================
   ★ 金種と計算式の設定（掛け率を変えたいときはここだけ編集）
   ---------------------------------------------------------
   base  : 田中貴金属のどの価格を基準にするか（gold / platinum / silver）
   ig    : 上段に大きく表示するインゴット価格（＝田中価格そのまま＋前日比）
   items : 下段の一覧。price = 田中価格 × rate
   digits: 小数点以下の桁数（金・プラチナは0＝円単位、シルバーは2＝銭単位）
========================================================= */
const METAL_GROUPS = [
  {
    key: "gold", title: "金", en: "GOLD", base: "gold", digits: 0,
    ig: { key: "K24IG", label: "K24 IG", sub: "インゴット" },
    items: [
      { key: "K24", rate: 0.9991 },
      { key: "K22", rate: 0.9182 },
      { key: "K20", rate: 0.821 },
      { key: "K18", rate: 0.7731 },
      { key: "K14", rate: 0.5732 },
      { key: "K10", rate: 0.4142 },
      { key: "K9",  rate: 0.37 }
    ]
  },
  {
    key: "platinum", title: "プラチナ", en: "PLATINUM", base: "platinum", digits: 0,
    ig: { key: "Pt1000IG", label: "Pt1000 IG", sub: "インゴット" },
    items: [
      { key: "Pt1000", rate: 0.9952 },
      { key: "Pt950",  rate: 0.9405 },
      { key: "Pt900",  rate: 1.022 },   // ※ご指定どおり。Pt1000より高くなるため要確認
      { key: "Pt850",  rate: 0.98 }     // ※ご指定どおり。Pt1000より高くなるため要確認
    ]
  },
  {
    key: "silver", title: "シルバー", en: "SILVER", base: "silver", digits: 2,
    ig: { key: "SV1000IG", label: "SV1000 IG", sub: "インゴット" },
    items: [
      { key: "SV1000", rate: 0.967 },
      { key: "SV925",  rate: 0.873 },
      { key: "SV",     rate: 0.81 }
    ]
  }
];

/**
 * 基準価格：田中貴金属の「店頭買取価格」(buy) か「店頭小売価格」(retail) か。
 * これまで通り buy（店頭買取価格・税込）を「田中価格」として使います。
 */
const PRICE_BASIS = "buy";

/* ============ ① 動作テスト（手動実行用） ============ */
function runAllNow() {
  updateGoldPrice(true); // true = 土日でも強制実行（テスト用）
  updateReviews();
  Logger.log("★テスト完了。GitHubの data/gold.json と data/reviews.json のコミットを確認してください。");
}

/* ============ ② トリガー設定（10:00ちょうど版） ============
 * GASの「毎日◯時」トリガーは1時間の幅で実行されるため、
 * 「次の10:00に一回だけ動く単発トリガー」を毎日自動で予約し直す方式にしています。
 * ・dailyUpdateAt10 …… 10:00に実行 → 翌日10:00の単発トリガーを予約 → 更新処理
 * ・dailyFallback   …… 11時台の保険。今日まだ更新していなければ実行（万一の取りこぼし対策）
 */
const RUN_HOUR = 10;   // 実行時刻（時）
const RUN_MIN  = 0;    // 実行時刻（分）

function setupAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  scheduleNextRun_();
  ScriptApp.newTrigger("dailyFallback").timeBased().atHour(RUN_HOUR + 1).everyDays(1).inTimezone("Asia/Tokyo").create();
  Logger.log("次回 " + Utilities.formatDate(nextRunTime_(), "Asia/Tokyo", "M/d HH:mm") + " の単発トリガーと、" + (RUN_HOUR + 1) + "時台の保険トリガーを設定しました。");
}

/** 次の RUN_HOUR:RUN_MIN（JST）を返す */
function nextRunTime_() {
  const now = new Date();
  const t = new Date(now);
  t.setHours(RUN_HOUR, RUN_MIN, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}

/** 古い単発トリガーを掃除して、次の10:00を予約 */
function scheduleNextRun_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "dailyUpdateAt10") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyUpdateAt10").timeBased().at(nextRunTime_()).create();
}

/** 10:00ちょうどに実行される本体 */
function dailyUpdateAt10() {
  scheduleNextRun_();           // ★先に翌日分を予約（更新でエラーが出ても連鎖が途切れない）
  runDailyUpdates_();
}

/** 11時台の保険：今日まだ動いていなければ実行 */
function dailyFallback() {
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const last = PropertiesService.getScriptProperties().getProperty("LAST_RUN_DATE");
  if (last === today) { Logger.log("本日分は10:00に実行済みのためスキップ"); return; }
  Logger.log("10:00の実行が確認できないため、保険トリガーで実行します");
  scheduleNextRun_();
  runDailyUpdates_();
}

/** 金相場・レビューを順に実行（片方が失敗してももう片方は動かす） */
function runDailyUpdates_() {
  const errors = [];
  try { updateGoldPrice(); } catch (e) { errors.push("金相場: " + e.message); }
  try { updateReviews(); }   catch (e) { errors.push("レビュー: " + e.message); }
  PropertiesService.getScriptProperties().setProperty("LAST_RUN_DATE",
    Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd"));
  if (errors.length) Logger.log("一部エラー: " + errors.join(" / "));
  else Logger.log("本日の自動更新が完了しました。");
}

/* =========================================================
   金相場更新
========================================================= */
const GOLD_FILE = "data/gold.json";

function updateGoldPrice(force) {
  const day = Number(Utilities.formatDate(new Date(), "Asia/Tokyo", "u")); // 1=月…7=日
  if (force !== true && day >= 6) { Logger.log("土日のため金相場はスキップ"); return; }

  const json = buildGoldJson(fetchLatestPrice());
  commitToGitHub(GOLD_FILE, JSON.stringify(json, null, 2), "auto: 金相場更新 " + json.updated);
  Logger.log("金相場を更新しました: " + summaryLine_(json));
}

/** 田中貴金属の相場ページを取得して解析 */
function fetchLatestPrice() {
  const html = UrlFetchApp.fetch("https://gold.tanaka.co.jp/commodity/souba/", {
    muteHttpExceptions: true, followRedirects: true
  }).getContentText("UTF-8");
  return parseTanakaHtml(html);
}

/** HTML → 価格・前日比（テストしやすいよう取得と分離） */
function parseTanakaHtml(html) {
  // タグを除いたテキストで解析（class名などの数字を誤って拾わないため）
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&yen;/g, "円").replace(/&#43;|&plus;/g, "+").replace(/&minus;/g, "−")
    .replace(/[ \t\r\n]+/g, " ");

  // 「地金価格」見出し以降だけを対象にする（ナビの「金地金」等の誤検出を防止）
  const idx = text.indexOf("地金価格");
  const body = idx >= 0 ? text.slice(idx) : text;

  const RETAIL = "店頭小売価格（税込）";
  const BUY = "店頭買取価格（税込）";
  const pub = body.match(/([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日\s*([0-9]{1,2}:[0-9]{2})\s*公表/);

  // ページ内は 金→プラチナ→銀 の順に「小売」「買取」が並ぶ。価格の直後にある「±◯円」を前日比として読む
  const pick = (label) => {
    const out = [];
    let from = 0;
    while (out.length < 3) {
      const at = body.indexOf(label, from);
      if (at < 0) break;
      const rest = body.slice(at + label.length);
      const m = rest.match(/^[^0-9]*?([0-9][0-9,]*(?:\.[0-9]+)?)\s*円/);
      if (!m) break;
      const price = Number(m[1].replace(/,/g, ""));
      // 価格の直後〜次のラベルまで（最大160文字）から前日比を探す
      let seg = rest.slice(m.index + m[0].length, m.index + m[0].length + 160);
      [RETAIL, BUY].forEach(l => { const k = seg.indexOf(l); if (k >= 0) seg = seg.slice(0, k); });
      const c = seg.match(/([+＋\-−－▼]|±)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*円/);
      let change = null;
      if (c) {
        const v = Number(c[2].replace(/,/g, ""));
        const neg = c[1] && /[\-−－▼]/.test(c[1]);
        change = neg ? -v : v;
        if (Math.abs(change) > price * 0.15) change = null; // 桁違いは前日比とみなさない
      }
      out.push({ price: price, change: change });
      from = at + label.length;
    }
    return out;
  };
  const retail = pick(RETAIL);
  const buy = pick(BUY);

  // 妥当性チェック：金 > プラチナ > 銀 かつ 桁感が合っていること
  const ok = (a) => a.length === 3 && a[0].price > 5000 && a[1].price > 1000 &&
    a[1].price < a[0].price && a[2].price > 10 && a[2].price < 5000;
  if (!ok(retail) || !ok(buy)) {
    throw new Error("相場の解析に失敗（取得元ページの構造変更の可能性）: retail=" +
      JSON.stringify(retail) + " buy=" + JSON.stringify(buy));
  }
  const pack = (a) => ({
    gold: a[0].price, platinum: a[1].price, silver: a[2].price,
    change: { gold: a[0].change, platinum: a[1].change, silver: a[2].change }
  });
  return {
    retail: pack(retail),
    buy: pack(buy),
    published: pub ? `${pub[1]}-${("0" + pub[2]).slice(-2)}-${("0" + pub[3]).slice(-2)} ${pub[4]}` : ""
  };
}

/** 取得値 → サイト用JSON（gold.json）を組み立て */
function buildGoldJson(price, nowStr) {
  const base = PRICE_BASIS === "retail" ? price.retail : price.buy;
  const round = (v, d) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };

  const groups = METAL_GROUPS.map(g => {
    const p = base[g.base];
    const ch = base.change ? base.change[g.base] : null;
    return {
      key: g.key, title: g.title, en: g.en, digits: g.digits,
      ig: { key: g.ig.key, label: g.ig.label, sub: g.ig.sub,
            price: round(p, g.digits), change: ch == null ? null : round(ch, g.digits) },
      items: g.items.map(it => ({ key: it.key, label: it.label || it.key, price: round(p * it.rate, g.digits) }))
    };
  });

  // 旧レイアウト（デザイン比較ページ等）向けの互換データ：全金種を1列に
  const metals = {};
  groups.forEach(g => {
    metals[g.ig.key] = { label: g.ig.label, price: g.ig.price, change: g.ig.change };
    g.items.forEach(it => { metals[it.key] = { label: it.label, price: it.price }; });
  });

  return {
    updated: nowStr || Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm"),
    published: price.published,
    source: "田中貴金属 " + (PRICE_BASIS === "retail" ? "店頭小売価格" : "店頭買取価格") + "（税込）ベース（自動取得・公表 " + price.published + "）",
    unit: "円/g",
    groups: groups,
    metals: metals
  };
}

function summaryLine_(json) {
  return json.groups.map(g => g.ig.label + "=" + g.ig.price + "円（前日比 " +
    (g.ig.change == null ? "—" : (g.ig.change > 0 ? "+" : "") + g.ig.change) + "）").join(" / ");
}

/* ============ ③ テスト専用：取得と計算だけ（GitHubへは書き込まない） ============ */
function testFetchOnly() {
  const price = fetchLatestPrice();
  Logger.log("▼ 取得結果（田中貴金属）公表: " + price.published);
  Logger.log("小売: 金 " + price.retail.gold + " / Pt " + price.retail.platinum + " / 銀 " + price.retail.silver);
  Logger.log("買取: 金 " + price.buy.gold + " / Pt " + price.buy.platinum + " / 銀 " + price.buy.silver);
  Logger.log("前日比（買取）: 金 " + price.buy.change.gold + " / Pt " + price.buy.change.platinum + " / 銀 " + price.buy.change.silver);
  const json = buildGoldJson(price);
  json.groups.forEach(g => {
    Logger.log("■ " + g.title + "  " + g.ig.label + " " + g.ig.price + "円（前日比 " + g.ig.change + "）");
    g.items.forEach(it => Logger.log("   " + it.label + " " + it.price + "円"));
  });
  Logger.log("▼ サイト用 gold.json\n" + JSON.stringify(json, null, 2));
  return json;
}

/* =========================================================
   Googleレビュー更新（★4以上・評価が高い順）
========================================================= */
const REVIEW_FILE = "data/reviews.json";
const MIN_STARS = 4;

function updateReviews() {
  const p = PropertiesService.getScriptProperties();
  const key = p.getProperty("PLACES_API_KEY");
  const placeId = p.getProperty("PLACE_ID");
  if (!key || !placeId) throw new Error("PLACES_API_KEY / PLACE_ID が未設定です");

  const url = "https://maps.googleapis.com/maps/api/place/details/json"
    + "?place_id=" + encodeURIComponent(placeId)
    + "&fields=name,rating,user_ratings_total,reviews,url"
    + "&language=ja&reviews_sort=newest&key=" + key;

  const res = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  if (res.status !== "OK") throw new Error("Places API: " + res.status + " " + (res.error_message || ""));
  const r = res.result;

  const reviews = (r.reviews || [])
    .filter(v => Number(v.rating) >= MIN_STARS)                 // ★4以上のみ
    .sort((a, b) => Number(b.rating) - Number(a.rating))        // 評価が高い順
    .map(v => ({
      author: v.author_name,
      rating: v.rating,
      time: v.relative_time_description,
      text: (v.text || "").slice(0, 200)
    }));

  const json = {
    updated: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm"),
    place_name: r.name,
    place_url: r.url,
    rating_avg: r.rating,
    ratings_total: r.user_ratings_total,
    min_stars: MIN_STARS,
    reviews: reviews
  };
  commitToGitHub(REVIEW_FILE, JSON.stringify(json, null, 2), "auto: レビュー更新 " + json.updated);
  Logger.log("レビューを更新しました: " + reviews.length + "件（★" + MIN_STARS + "以上・評価順）");
}

/* =========================================================
   GitHub API（共通）
========================================================= */
function commitToGitHub(path, content, message) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty("GITHUB_TOKEN");
  const repo = p.getProperty("GITHUB_REPO");
  const branch = p.getProperty("GITHUB_BRANCH") || "main";
  if (!token || !repo) throw new Error("GITHUB_TOKEN / GITHUB_REPO が未設定です");

  const url = "https://api.github.com/repos/" + repo + "/contents/" + path;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };

  let sha = null;
  const g = UrlFetchApp.fetch(url + "?ref=" + branch, { headers: headers, muteHttpExceptions: true });
  if (g.getResponseCode() === 200) sha = JSON.parse(g.getContentText()).sha;

  const payload = { message: message, content: Utilities.base64Encode(content, Utilities.Charset.UTF_8), branch: branch };
  if (sha) payload.sha = sha;

  const put = UrlFetchApp.fetch(url, {
    method: "put", headers: headers, contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = put.getResponseCode();
  if (code >= 300) {
    if (code === 401) throw new Error("GitHub認証エラー（トークン期限切れの可能性）");
    throw new Error("GitHub書込失敗 " + code + ": " + put.getContentText().slice(0, 200));
  }
}

/* =========================================================
   設定チェック（迷ったらまずこれを実行）
========================================================= */
function checkSettings() {
  const p = PropertiesService.getScriptProperties();
  ["GITHUB_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH", "PLACES_API_KEY", "PLACE_ID"].forEach(k => {
    const v = p.getProperty(k);
    Logger.log((v ? "✔ " : "✖ 未設定 ") + k + (v && k !== "GITHUB_TOKEN" && k !== "PLACES_API_KEY" ? " = " + v : ""));
  });
  Logger.log("トリガー: " + ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join(", "));
}
