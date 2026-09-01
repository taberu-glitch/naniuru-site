/**
 * ナニウル｜金相場 自動更新スクリプト（Google Apps Script）
 * ------------------------------------------------------------
 * 平日 毎朝 10:00 に最新の貴金属相場を取得し、
 * GitHub リポジトリ内の data/gold.json を書き換えます。
 * サイト側は gold.json を fetch して表示するため、
 * これだけで「毎朝10時に自動書き換え」が完結します。
 *
 * ▼セットアップ
 * 1. script.google.com で新規プロジェクト作成 → 本コードを貼り付け
 * 2. スクリプトプロパティに以下を設定
 *    GITHUB_TOKEN : repo権限のFine-grained PAT
 *    GITHUB_REPO  : 例 "yxxk/naniuru-site"
 *    GITHUB_BRANCH: 例 "main"
 * 3. setupTrigger() を1回実行（毎日10:00のトリガーが作成されます）
 *    ※土日は関数内で自動スキップ（相場公表が平日のため）
 */

const FILE_PATH = "data/gold.json";

// K24小売価格に対する買取係数（店舗の買取レートに合わせて調整してください）
const GOLD_RATES = {
  K24: 1.000,
  K22: 0.915,
  K18: 0.745,
  K14: 0.575,
  K10: 0.407
};
const PT_RATES = {
  PT1000: 1.000,
  PT950: 0.945,
  PT900: 0.895,
  PT850: 0.840
};

function updateGoldPrice() {
  // 相場公表は平日のみ。土日はスキップ
  const day = Number(Utilities.formatDate(new Date(), "Asia/Tokyo", "u")); // 1=月 … 7=日
  if (day >= 6) {
    Logger.log("土日のためスキップしました。");
    return;
  }

  const price = fetchLatestPrice(); // {gold, platinum, silver}

  const metals = {};
  const put = (key, label, value) => {
    metals[key] = { label: label, price: Math.round(value) };
  };

  Object.entries(GOLD_RATES).forEach(([k, rate]) =>
    put(k, k === "K24" ? "K24（純金）" : k, price.gold * rate));
  Object.entries(PT_RATES).forEach(([k, rate]) =>
    put(k, "Pt" + k.replace("PT", ""), price.platinum * rate));
  put("SILVER", "銀（シルバー）", price.silver);

  const json = {
    updated: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm"),
    source: "田中貴金属 公表価格ベース（自動取得）",
    unit: "円/g",
    metals: metals
  };

  commitToGitHub(FILE_PATH, JSON.stringify(json, null, 2),
    "chore: 金相場を自動更新 " + json.updated);
  Logger.log("updated: " + JSON.stringify(json));
}

/**
 * 最新相場の取得。
 * 田中貴金属の公表ページをスクレイピングします。
 * ページ構造が変わった場合はこの関数のみ修正してください。
 */
function fetchLatestPrice() {
  const html = UrlFetchApp.fetch("https://gold.tanaka.co.jp/commodity/souba/", {
    muteHttpExceptions: true
  }).getContentText();

  // 「23,456 円」形式の数値を金/プラチナ/銀の掲載順で抽出
  const nums = [];
  const re = /([0-9]{1,3}(?:,[0-9]{3})*)\s*円/g;
  let m;
  while ((m = re.exec(html)) !== null && nums.length < 12) {
    nums.push(Number(m[1].replace(/,/g, "")));
  }
  // 金 > プラチナ > 銀 の大小関係で妥当性チェックしつつ選定
  const gold = nums.find(n => n > 10000);
  const platinum = nums.find(n => n > 3000 && n < gold);
  const silver = nums.find(n => n > 50 && n < 2000);

  if (!gold || !platinum || !silver) {
    throw new Error("相場の取得に失敗しました。取得元ページの構造を確認してください。");
  }
  return { gold: gold, platinum: platinum, silver: silver };
}

/* ---------------- GitHub API ---------------- */

function ghProps_() {
  const p = PropertiesService.getScriptProperties();
  return {
    token: p.getProperty("GITHUB_TOKEN"),
    repo: p.getProperty("GITHUB_REPO"),
    branch: p.getProperty("GITHUB_BRANCH") || "main"
  };
}

function commitToGitHub(path, content, message) {
  const { token, repo, branch } = ghProps_();
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };

  // 既存ファイルのSHA取得
  let sha = null;
  const getRes = UrlFetchApp.fetch(url + "?ref=" + branch, { headers, muteHttpExceptions: true });
  if (getRes.getResponseCode() === 200) sha = JSON.parse(getRes.getContentText()).sha;

  const payload = {
    message: message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: branch
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(url, {
    method: "put", headers, contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (putRes.getResponseCode() >= 300) {
    throw new Error("GitHubへの書き込みに失敗: " + putRes.getContentText());
  }
}

/* ---------------- トリガー ---------------- */

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "updateGoldPrice") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("updateGoldPrice")
    .timeBased().atHour(10).everyDays(1)
    .inTimezone("Asia/Tokyo")
    .create();
  Logger.log("毎日10:00（JST）のトリガーを設定しました（土日は自動スキップ）。");
}
