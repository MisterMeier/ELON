// Elo animiert (23.10.2026): das ORIGINAL-Elo-Bild wird bewegt, nichts ist neu gezeichnet.
// Ebenen: Grundbild (elo-standard), Lider zum Blinzeln, Winken-Pose (elo-hallo) zum Überblenden.
// Nur transform/opacity, damit es auf dem iPad flüssig läuft. Bei „Bewegung reduzieren“ nur ein kurzes Aufleuchten.
// Gleiche Klassen wie die Bild-Elo in app.html (life-blink, fx-wave, fx-hop). Rückfallebene: das normale Bild.
(function(){
  if(window.EloSvg)return;
  const DIR=(document.currentScript&&document.currentScript.src||'').replace(/[^/]*$/,'');
  const CSS=`
.elo-an{position:relative;display:block;width:100%;aspect-ratio:1;contain:layout}
.elo-an .ea-fig,.elo-an .ea-wave{position:absolute;inset:0;transform-origin:50% 96%}
.elo-an img{width:100%;height:100%;display:block}
.elo-an .ea-wave{opacity:0}
.elo-an .ea-shadow{position:absolute;left:28%;right:28%;bottom:1%;height:3%;border-radius:50%;background:#18203d;opacity:.12;transform-origin:center}
.elo-an .ea-lid{position:absolute;aspect-ratio:1/1.05;border-radius:50%;background:radial-gradient(circle at 50% 30%,#f6f7ff,#e4e8fa);transform:scaleY(0);transform-origin:50% 0;box-shadow:0 .5px 0 #8fa0e0}
.es-blink .ea-lid,.life-blink .ea-lid{animation:eaBlink .22s ease-in-out}
.es-wave .ea-fig{animation:eaOut 1.9s ease-in-out}
.es-wave .ea-wave{animation:eaIn 1.9s ease-in-out}
.fx-wave .ea-fig{animation:eaOut 1.9s ease-in-out}.fx-wave .ea-wave{animation:eaIn 1.9s ease-in-out}
.es-hop .ea-fig,.es-hop .ea-wave{animation:eaHop .66s cubic-bezier(.34,1.3,.64,1) 2}
.es-hop .ea-shadow{animation:eaSh .66s ease-in-out 2}
.es-hop::after{content:"";position:absolute;inset:-6%;border-radius:50%;background:radial-gradient(closest-side,rgba(31,143,93,.22),transparent);opacity:0;animation:eaGlow 1.4s ease-out;pointer-events:none}
@keyframes eaBlink{0%,100%{transform:scaleY(0)}45%,55%{transform:scaleY(1)}}
@keyframes eaOut{0%,100%{opacity:1}12%,88%{opacity:0}}
@keyframes eaIn{0%,100%{opacity:0;transform:none}12%,88%{opacity:1}24%{transform:rotate(-3deg)}40%{transform:rotate(3deg)}56%{transform:rotate(-3deg)}72%{transform:rotate(3deg)}}
@keyframes eaHop{0%,100%{transform:none}16%{transform:scale(1.05,.93)}48%{transform:translateY(-14%) scale(.97,1.05)}80%{transform:scale(1.05,.94)}}
@keyframes eaSh{50%{transform:scale(.6);opacity:.06}}
@keyframes eaGlow{0%,100%{opacity:0}30%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .es-wave .ea-fig,.es-wave .ea-wave,.fx-wave .ea-fig,.fx-wave .ea-wave,.es-hop .ea-fig,.es-hop .ea-wave,.es-hop .ea-shadow{animation:none}
}`;
  // Augen des Standard-Bildes (Mitte x/y, Breite in % der Bildbreite)
  const EYES=[[41.4,27.8,14],[64.5,32.8,13.6]];
  const HTML=`<span class="ea-shadow"></span><span class="ea-fig"><img src="${DIR}elo-standard-512.webp" alt="Elo, die Eule" draggable="false">${EYES.map(([x,y,w])=>`<i class="ea-lid" style="left:${x-w/2}%;top:${y-w/2}%;width:${w}%"></i>`).join('')}</span><span class="ea-wave"><img src="${DIR}elo-hallo-real-512.webp" alt="" draggable="false"></span>`;
  function css(){if(document.getElementById('elo-an-css'))return;const st=document.createElement('style');st.id='elo-an-css';st.textContent=CSS;document.head.appendChild(st)}
  function play(el,cls,ms){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);clearTimeout(el['_t'+cls]);el['_t'+cls]=setTimeout(()=>el.classList.remove(cls),ms)}
  const reduced=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  window.EloSvg={
    mount(el){try{if(!el)return false;css();el.classList.add('elo-an');el.innerHTML=HTML;return true}catch(e){return false}},
    blink:el=>play(el,'es-blink',260),
    wave:el=>play(el,'es-wave',1950),
    hop:el=>play(el,'es-hop',1450),
    life(el){let on=true;const self=this,tick=()=>{if(!on)return;if(!/es-(wave|hop)/.test(el.className)){Math.random()<.85||reduced()?self.blink(el):self.wave(el)}setTimeout(tick,2600+Math.random()*3400)};setTimeout(tick,1500);return()=>{on=false}}
  };
})();
