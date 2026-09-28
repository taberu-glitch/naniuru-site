/* =========================================================
   ナニウル｜商品ページ共通スクリプト
   ---------------------------------------------------------
   各ページの <script> で window.ITEM = { label, cats:[…], tags:[…] } を指定。
   data/posts.js の買取実績（POSTS）から、そのカテゴリの記事だけを
   スライダーに表示し、クリックでブログ記事へ遷移します。
   cats … CMSの「カテゴリ」名（どれかに一致すれば表示）
   tags … CMSの「タグ」名（カテゴリに関係なく、一致すれば表示）
========================================================= */
(function(){
  const BASE = window.SITE_BASE || "";
  const ITEM = window.ITEM || {cats:[], tags:[]};
  const esc = t => String(t==null?"":t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const yen = n => Number(n).toLocaleString("ja-JP");
  /* posts.js 内の画像パスはサイト直下基準なので、サブフォルダ用に補正 */
  const fixPath = u => !u ? "" : /^(https?:|data:|\/)/.test(u) ? u : BASE + u;
  const isLive = p => !p.publishAt || new Date(String(p.publishAt).replace(" ","T")) <= new Date();

  /* ---------- 買取実績スライダー（この商品カテゴリのみ） ---------- */
  function renderResults(){
    const slider = document.getElementById("resSlider");
    const outer  = document.getElementById("resOuter");
    const empty  = document.getElementById("resEmpty");
    if(!slider) return;
    const posts = (typeof POSTS !== "undefined" ? POSTS : [])
      .filter(isLive)
      .filter(p => (ITEM.cats||[]).includes(p.cat) || ((ITEM.tags||[]).length && (ITEM.tags||[]).includes(p.tag)))
      .sort((a,b) => String(b.date||"").localeCompare(String(a.date||"")));

    if(!posts.length){
      outer.hidden = true;
      empty.hidden = false;
      return;
    }
    posts.forEach(p=>{
      const img = (p.images&&p.images[0]) ? fixPath(p.images[0]) : "";
      const fb  = fixPath(p.imageFallback||"");
      const a = document.createElement("a");
      a.className = "res-card";
      a.href = `${BASE}blog.html?post=${encodeURIComponent(p.slug)}`;
      a.innerHTML = `
        <div class="res-img">
          <div class="res-tags"><span>${esc(p.method)}</span><span>${esc(p.area)}</span></div>
          ${img?`<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.onerror=null;if(this.dataset.fb)this.src=this.dataset.fb" data-fb="${esc(fb)}">`:`<span class="ph">${esc(p.tag||p.cat)}</span>`}
        </div>
        <div class="res-body">
          <h3>${esc(p.name)}</h3>
          <div class="res-price">買取実績<b>¥${yen(p.price||0)}</b></div>
          <p>${esc(p.excerpt)}</p>
          <span class="res-link">買取ブログを読む</span>
        </div>`;
      slider.appendChild(a);
    });
    const stepPx = () => (slider.querySelector(".res-card")?.offsetWidth || 340) + 24;
    document.getElementById("resPrev").addEventListener("click",()=>slider.scrollBy({left:-stepPx(),behavior:"smooth"}));
    document.getElementById("resNext").addEventListener("click",()=>slider.scrollBy({left:stepPx(),behavior:"smooth"}));
    /* 1枚しかない時は矢印を隠す */
    if(posts.length < 2) document.querySelectorAll(".res-nav").forEach(b=>b.style.display="none");
  }

  /* ---------- おすすめ記事（この品目のブログ記事：お役立ち記事＋買取実績） ---------- */
  function renderRecommended(){
    const grid = document.getElementById("recGrid");
    if(!grid) return;
    const cats = ITEM.cats||[];
    const mark = (arr,type) => (arr||[]).filter(isLive).map(p=>({...p,_type:type}));
    const all = [
      ...mark(typeof COLUMNS !== "undefined" ? COLUMNS : [], "column"),
      ...mark(typeof POSTS   !== "undefined" ? POSTS   : [], "result")
    ];
    const byDate = (a,b) => String(b.date||"").localeCompare(String(a.date||""));
    /* お役立ち記事を優先し、次に買取実績（それぞれ新しい順）で最大6件 */
    let list = [
      ...all.filter(p=>p._type==="column" && cats.includes(p.cat)).sort(byDate),
      ...all.filter(p=>p._type==="result" && cats.includes(p.cat)).sort(byDate)
    ].slice(0,6);
    const more = document.getElementById("recMore");
    if(list.length){
      if(more && cats.length===1) more.href = `${BASE}blog.html?cat=${encodeURIComponent(cats[0])}`;
    }else{
      /* この品目の記事がまだ無い場合は、新着記事を表示 */
      list = all.sort(byDate).slice(0,3);
      const t = document.getElementById("recTitle");
      if(t) t.textContent = "新着のブログ記事";
    }
    grid.innerHTML = list.map(p=>{
      const img = (p.images&&p.images[0]) ? fixPath(p.images[0]) : "";
      const fb  = fixPath(p.imageFallback||"");
      return `<a class="rec-card" href="${BASE}blog.html?post=${encodeURIComponent(p.slug)}">
        <div class="rec-img">${img?`<img src="${esc(img)}" alt="" loading="lazy" onerror="this.onerror=null;if(this.dataset.fb)this.src=this.dataset.fb" data-fb="${esc(fb)}">`:`<span class="ph">${esc(p.tag||p.cat||"BLOG")}</span>`}</div>
        <div class="rec-body">
          <div class="rec-meta"><span class="rec-type">${p._type==="column"?"お役立ち情報":"買取実績"}</span><time>${esc(p.date)}</time></div>
          <h3>${esc(p.title||p.name)}</h3>
        </div>
      </a>`;
    }).join("");
  }

  /* ---------- スクロールリビール／モバイルメニュー ---------- */
  function ui(){
    const io = new IntersectionObserver(es=>{
      es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target);} });
    },{threshold:.12});
    document.querySelectorAll(".reveal").forEach(el=>io.observe(el));
    document.getElementById("menuToggle").addEventListener("click",()=>{
      document.getElementById("gnav").classList.toggle("open");
    });
    document.querySelectorAll("nav.gnav>ul>li.has-mega").forEach(li=>{
      li.addEventListener("click",e=>{
        if(window.innerWidth<=960 && e.target===li.querySelector(":scope>a")){
          e.preventDefault(); li.classList.toggle("opened");
        }
      });
    });
  }

  renderResults();
  renderRecommended();
  ui();
  if(typeof loadGold === "function") loadGold();
})();
