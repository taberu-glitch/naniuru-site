/**
 * ナニウル｜Googleレビュー 自動更新スクリプト（Google Apps Script）
 * ------------------------------------------------------------
 * Google Places API からナニウルのクチコミを取得し、
 * ★4以上の高評価レビューのみを data/reviews.json に書き出します。
 * 金相場と同じく毎朝10:00に自動実行され、サイトに反映されます。
 *
 * ▼セットアップ
 * 1. Google Cloud Console で「Places API」を有効化しAPIキーを発行
 * 2. スクリプトプロパティに以下を設定
 *    PLACES_API_KEY : Places APIキー
 *    PLACE_ID       : ナニウル本店のPlace ID
 *    GITHUB_TOKEN / GITHUB_REPO / GITHUB_BRANCH（金相場と共通）
 * 3. setupReviewTrigger() を1回実行
 *
 * ※Places APIの仕様上、取得できるのは代表的なレビュー最大5件です。
 *   より多く掲載したい場合はサードパーティのレビュー取得サービス
 *   （またはビジネスプロフィールAPI）への差し替えを検討してください。
 */

const REVIEW_FILE_PATH = "data/reviews.json";
const MIN_STARS = 4; // この星数未満のレビューは掲載しない

function updateReviews() {
  const p = PropertiesService.getScriptProperties();
  const key = p.getProperty("PLACES_API_KEY");
  const placeId = p.getProperty("PLACE_ID");

  const url = "https://maps.googleapis.com/maps/api/place/details/json"
    + "?place_id=" + encodeURIComponent(placeId)
    + "&fields=name,rating,user_ratings_total,reviews,url"
    + "&language=ja&reviews_sort=newest"
    + "&key=" + key;

  const res = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  if (res.status !== "OK") {
    throw new Error("Places API エラー: " + res.status);
  }
  const r = res.result;

  const reviews = (r.reviews || [])
    .filter(v => Number(v.rating) >= MIN_STARS)     // ★4以上のみ
    .sort((a, b) => Number(b.rating) - Number(a.rating)) // 評価が高い順（同評価は新しい順を維持）
    .map(v => ({
      author: v.author_name,
      rating: v.rating,
      time: v.relative_time_description,
      text: (v.text || "").slice(0, 200)            // 長文は200字で丸める
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

  commitToGitHub(REVIEW_FILE_PATH, JSON.stringify(json, null, 2),
    "chore: Googleレビューを自動更新 " + json.updated);
  Logger.log("reviews updated: " + reviews.length + "件（★" + MIN_STARS + "以上）");
}

function setupReviewTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "updateReviews") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("updateReviews")
    .timeBased().atHour(10).everyDays(1)
    .inTimezone("Asia/Tokyo")
    .create();
  Logger.log("毎日10:00（JST）のレビュー更新トリガーを設定しました。");
}

/* commitToGitHub() は gold_price_updater.gs と同一プロジェクトに
   まとめる場合、そちらの関数をそのまま共用できます。 */
