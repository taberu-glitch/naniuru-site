/**
 * =========================================================
 * ナニウル｜自動更新オールインワン（このファイル1つだけでOK）
 * ---------------------------------------------------------
 * ・金相場       … 平日 毎朝10:00 に data/gold.json を更新
 * ・Googleレビュー … 毎日 毎朝10:00 に ★4以上を評価順で data/reviews.json に更新
 *
 * ▼使い方（3ステップ）
 * 1. script.google.com → 新規プロジェクト → このコードを全文貼り付け
 * 2. プロジェクトの設定 → スクリプトプロパティに5件登録
 *      GITHUB_TOKEN   / GITHUB_REPO / GITHUB_BRANCH
 *      PLACES_API_KEY / PLACE_ID
 * 3. まず「testFetchOnly」を実行 → ログに本日の相場とJSONが出れば取得OK（GitHub不要）
 * 4. 「runAllNow」で本番書き込みを確認 → 「setupAllTriggers」で自動化ON
 * =========================================================
 */

/* ============ ① 動作テスト（手動実行用） ============ */
function runAllNow() {
  updateGoldPrice(true); // true = 土日でも強制実行（テスト用）
  updateReviews();
  Logger.log("★テスト完了。GitHubの data/gold.json と data/reviews.json のコミットを確認してください。");
}

/* ============ ② トリガー一括設定 ============ */
function setupAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("updateGoldPrice").timeBased().atHour(10).everyDays(1).inTimezone("Asia/Tokyo").create();
  ScriptApp.newTrigger("updateReviews").timeBased().atHour(10).everyDays(1).inTimezone("Asia/Tokyo").create();
  Logger.log("毎朝10時（JST）の自動実行トリガーを2件設定しました。");
}

/* =========================================================
   金相場更新
========================================================= */
const GOLD_FILE = "data/gold.json";
/**
 * 価格基準：田中貴金属の「店頭買取価格」(buy) か「店頭小売価格」(retail) のどちらを
 * K24=1.000 の基準にするか。買取店の相場表としては buy（買取価格ベース）が自然です。
 * ※2026/08/31時点：小売25,417円 / 買取24,868円（差 約2.2%）
 */
const PRICE_BASIS = "buy";
const GOLD_RATES = { K24: 1.000, K22: 0.915, K18: 0.745, K14: 0.575, K10: 0.407 };
const PT_RATES = { PT1000: 1.000, PT950: 0.945, PT900: 0.895, PT850: 0.840 };

function updateGoldPrice(force) {
  const day = Number(Utilities.formatDate(new Date(), "Asia/Tokyo", "u")); // 1=月…7=日
  if (!force && day >= 6) { Logger.log("土日のため金相場はスキップ"); return; }

  const json = buildGoldJson(fetchLatestPrice());
  commitToGitHub(GOLD_FILE, JSON.stringify(json, null, 2), "auto: 金相場更新 " + json.updated);
  Logger.log("金相場を更新しました: K24=" + metals.K24.price + "円/g");
}

function fetchLatestPrice() {
  const html = UrlFetchApp.fetch("https://gold.tanaka.co.jp/commodity/souba/", {
    muteHttpExceptions: true, followRedirects: true
  }).getContentText("UTF-8");

  // 「地金価格」見出し以降だけを対象にする（ナビの「金地金」等の誤検出を防止）
  const idx = html.indexOf("地金価格");
  const body = idx >= 0 ? html.slice(idx) : html;

  // ページ内は 金→プラチナ→銀 の順で「店頭小売価格（税込）」「店頭買取価格（税込）」が並ぶ
  const pick = (label) => {
    const re = new RegExp(label + "[^0-9]*?([0-9][0-9,\\.]*)\\s*円", "g");
    const out = []; let m;
    while ((m = re.exec(body)) !== null && out.length < 3) out.push(Number(m[1].replace(/,/g, "")));
    return out;
  };
  const retail = pick("店頭小売価格（税込）");
  const buy = pick("店頭買取価格（税込）");
  const pub = body.match(/([0-9]{4})年([0-9]{2})月([0-9]{2})日\s*([0-9]{1,2}:[0-9]{2})公表/);

  // 妥当性チェック：金 > プラチナ > 銀 かつ 桁感が合っていること
  const ok = (a) => a.length === 3 && a[0] > 5000 && a[1] > 1000 && a[1] < a[0] && a[2] > 10 && a[2] < 5000;
  if (!ok(retail) || !ok(buy)) {
    throw new Error("相場の解析に失敗（取得元ページの構造変更の可能性）: retail=" + JSON.stringify(retail) + " buy=" + JSON.stringify(buy));
  }
  return {
    retail: { gold: retail[0], platinum: retail[1], silver: retail[2] },
    buy:    { gold: buy[0],    platinum: buy[1],    silver: buy[2] },
    published: pub ? `${pub[1]}-${pub[2]}-${pub[3]} ${pub[4]}` : ""
  };
}

/** 取得値 → サイト用JSON（gold.json）を組み立て */
function buildGoldJson(price) {
  const base = PRICE_BASIS === "retail" ? price.retail : price.buy;
  const metals = {};
  const put = (key, label, v) => { metals[key] = { label: label, price: Math.round(v) }; };
  Object.entries(GOLD_RATES).forEach(([k, r]) => put(k, k === "K24" ? "K24（純金）" : k, base.gold * r));
  Object.entries(PT_RATES).forEach(([k, r]) => put(k, "Pt" + k.replace("PT", ""), base.platinum * r));
  put("SILVER", "銀（シルバー）", base.silver);
  return {
    updated: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm"),
    source: "田中貴金属 " + (PRICE_BASIS === "retail" ? "店頭小売価格" : "店頭買取価格") + "ベース（自動取得・公表 " + price.published + "）",
    unit: "円/g",
    metals: metals
  };
}

/* ============ ③ テスト専用：取得と計算だけ（GitHubへは書き込まない） ============ */
function testFetchOnly() {
  const price = fetchLatestPrice();
  Logger.log("▼ 取得結果（田中貴金属）");
  Logger.log("公表時刻: " + price.published);
  Logger.log("小売: 金 " + price.retail.gold + " / Pt " + price.retail.platinum + " / 銀 " + price.retail.silver);
  Logger.log("買取: 金 " + price.buy.gold + " / Pt " + price.buy.platinum + " / 銀 " + price.buy.silver);
  const json = buildGoldJson(price);
  Logger.log("▼ サイト用 gold.json（基準: " + PRICE_BASIS + "）\n" + JSON.stringify(json, null, 2));
  Logger.log("※ このJSONを data/gold.json に貼り付ければ、GitHub接続なしでサイト表示を確認できます。");
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
}
