/* =========================================================
   ページ内リンク（#line など）の着地位置を補正
   - 固定ヘッダーの高さ分だけ余白を取る（見出しがヘッダーに隠れない）
   - 他ページから index.html#line などで来たとき、金相場・レビュー・
     買取実績などの後読み込みで位置がずれるため、読み込みが落ち着くまで
     目的の位置に合わせ直す（ユーザーが自分でスクロールしたら止める）
========================================================= */
(function(){
  var root = document.documentElement;
  function headerH(){
    var h = document.querySelector("header.site");
    return h ? Math.ceil(h.getBoundingClientRect().height) : 0;
  }
  function setPad(){ root.style.scrollPaddingTop = (headerH() + 8) + "px"; }
  function target(){
    var id = location.hash.slice(1);
    if(!id) return null;
    try{ id = decodeURIComponent(id); }catch(e){}
    return document.getElementById(id);
  }
  function align(){
    var t = target();
    if(!t) return;
    /* フェードイン（.reveal の translateY）の影響を受けないよう、offsetTop で位置を取る */
    var top = 0, el = t;
    while(el){ top += el.offsetTop; el = el.offsetParent; }
    var y = top - headerH() - 8;
    if(Math.abs(window.pageYOffset - y) > 2) window.scrollTo(0, Math.max(0, y));
  }

  setPad();
  window.addEventListener("resize", setPad);
  /* 同じページ内のリンクも、ずれなく目的の位置に止める */
  document.addEventListener("click", function(e){
    var a = e.target.closest && e.target.closest("a[href*='#']");
    if(!a || a.pathname !== location.pathname || a.hash.length < 2) return;
    setTimeout(align, 0);
  });
  window.addEventListener("hashchange", function(){ setTimeout(align, 0); });

  if(!location.hash || location.hash.length < 2) return;
  if("scrollRestoration" in history) history.scrollRestoration = "manual";

  var stopped = false;
  function stop(){ stopped = true; if(ro) ro.disconnect(); }
  ["wheel","touchstart","keydown","mousedown"].forEach(function(ev){
    window.addEventListener(ev, stop, {passive:true, once:true});
  });

  var ro = ("ResizeObserver" in window) ? new ResizeObserver(function(){
    if(!stopped){ setPad(); align(); }
  }) : null;
  function start(){
    if(ro) ro.observe(document.body);
    align();
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  window.addEventListener("load", function(){ if(!stopped){ setPad(); align(); } });
  setTimeout(function(){ if(!stopped) align(); stop(); }, 6000);
})();
