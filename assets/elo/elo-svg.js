// Elo als zerlegtes SVG (Prototyp, 23.10.2026): Körper, Augen mit Lidern, rechter Flügel als Arm.
// Nur CSS-Animationen auf transform/opacity, damit es auf dem iPad flüssig läuft. Keine fremden Bibliotheken.
// Nutzt dieselben Klassen wie die Bild-Elo in app.html (.sl-elo mit life-blink, fx-wave, fx-hop),
// damit eloLife() und die Tafel-Steuerung später ohne Umbau funktionieren. Das Elo-Bild bleibt die Rückfallebene.
(function(){
  if(window.EloSvg)return;
  const CSS=`
.elo-svg{display:block;width:100%;height:auto;overflow:visible}
.elo-svg .es-fig{transform-box:view-box;transform-origin:100px 212px}
.elo-svg .es-shadow{transform-box:fill-box;transform-origin:center}
.elo-svg .es-lid{transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0)}
.elo-svg .es-arm{transform-box:view-box;transform-origin:152px 128px}
.elo-svg .es-glow{opacity:0}
.es-blink .es-lid,.life-blink .elo-svg .es-lid{animation:esBlink .24s ease-in-out}
.es-wave .es-arm,.fx-wave .elo-svg .es-arm{animation:esWave 1.4s cubic-bezier(.4,0,.2,1)}
.es-hop .es-fig{animation:esHop .62s cubic-bezier(.34,1.56,.64,1) 2}
.es-hop .es-shadow{animation:esShadow .62s ease-in-out 2}
@keyframes esBlink{0%,100%{transform:scaleY(0)}45%,55%{transform:scaleY(1)}}
@keyframes esWave{0%,100%{transform:rotate(0)}22%{transform:rotate(-118deg)}40%{transform:rotate(-96deg)}58%{transform:rotate(-122deg)}76%{transform:rotate(-100deg)}}
@keyframes esHop{0%,100%{transform:none}18%{transform:scale(1.04,.94)}50%{transform:translateY(-16%) scale(.97,1.04)}82%{transform:scale(1.05,.94)}}
@keyframes esShadow{50%{transform:scale(.6);opacity:.35}}
@keyframes esGlow{0%,100%{opacity:0}35%,65%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .es-wave .es-arm,.fx-wave .elo-svg .es-arm,.es-hop .es-fig,.es-hop .es-shadow{animation:none}
  .es-hop .es-glow,.es-wave .es-glow{animation:esGlow 1.2s ease-in-out}
}`;
  const SVG=`<svg class="elo-svg" viewBox="0 0 200 224" role="img" aria-label="Elo, die Eule">
<defs>
<linearGradient id="esBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8ff2"/><stop offset=".6" stop-color="#4d63da"/><stop offset="1" stop-color="#6a4fcf"/></linearGradient>
<linearGradient id="esWing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fa6f6"/><stop offset="1" stop-color="#5a46c8"/></linearGradient>
<radialGradient id="esIris" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#5aa2ff"/><stop offset="1" stop-color="#1f4fc4"/></radialGradient>
</defs>
<ellipse class="es-glow" cx="100" cy="120" rx="96" ry="100" fill="#1f8f5d" fill-opacity=".16"/>
<ellipse class="es-shadow" cx="100" cy="214" rx="46" ry="6" fill="#18203d" opacity=".14"/>
<g class="es-fig">
 <g class="es-body">
  <path d="M46 40 L40 8 L72 30 Z" fill="#5568dc"/><path d="M154 40 L160 8 L128 30 Z" fill="#5568dc"/>
  <path d="M100 22 C150 22 168 62 166 108 C164 160 140 204 100 204 C60 204 36 160 34 108 C32 62 50 22 100 22 Z" fill="url(#esBody)"/>
  <path d="M100 52 C112 38 150 38 156 74 C160 104 136 118 112 112 L100 120 L88 112 C64 118 40 104 44 74 C50 38 88 38 100 52 Z" fill="#f4f6ff"/>
  <ellipse cx="100" cy="158" rx="42" ry="42" fill="#eef1fd"/>
  <path d="M80 146 q6 6 12 0 M108 146 q6 6 12 0 M90 164 q6 6 12 0 M72 164 q5 5 10 0 M118 164 q5 5 10 0 M98 182 q6 6 12 0 M84 182 q5 5 10 0" fill="none" stroke="#cdd4f3" stroke-width="2" stroke-linecap="round"/>
  <path d="M38 104 C24 132 30 176 56 194 C62 168 62 134 52 112 Z" fill="url(#esWing)"/>
  <path d="M78 200 q-6 8 -10 14 M84 201 v14 M90 200 q6 8 10 14 M110 200 q-6 8 -10 14 M116 201 v14 M122 200 q6 8 10 14" fill="none" stroke="#f0a23a" stroke-width="5" stroke-linecap="round"/>
  <path d="M60 46 C72 36 90 40 98 52 M140 46 C128 36 110 40 102 52" fill="none" stroke="#4a5fd6" stroke-width="5" stroke-linecap="round"/>
 </g>
 <g class="es-eyes">
  <circle cx="76" cy="80" r="21" fill="#fff"/><circle cx="124" cy="80" r="21" fill="#fff"/>
  <circle cx="78" cy="82" r="14" fill="url(#esIris)"/><circle cx="122" cy="82" r="14" fill="url(#esIris)"/>
  <circle cx="79" cy="83" r="7" fill="#101a4a"/><circle cx="121" cy="83" r="7" fill="#101a4a"/>
  <circle cx="83" cy="77" r="3.5" fill="#fff"/><circle cx="125" cy="77" r="3.5" fill="#fff"/>
  <path class="es-lid" d="M55 80 a21 21 0 0 1 42 0 a21 21 0 0 1 -42 0 Z" fill="#6f8ff2" stroke="#3a4cc0" stroke-width="2"/>
  <path class="es-lid" d="M103 80 a21 21 0 0 1 42 0 a21 21 0 0 1 -42 0 Z" fill="#6f8ff2" stroke="#3a4cc0" stroke-width="2"/>
 </g>
 <path d="M92 98 L108 98 L100 114 Z" fill="#f0a23a" stroke="#d9861f" stroke-width="2" stroke-linejoin="round"/>
 <g class="es-arm"><path d="M162 104 C176 132 170 176 144 194 C138 168 138 134 148 112 Z" fill="url(#esWing)"/></g>
</g>
</svg>`;
  function css(){if(document.getElementById('elo-svg-css'))return;const st=document.createElement('style');st.id='elo-svg-css';st.textContent=CSS;document.head.appendChild(st)}
  // Klasse kurz setzen und wieder entfernen; läuft dieselbe Animation schon, wird sie neu gestartet
  function play(el,cls,ms){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);clearTimeout(el['_t'+cls]);el['_t'+cls]=setTimeout(()=>el.classList.remove(cls),ms)}
  const reduced=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  window.EloSvg={
    // Ersetzt den Inhalt von el durch die SVG-Elo. Klappt das nicht, bleibt das vorhandene Elo-Bild stehen.
    mount(el){try{if(!el||!window.SVGElement)return false;css();el.innerHTML=SVG;return true}catch(e){return false}},
    blink:el=>play(el,'es-blink',260),
    wave:el=>play(el,'es-wave',1450),
    hop:el=>play(el,'es-hop',1300),// richtige Antwort
    // Ruhiges Eigenleben: ab und zu blinzeln, selten winken. Bei „Bewegung reduzieren“ nur blinzeln.
    life(el){let on=true;const tick=()=>{if(!on)return;if(!el.className.match(/es-(wave|hop)/)){Math.random()<.85||reduced()?this.blink(el):this.wave(el)}setTimeout(tick,2600+Math.random()*3400)};setTimeout(tick,1500);return()=>{on=false}}
  };
})();
