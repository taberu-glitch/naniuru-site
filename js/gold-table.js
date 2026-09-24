/* =========================================================
   ナニウル｜本日の貴金属買取価格表（トップページ・商品ページ共通）
   ---------------------------------------------------------
   data/gold.json（毎朝10:00にGASが自動更新）を読み込み、
   #goldUpdated / #goldCols / #goldSource に描画します。
   サブフォルダのページでは読み込み前に window.SITE_BASE="../" を指定。
========================================================= */
/* フォールバック（fetch不可のローカル閲覧時用。本番は data/gold.json を表示） */
const DEFAULT_GOLD = {
  "updated": "2026-09-23 10:00",
  "published": "2026-09-18 17:00",
  "source": "田中貴金属 店頭買取価格（税込）ベース（自動取得・公表 2026-09-18 17:00）",
  "unit": "円/g",
  "groups": [
    {
      "key": "gold",
      "title": "金",
      "en": "GOLD",
      "digits": 0,
      "ig": {
        "key": "K24IG",
        "label": "K24 IG",
        "sub": "インゴット",
        "price": 24247,
        "change": 747
      },
      "items": [
        {
          "key": "K24",
          "label": "K24",
          "price": 24225
        },
        {
          "key": "K22",
          "label": "K22",
          "price": 22264
        },
        {
          "key": "K20",
          "label": "K20",
          "price": 19907
        },
        {
          "key": "K18",
          "label": "K18",
          "price": 18745
        },
        {
          "key": "K14",
          "label": "K14",
          "price": 13898
        },
        {
          "key": "K10",
          "label": "K10",
          "price": 10043
        },
        {
          "key": "K9",
          "label": "K9",
          "price": 8971
        }
      ]
    },
    {
      "key": "platinum",
      "title": "プラチナ",
      "en": "PLATINUM",
      "digits": 0,
      "ig": {
        "key": "Pt1000IG",
        "label": "Pt1000 IG",
        "sub": "インゴット",
        "price": 9910,
        "change": 362
      },
      "items": [
        {
          "key": "Pt1000",
          "label": "Pt1000",
          "price": 9862
        },
        {
          "key": "Pt950",
          "label": "Pt950",
          "price": 9320
        },
        {
          "key": "Pt900",
          "label": "Pt900",
          "price": 10128
        },
        {
          "key": "Pt850",
          "label": "Pt850",
          "price": 9712
        }
      ]
    },
    {
      "key": "silver",
      "title": "シルバー",
      "en": "SILVER",
      "digits": 2,
      "ig": {
        "key": "SV1000IG",
        "label": "SV1000 IG",
        "sub": "インゴット",
        "price": 362.45,
        "change": 15.29
      },
      "items": [
        {
          "key": "SV1000",
          "label": "SV1000",
          "price": 350.49
        },
        {
          "key": "SV925",
          "label": "SV925",
          "price": 316.42
        },
        {
          "key": "SV",
          "label": "SV",
          "price": 293.58
        }
      ]
    }
  ],
  "metals": {
    "K24IG": {
      "label": "K24 IG",
      "price": 24247,
      "change": 747
    },
    "K24": {
      "label": "K24",
      "price": 24225
    },
    "K22": {
      "label": "K22",
      "price": 22264
    },
    "K20": {
      "label": "K20",
      "price": 19907
    },
    "K18": {
      "label": "K18",
      "price": 18745
    },
    "K14": {
      "label": "K14",
      "price": 13898
    },
    "K10": {
      "label": "K10",
      "price": 10043
    },
    "K9": {
      "label": "K9",
      "price": 8971
    },
    "Pt1000IG": {
      "label": "Pt1000 IG",
      "price": 9910,
      "change": 362
    },
    "Pt1000": {
      "label": "Pt1000",
      "price": 9862
    },
    "Pt950": {
      "label": "Pt950",
      "price": 9320
    },
    "Pt900": {
      "label": "Pt900",
      "price": 10128
    },
    "Pt850": {
      "label": "Pt850",
      "price": 9712
    },
    "SV1000IG": {
      "label": "SV1000 IG",
      "price": 362.45,
      "change": 15.29
    },
    "SV1000": {
      "label": "SV1000",
      "price": 350.49
    },
    "SV925": {
      "label": "SV925",
      "price": 316.42
    },
    "SV": {
      "label": "SV",
      "price": 293.58
    }
  }
};
/* =========================================================
   金相場：本日の買取価格表（GAS自動更新のgold.jsonを表示）
========================================================= */
let goldData = DEFAULT_GOLD;

async function loadGold(){
  try{
    const r = await fetch((window.SITE_BASE||"") + "data/gold.json?t=" + Date.now(), {cache:"no-store"});
    if(r.ok) goldData = await r.json();
  }catch(e){ /* ローカル閲覧時はフォールバック */ }
  renderGold();
}

function renderGold(){
  document.getElementById("goldUpdated").textContent = (goldData.updated||"") + " 更新";
  document.getElementById("goldSource").textContent = "※価格は1gあたり・税込。実際の買取価格はお品物の状態により変動します。";
  const box = document.getElementById("goldCols");
  const esc = t => String(t==null?"":t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmt = (n,d) => Number(n).toLocaleString("ja-JP",{minimumFractionDigits:d||0,maximumFractionDigits:d||0});
  /* 旧形式（metals のみ）のJSONが来た場合も1列で表示できるよう変換 */
  const groups = goldData.groups || [{title:"貴金属", en:"PRICE", digits:0, ig:null,
    items:Object.values(goldData.metals||{}).map(m=>({label:m.label, price:m.price}))}];
  const head = g => `<div class="gc-head"><h3>${esc(g.title)}</h3><span class="en">${esc(g.en||"")}</span></div>`;
  const igCard = g => {
    const d = g.digits||0, c = g.ig.change;
    const cls = c==null ? "flat" : c>0 ? "up" : c<0 ? "down" : "flat";
    const ctext = c==null ? "—" : c==0 ? "±0円" : (c>0?"+":"−") + fmt(Math.abs(c),d) + "円";
    return `<div class="gold-col gc-igcard">
      ${head(g)}
      <div class="gc-ig">
        <div class="lb">${esc(g.ig.label)}<small>${esc(g.ig.sub||"")}</small></div>
        <div class="pr">¥${fmt(g.ig.price,d)}<small>/ g</small></div>
        <div class="chg ${cls}">前日比 <b>${ctext}</b></div>
      </div>
    </div>`;
  };
  const table = g => {
    const d = g.digits||0;
    const rows = (g.items||[]).map(it => `<tr><th>${esc(it.label)}</th><td class="price">¥${fmt(it.price,d)}</td><td class="unit">/ g</td></tr>`).join("");
    return `<div class="gc-sec">${head(g)}<table class="metal"><tbody>${rows}</tbody></table></div>`;
  };
  /* 上段：各金種のIG（前日比つき）を3列 ／ 下段：左＝金、右＝プラチナ＋シルバーの2列 */
  const igs = groups.filter(g => g.ig);
  const first = groups[0], rest = groups.slice(1);
  box.innerHTML =
    (igs.length ? `<div class="gold-igs" style="--n:${igs.length}">${igs.map(igCard).join("")}</div>` : "") +
    `<div class="gold-tables${rest.length ? "" : " single"}">
      <div class="gold-col">${table(first)}</div>
      ${rest.length ? `<div class="gold-col">${rest.map(table).join("")}</div>` : ""}
    </div>`;
}

