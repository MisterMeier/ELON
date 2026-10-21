/* ELIO Skizzenbuch: Zeichen-App für den Kunstunterricht (iPad mit Apple Pencil, Tafel, Rechner).
   Eigenständiges Modul, wird von app.html erst geladen, wenn jemand das Skizzenbuch öffnet.
   Alles bleibt auf dem Gerät (IndexedDB 'elio-skizze'). Nur was das Kind selbst „an die Lehrkraft schickt“, verlässt das iPad.
   Aufbau: Speicher · Pinsel · Editor (Ebenen, Ansicht, Eingabe, Werkzeuge, Rückgängig, Speichern) · Skizzenbuch-Übersicht · mount() */
(function(){
'use strict';
const D=document,W=window;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MIN_STROKES=5;// so viele Striche braucht eine Skizze, damit sie im Auftrag als „angelegt“ zählt
const MAX_LAYERS=8;
const HIST_BYTES=150e6,HIST_MAX=60;

/* ---------- Speicher (IndexedDB) ---------- */
let DBP=null;
function db(){return DBP||(DBP=new Promise((res,rej)=>{const r=indexedDB.open('elio-skizze',1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('pages'))d.createObjectStore('pages',{keyPath:'id'});if(!d.objectStoreNames.contains('px'))d.createObjectStore('px')};
  r.onsuccess=()=>res(r.result);r.onerror=()=>{DBP=null;rej(r.error)}}))}
async function run(stores,mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(stores,mode);let out;try{out=fn(t)}catch(e){rej(e);return}
  t.oncomplete=()=>res(out&&'result' in out?out.result:out);t.onerror=t.onabort=()=>rej(t.error||new Error('IndexedDB'))})}
const pagesOf=async owner=>(await run('pages','readonly',t=>t.objectStore('pages').getAll())||[]).filter(p=>p.owner===owner).sort((a,b)=>b.updated-a.updated);
const pageGet=id=>run('pages','readonly',t=>t.objectStore('pages').get(id));
const pxGet=key=>run('px','readonly',t=>t.objectStore('px').get(key));
async function pageDel(p){await run(['pages','px'],'readwrite',t=>{t.objectStore('pages').delete(p.id);(p.layers||[]).forEach(l=>t.objectStore('px').delete(p.id+'/'+l.id))})}
const toBlob=(cv,type='image/png',q)=>new Promise((res,rej)=>{try{cv.toBlob(b=>b?res(b):rej(new Error('toBlob')),type,q)}catch(e){rej(e)}});
async function blobImg(b){if(W.createImageBitmap)try{return await createImageBitmap(b)}catch(e){}
  return new Promise((res,rej)=>{const u=URL.createObjectURL(b),i=new Image();i.onload=()=>{res(i);setTimeout(()=>URL.revokeObjectURL(u),1000)};i.onerror=rej;i.src=u})}
function mkCanvas(w,h){const c=D.createElement('canvas');c.width=w;c.height=h;return c}
const ctx2=(c,rf)=>c.getContext('2d',rf?{willReadFrequently:true}:undefined);
const freeCanvas=c=>{if(c){c.width=1;c.height=1}};// Safari gibt Leinwand-Speicher sonst spät frei

/* ---------- Pinsel ---------- */
// size: 0..1 aus dem Regler → Pixel auf dem Blatt. sz/fl: Druck → Größe/Deckung. type: path = glatte Linie, grain = mit Papierkorn, tip = weiche Spitze
const BR={
  bleistift:{name:'Bleistift',type:'grain',grain:'fein',min:1.4,max:18,def:.22,sp:.14,sz:p=>.55+.45*p,fl:p=>.07+.6*p,tilt:1,smooth:.25,hint:'Fest drücken = dunkler. Stift schräg halten = schattieren.'},
  tusche:{name:'Tusche',type:'path',min:2,max:90,def:.22,sz:p=>.07+.93*Math.pow(p,1.1),smooth:.5,taper:1,hint:'Leicht = fein, fest = breit. Wie ein echter Tuschepinsel.'},
  fineliner:{name:'Fineliner',type:'path',min:1,max:26,def:.2,sz:p=>.9+.1*p,smooth:.45,hint:'Gleichmäßige Linie, gut für Umrisse.'},
  gouache:{name:'Deckfarbe',type:'tip',tip:'borste',min:4,max:150,def:.32,sp:.07,sz:p=>.55+.45*p,fl:p=>.22+.55*p,smooth:.35,hint:'Deckende Farbe mit Pinselstruktur.'},
  aquarell:{name:'Aquarell',type:'tip',tip:'nass',min:10,max:260,def:.38,sp:.05,sz:p=>.6+.4*p,fl:p=>.05+.14*p,op:.9,blend:'multiply',smooth:.4,hint:'Lasierend: Farben mischen sich, wenn du übermalst.'},
  kohle:{name:'Kohle',type:'grain',grain:'grob',min:6,max:110,def:.3,sp:.1,sz:p=>.6+.4*p,fl:p=>.12+.5*p,tilt:1,smooth:.2,hint:'Rau und körnig. Schräg halten für Flächen.'},
  kreide:{name:'Kreide',type:'grain',grain:'grob',min:6,max:80,def:.3,sp:.1,sz:p=>.78+.22*p,fl:p=>.35+.6*p,smooth:.2,hint:'Wie Ölkreide auf rauem Papier.'},
  airbrush:{name:'Sprühen',type:'tip',tip:'weich',min:20,max:380,def:.3,sp:.05,sz:()=>1,fl:p=>.015+.08*p,smooth:.3,hint:'Weicher Farbnebel für Übergänge und Schatten.'},
  filzstift:{name:'Filzstift',type:'path',min:3,max:40,def:.3,sz:p=>.85+.15*p,op:.92,blend:'multiply',smooth:.45,hint:'Kräftig und etwas durchscheinend. Übermalen macht dunkler.'},
  kugel:{name:'Kugelschreiber',type:'path',min:.8,max:9,def:.35,sz:p=>.7+.3*p,smooth:.35,hint:'Dünn und gleichmäßig. Gut für Schraffuren.'},
  feder:{name:'Kalligrafie',type:'path',cap:'nib',min:3,max:70,def:.3,sz:p=>.45+.55*p,smooth:.5,hint:'Breite Feder: dick und dünn je nach Richtung.'},
  buntstift:{name:'Buntstift',type:'grain',grain:'fein',min:2,max:30,def:.3,sp:.12,sz:p=>.75+.25*p,fl:p=>.22+.7*p,tilt:1,smooth:.25,hint:'Wie ein Holzbuntstift. Schichten macht die Farbe satter.'},
  oel:{name:'Ölfarbe',type:'tip',tip:'borste',min:6,max:180,def:.35,sp:.05,sz:p=>.6+.4*p,fl:p=>.6+.4*p,smooth:.35,hint:'Dick und deckend mit Borstenspuren. Mit „Wischen“ vermalen.'},
  spritzer:{name:'Spritzer',type:'splat',min:20,max:300,def:.35,sp:.35,sz:()=>1,fl:p=>.4+.6*p,smooth:.2,hint:'Farbspritzer wie mit der Zahnbürste.'},
  marker:{name:'Textmarker',type:'path',cap:'chisel',min:10,max:70,def:.4,sz:()=>1,op:.45,blend:'multiply',smooth:.6,hint:'Durchscheinend. Mehrere Striche färben nicht dunkler.'},
  radierer:{name:'Radierer',type:'erase',min:4,max:240,def:.25,sz:p=>.55+.45*p,smooth:.3,hint:'Hart, weich oder körnig: unten in der Leiste.'},
  wischen:{name:'Wischen',type:'smudge',min:6,max:220,def:.3,sp:.1,sz:p=>.6+.4*p,fl:p=>.35+.6*p,smooth:.3,hint:'Verwischt Farben wie mit dem Finger.'},
};
const PINSEL=['tusche','fineliner','filzstift','kugel','feder','buntstift','gouache','oel','aquarell','kohle','kreide','airbrush','spritzer'];
const PINSEL_GR=[['Zeichnen',['tusche','fineliner','filzstift','kugel','feder','buntstift']],['Malen',['gouache','oel','aquarell','kohle','kreide']],['Effekte',['airbrush','spritzer']]];
const sizePx=(b,s)=>b.min+(b.max-b.min)*s*s;
// Papierkorn: Muster bleibt am Blatt fest, darum wirkt Bleistift wie auf echtem Papier
const GRAIN={};
function grainCanvas(kind){if(GRAIN[kind])return GRAIN[kind];const n=kind==='grob'?192:128,c=mkCanvas(n,n),x=ctx2(c),id=x.createImageData(n,n),d=id.data;
  let s=kind==='grob'?7:3;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};
  if(kind==='grob'){// grobe Körnung: Flecken
    const v=new Float32Array(n*n);for(let k=0;k<n*n*.06;k++){const cx=rnd()*n,cy=rnd()*n,r=1+rnd()*2.6;for(let yy=-3;yy<=3;yy++)for(let xx=-3;xx<=3;xx++){const dd=Math.hypot(xx,yy);if(dd>r)continue;const X=((Math.floor(cx)+xx)%n+n)%n,Y=((Math.floor(cy)+yy)%n+n)%n;v[Y*n+X]=Math.max(v[Y*n+X],1-dd/r*.6)}}
    for(let i=0;i<n*n;i++){const a=clamp(.18+v[i]*.9-rnd()*.25,0,1);d[i*4+3]=a*255}}
  else for(let i=0;i<n*n;i++){const a=clamp(.42+rnd()*.75-(rnd()<.12?.45:0),0,1);d[i*4+3]=a*255}
  for(let i=0;i<n*n;i++){d[i*4]=d[i*4+1]=d[i*4+2]=0}x.putImageData(id,0,0);return GRAIN[kind]=c}
const TIPC={};
function tipCanvas(kind,color){const k=kind+color;if(TIPC[k])return TIPC[k];const n=128,c=mkCanvas(n,n),x=ctx2(c);
  if(kind==='weich'||kind==='nass'){const g=x.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);
    if(kind==='nass'){g.addColorStop(0,color);g.addColorStop(.72,color);g.addColorStop(.9,hexA(color,.55));g.addColorStop(1,hexA(color,0))}
    else{g.addColorStop(0,color);g.addColorStop(.35,hexA(color,.6));g.addColorStop(1,hexA(color,0))}x.fillStyle=g;x.fillRect(0,0,n,n)}
  else{// Borste: viele feine Haare
    let s=11;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};x.fillStyle=color;
    for(let i=0;i<900;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*n*.47;x.globalAlpha=.25+rnd()*.6;x.beginPath();x.arc(n/2+Math.cos(a)*r,n/2+Math.sin(a)*r,1.5+rnd()*3.2,0,7);x.fill()}}
  const ks=Object.keys(TIPC);if(ks.length>24)delete TIPC[ks[0]];return TIPC[k]=c}
function grainPattern(ctx,kind,color){const g=grainCanvas(kind),c=mkCanvas(g.width,g.height),x=ctx2(c);x.drawImage(g,0,0);x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,c.width,c.height);
  const p=ctx.createPattern(c,'repeat');return p}
function hexA(h,a){const n=parseInt(h.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`}
const hex2rgb=h=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255]};
const rgb2hex=(r,g,b)=>'#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
function hsv2rgb(h,s,v){const f=n=>{const k=(n+h/60)%6;return v-v*s*Math.max(0,Math.min(k,4-k,1))};return [f(5)*255,f(3)*255,f(1)*255]}
function rgb2hsv(r,g,b){r/=255;g/=255;b/=255;const M=Math.max(r,g,b),m=Math.min(r,g,b),d=M-m;let h=0;if(d){h=M===r?((g-b)/d)%6:M===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360}return [h,M?d/M:0,M]}

/* ---------- Farben, Papiere, Formate ---------- */
// Farbkreis nach Itten (12 Teile) + Erdtöne + Grautöne: passt zu dem, was im Kunstunterricht besprochen wird
const ITTEN=['#f4e403','#f9bd00','#f39200','#e95c0c','#e2001a','#b5006b','#6d2a83','#3a3a8f','#1f6fb5','#0094c8','#009a5a','#86bc25'];
const ERDE=['#f3e4c8','#e0b77f','#c68642','#9c5b2e','#6b3a1e','#3d2314'];
const GRAU=['#ffffff','#d9d9de','#a6a8b0','#6c6f7a','#3a3d47','#121318'];
const HAUT=['#fde3cf','#f1c4a0','#d99a6c','#a86b45','#7a4a2e','#4a2c1c'];
const PAPER=[['#ffffff','Weiß'],['#fbf5e6','Zeichenkarton'],['#e8e9ee','Grau'],['#d8c19a','Packpapier'],['#24272f','Schwarz']];
const FORMAT=[['quer','Querformat',2048,1536],['hoch','Hochformat',1536,2048],['quad','Quadrat',1800,1800]];
const BLENDS=[['source-over','Normal'],['multiply','Multiplizieren'],['darken','Abdunkeln'],['color-burn','Farbig nachbelichten'],['screen','Negativ multiplizieren'],['lighten','Aufhellen'],['color-dodge','Farbig abwedeln'],['overlay','Überlagern'],['soft-light','Weiches Licht'],['hard-light','Hartes Licht'],['difference','Differenz'],['hue','Farbton'],['saturation','Sättigung'],['color','Farbe'],['luminosity','Luminanz']];
const cssBlend=b=>({'source-over':'normal'}[b]||b);

/* ---------- Symbole (eigene SVGs, keine Emojis) ---------- */
const P='fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const IC={
  back:`<path d="M15 5l-7 7 7 7" ${P}/>`,undo:`<path d="M9 14l-5-5 5-5" ${P}/><path d="M4 9h10a6 6 0 0 1 0 12h-3" ${P}/>`,redo:`<path d="M15 14l5-5-5-5" ${P}/><path d="M20 9H10a6 6 0 0 0 0 12h3" ${P}/>`,
  pinsel:`<path d="M14.5 3.5l6 6-8.2 8.2-6-6z" ${P}/><path d="M6.3 11.7c-2.6.3-3.6 2.4-3.8 4.8-.1 1.6-.9 2.7-1.5 3.3 3.4.6 7.4-.2 8.8-2.6" ${P}/>`,
  bleistift:`<path d="M4 20l1.2-4.6L16.6 4a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" ${P}/><path d="M14.5 6l3.5 3.5M4 20l4.6-1.2" ${P}/>`,
  radierer:`<path d="M8.5 20H20M4.6 15.2l9.8-9.8a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8L11.4 18.8a4 4 0 0 1-5.6 0l-1.2-1.2a1.7 1.7 0 0 1 0-2.4z" ${P}/><path d="M9 11l5 5" ${P}/>`,
  marker:`<path d="M9 15l-3 3v3h3l3-3" ${P}/><path d="M9 15l7.5-7.5 3 3L12 18z" ${P}/><path d="M15 6l2-2 3 3-2 2" ${P}/>`,
  fuellen:`<path d="M5 11l7-7 7 7-7 7z" ${P}/><path d="M5 11h14" ${P}/><path d="M20 15c1 1.6 1.5 2.6 1.5 3.3a1.5 1.5 0 0 1-3 0c0-.7.5-1.7 1.5-3.3z" fill="currentColor"/>`,
  form:`<rect x="3" y="11" width="9" height="9" rx="1" ${P}/><circle cx="16" cy="8" r="5" ${P}/>`,
  linie:`<path d="M4 20L20 4" ${P}/><circle cx="4" cy="20" r="1.8" fill="currentColor"/><circle cx="20" cy="4" r="1.8" fill="currentColor"/>`,
  auswahl:`<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" ${P}/><path d="M11 4h2M11 20h2M4 11v2M20 11v2" ${P}/>`,
  transform:`<path d="M12 3v18M3 12h18" ${P}/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" ${P}/>`,
  pipette:`<path d="M14 6l4 4M5 19l9.5-9.5M5 19l-1 1M5 19c-.8-1.4-.6-2.5.3-3.4" ${P}/><path d="M13 5.5l2-2a2.1 2.1 0 0 1 3 0l2.5 2.5a2.1 2.1 0 0 1 0 3l-2 2" ${P}/>`,
  text:`<path d="M5 6V4h14v2M12 4v16M9 20h6" ${P}/>`,
  wischen:`<path d="M9 21c-2.5-.5-4-2.6-4-5.2V9.5a1.5 1.5 0 0 1 3 0V13M8 12V4.5a1.5 1.5 0 0 1 3 0V11M11 10.5V3.5a1.5 1.5 0 0 1 3 0V11M14 10.5V5.5a1.5 1.5 0 0 1 3 0v8.8c0 3.7-2.2 6.7-6 6.7" ${P}/><path d="M17 20c1.5 0 2.5-.6 3.5-1.5M19 22c1 0 1.8-.4 2.5-1" ${P}/>`,
  adjust:`<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" ${P}/><circle cx="15" cy="6" r="2" ${P}/><circle cx="9" cy="12" r="2" ${P}/><circle cx="17" cy="18" r="2" ${P}/>`,
  verlauf:`<rect x="3" y="5" width="18" height="14" rx="2" ${P}/><path d="M7 5v14M11 5v14" ${P} stroke-dasharray="1.5 2.5"/><path d="M15 5v14" ${P} stroke-dasharray="1 4"/>`,
  eimer:`<path d="M5 11l7-7 7 7-7 7z" ${P}/><path d="M5 11h14" ${P}/>`,
  ref:`<rect x="3" y="3" width="12" height="12" rx="2" ${P}/><path d="M9 21h10a2 2 0 0 0 2-2V9" ${P}/><path d="M3 12l4-4 4 4" ${P}/>`,
  heart:`<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" ${P}/>`,
  mirror:`<path d="M12 3v18" ${P} stroke-dasharray="2 3"/><path d="M9 6H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4M15 6h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4" ${P}/>`,
  bild:`<rect x="3" y="4" width="18" height="16" rx="2" ${P}/><circle cx="9" cy="10" r="2" ${P}/><path d="M21 16l-5-5-8 9" ${P}/>`,
  ebenen:`<path d="M12 3l9 5-9 5-9-5z" ${P}/><path d="M3 13l9 5 9-5" ${P}/>`,export:`<path d="M12 3v12M7 8l5-5 5 5" ${P}/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" ${P}/>`,
  set:`<circle cx="12" cy="12" r="3" ${P}/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" ${P}/>`,
  full:`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" ${P}/>`,unfull:`<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" ${P}/>`,
  eye:`<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" ${P}/><circle cx="12" cy="12" r="3" ${P}/>`,eyeoff:`<path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.9 3.7M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1" ${P}/>`,
  lock:`<rect x="5" y="11" width="14" height="10" rx="2" ${P}/><path d="M8 11V7a4 4 0 0 1 8 0v4" ${P}/>`,plus:`<path d="M12 5v14M5 12h14" ${P}/>`,
  up:`<path d="M12 19V5M6 11l6-6 6 6" ${P}/>`,down:`<path d="M12 5v14M6 13l6 6 6-6" ${P}/>`,dup:`<rect x="8" y="8" width="12" height="12" rx="2" ${P}/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" ${P}/>`,
  merge:`<path d="M7 4v5a5 5 0 0 0 5 5 5 5 0 0 1 5 5v1M17 4v5a5 5 0 0 1-5 5" ${P}/>`,trash:`<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3" ${P}/>`,
  clear:`<path d="M5 5l14 14M19 5L5 19" ${P}/>`,flipH:`<path d="M12 3v18" ${P} stroke-dasharray="2 3"/><path d="M9 7L3 17h6zM15 7l6 10h-6z" ${P}/>`,flipV:`<path d="M3 12h18" ${P} stroke-dasharray="2 3"/><path d="M7 9L17 3v6zM7 15l10 6v-6z" ${P}/>`,
  check:`<path d="M5 12l5 5 9-10" ${P}/>`,x:`<path d="M6 6l12 12M18 6L6 18" ${P}/>`,send:`<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" ${P}/>`,img:`<rect x="3" y="4" width="18" height="16" rx="2" ${P}/><path d="M8 13l3 3 5-6" ${P}/>`,
  fit:`<rect x="5" y="7" width="14" height="10" rx="1" ${P}/><path d="M3 4h4M17 4h4M3 20h4M17 20h4" ${P}/>`,more:`<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>`,
  rect:`<rect x="4" y="6" width="16" height="12" rx="1" ${P}/>`,ellipse:`<ellipse cx="12" cy="12" rx="9" ry="6.5" ${P}/>`,tri:`<path d="M12 4l9 16H3z" ${P}/>`,lasso:`<path d="M7 17c-3-1.5-4-4-3-6.5C5.5 6 11 4 16 5s6 5 3.5 8c-2 2.5-7 3.5-11 3" ${P}/><path d="M7 17c0 2 1 3.5 3 4" ${P}/>`,
  stift:`<path d="M5 19l2-6 9-9 4 4-9 9z" ${P}/><path d="M14 6l4 4" ${P}/>`,hand:`<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4L3 13.5a1.6 1.6 0 0 1 2.5-2L8 14" ${P}/>`,
};
const ico=(k,s=22)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${IC[k]||''}</svg>`;

/* ---------- Einstellungen pro Gerät (keine persönlichen Daten) ---------- */
const PREF_KEY='elio-skizze-pref';
const PREF0={penOnly:'auto',rotate:true,lefty:false,grid:0,guide:'aus',sym:false,curve:'normal',smooth:.5,color:'#1d2433',recent:[],pal:[],colTab:'scheibe',harm:'komp',sizes:{},ops:{},pinsel:'tusche',formK:'rect',formFill:false,selK:'rect',fillK:'eimer',gradK:'linear',gradEnd:'trans',fillAll:true,fillTol:40,eraseK:'hart',textFont:'baloo',lineSnap:true,hintCol:false};
let PREF;try{PREF=Object.assign({},PREF0,JSON.parse(localStorage.getItem(PREF_KEY)||'{}'))}catch(e){PREF=Object.assign({},PREF0)}
if(PREF.eraseSoft){PREF.eraseK='weich';delete PREF.eraseSoft}if(!Array.isArray(PREF.pal))PREF.pal=[];
const prefSave=()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(PREF))}catch(e){}};
const curve=p=>PREF.curve==='weich'?Math.pow(p,.6):PREF.curve==='fest'?Math.pow(p,1.6):p;

/* ---------- Stil ---------- */
const CSS=`
.skz{position:fixed;inset:0;z-index:46;display:flex;flex-direction:column;background:var(--bg,#eef1f8);color:var(--ink,#18203d);font-family:var(--f-body,"Nunito",system-ui,sans-serif);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none}
.skz *{box-sizing:border-box}.skz button{font:inherit;color:inherit}
.skz-b{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:44px;padding:0 10px;border-radius:12px;border:0;background:transparent;cursor:pointer;touch-action:manipulation;font-weight:800;font-size:.92rem}
.skz-b:hover{background:var(--surface-2,#f5f7fc)}.skz-b:disabled{opacity:.35;cursor:default}.skz-b.on{background:var(--navy,#26337a);color:var(--on-accent,#fff)}
.skz-send{position:absolute;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:6;min-height:52px;padding:0 18px;border-radius:16px;font-size:1rem;box-shadow:0 6px 18px rgba(31,143,93,.35)}.skz.focus .skz-send{display:none}
.skz-b.pri{background:var(--navy,#26337a);color:var(--on-accent,#fff)}.skz-b.ok{background:var(--green,#1f8f5d);color:#fff}.skz-b.red{color:var(--red,#cf3a2c)}.skz-b.line{border:2px solid var(--line,#d8ddee);background:var(--surface,#fff)}
.skz-top{display:flex;align-items:center;gap:4px;padding:4px 8px;padding-top:max(4px,env(safe-area-inset-top));background:var(--surface,#fff);border-bottom:1px solid var(--line,#d8ddee);min-height:54px;flex:none}
.skz-ttl{min-width:0;flex:1;display:flex;align-items:center;gap:8px;overflow:hidden}.skz-ttl b{font-family:var(--f-display,"Baloo 2",system-ui);font-size:1.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.skz-kind{font-size:.72rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px;background:var(--warn-bg,#fdf0d2);color:#8a5a00;white-space:nowrap}.skz-kind.werk{background:var(--ok-bg,#dff4e9);color:#17643f}.skz-kind.frei{background:var(--surface-2,#f5f7fc);color:var(--muted,#586082)}
.skz-saved{font-size:.78rem;font-weight:800;color:var(--muted,#586082);white-space:nowrap}
.skz-sep{width:1px;height:28px;background:var(--line,#d8ddee);margin:0 4px}
.skz-colb{position:relative;width:50px;height:50px;border-radius:50%;border:0;padding:0;flex:none;cursor:pointer;background:conic-gradient(#e2001a,#f39200,#f4e403,#86bc25,#009a5a,#0094c8,#3a3a8f,#b5006b,#e2001a);touch-action:manipulation}
.skz-col{position:absolute;inset:5px;border-radius:50%;border:3px solid var(--surface,#fff);display:block}
.skz-qc{display:flex;gap:5px;align-items:center;padding:0 4px}.skz-qc button{width:28px;height:28px;border-radius:50%;border:2px solid rgba(0,0,0,.14);padding:0;cursor:pointer;flex:none}
@media (max-width:900px){.skz-qc{display:none}}
.skz-hint{position:absolute;z-index:30;right:10px;background:var(--navy,#26337a);color:#fff;font-weight:800;padding:10px 14px;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:.95rem;max-width:260px;pointer-events:none;animation:skzHint 1.2s ease-in-out infinite alternate}
.skz-hint::before{content:"";position:absolute;right:20px;top:-8px;border:8px solid transparent;border-top:0;border-bottom-color:var(--navy,#26337a)}
@keyframes skzHint{to{transform:translateY(4px)}}
.skz-cph{display:flex;align-items:center;gap:8px;margin-bottom:10px}.skz-cmp{display:flex;border-radius:12px;overflow:hidden;border:2px solid var(--line,#d8ddee);flex:none;height:40px}.skz-cmp button{width:34px;border:0;padding:0;cursor:pointer}.skz-cmp b{width:46px;display:block}
.skz-hex{width:100px!important;font-family:ui-monospace,Menlo,monospace;font-weight:800;text-transform:uppercase;padding:8px!important}
.skz-tabs{display:flex;gap:2px;background:var(--surface-2,#f5f7fc);border-radius:12px;padding:3px;margin-bottom:10px}.skz-tabs button{flex:1;border:0;background:transparent;border-radius:9px;padding:7px 2px;font-weight:800;font-size:.76rem;cursor:pointer;min-height:36px}.skz-tabs button.on{background:var(--surface,#fff);box-shadow:0 1px 4px rgba(0,0,0,.15)}
.skz-disc{display:block;margin:0 auto;width:250px;height:250px;touch-action:none;cursor:crosshair}
.skz-cv{display:grid;grid-template-columns:40px 1fr 48px;align-items:center;gap:6px 8px;font-weight:900;font-size:.85rem}.skz-cv input[type=range]{width:100%;height:28px;margin:0}.skz-cv output{font-variant-numeric:tabular-nums;text-align:right;font-weight:800;color:var(--muted,#586082)}
.skz-sw.big button{width:46px;height:46px;border-radius:12px}.skz-sw.ramp{gap:0;flex-wrap:nowrap}.skz-sw.ramp button{flex:1;width:auto;height:38px;border-radius:0;border:0}.skz-sw.ramp button:first-child{border-radius:10px 0 0 10px}.skz-sw.ramp button:last-child{border-radius:0 10px 10px 0}.skz-sw.ramp button.on{box-shadow:inset 0 0 0 3px #fff,inset 0 0 0 5px var(--navy,#26337a)}
.skz-sw .add{background:var(--surface,#fff)!important;border:2px dashed var(--muted,#586082)!important;display:flex;align-items:center;justify-content:center;color:var(--muted,#586082)}
.skz-sw.edit button[data-paldel]{position:relative}.skz-sw.edit button[data-paldel]::after{content:"×";position:absolute;right:-6px;top:-8px;width:18px;height:18px;line-height:17px;border-radius:50%;background:var(--red,#cf3a2c);color:#fff;font-weight:900;font-size:14px}
.skz-pop.wide{width:min(460px,calc(100vw - 20px))}.skz-brs.two{grid-template-columns:1fr 1fr}.skz-brs.two .skz-br{flex-direction:column;align-items:stretch;gap:4px}.skz-brs.two .skz-br canvas{width:100%;height:40px}
.skz-ref{position:absolute;z-index:7;background:var(--surface,#fff);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.3);overflow:hidden;display:flex;flex-direction:column;touch-action:none;min-width:140px;min-height:110px}
.skz-ref header{display:flex;align-items:center;gap:4px;padding:2px 2px 2px 10px;font-weight:900;font-size:.8rem;cursor:move;background:var(--surface-2,#f5f7fc)}.skz-ref header span{flex:1}.skz-ref header .skz-b{min-height:34px;min-width:34px;padding:0}
.skz-ref .im{flex:1;min-height:0;background:#fff center/contain no-repeat;cursor:copy}.skz-ref i{position:absolute;right:0;bottom:0;width:28px;height:28px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 55%,var(--muted,#586082) 55%,var(--muted,#586082) 62%,transparent 62%,transparent 72%,var(--muted,#586082) 72%,var(--muted,#586082) 79%,transparent 79%)}
.skz-guide{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.skz-guide line,.skz-guide path{stroke:#3a7bd5;stroke-width:2;vector-effect:non-scaling-stroke;opacity:.6;fill:none}.skz-guide .hz{stroke:#e2001a;opacity:.7}.skz-guide circle{fill:#fff;stroke:#e2001a;stroke-width:3;vector-effect:non-scaling-stroke}
.skz-main{flex:1;display:flex;min-height:0;position:relative}.skz.lefty .skz-main{flex-direction:row-reverse}
.skz-side{width:64px;flex:none;background:var(--surface,#fff);border-right:1px solid var(--line,#d8ddee);display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 0;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}
.skz.lefty .skz-side{border-right:0;border-left:1px solid var(--line,#d8ddee)}
.skz-side .skz-b{width:52px;height:42px;min-height:42px;padding:0;flex:none}
.skz-sl{display:flex;gap:4px;margin-top:8px;flex:none}.skz-sl>div{display:flex;flex-direction:column;align-items:center;gap:3px;width:28px}.skz-sl small{font-size:.6rem;font-weight:900;color:var(--muted,#586082);white-space:nowrap}
.skz-vs{position:relative;width:24px;height:130px;border-radius:12px;background:var(--surface-2,#f5f7fc);border:1px solid var(--line,#d8ddee);touch-action:none;cursor:ns-resize}
.skz-vs i{position:absolute;left:0;right:0;bottom:0;border-radius:12px;background:color-mix(in srgb,var(--navy,#26337a) 22%,transparent)}
.skz-vs b{position:absolute;left:-1px;width:24px;height:24px;border-radius:50%;background:var(--surface,#fff);border:2px solid var(--navy,#26337a);transform:translateY(50%)}
.skz-stage{flex:1;position:relative;overflow:hidden;touch-action:none;background:#c9ccd6;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;cursor:crosshair}
@media (prefers-color-scheme:dark){.skz-stage{background:#0b0e1d}}
.skz-doc{position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 6px 30px rgba(0,0,0,.25);isolation:isolate;will-change:transform}
.skz-doc>canvas,.skz-doc>.skz-paper,.skz-doc>.skz-grid,.skz-doc>svg{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.skz-doc>canvas.skz-float{width:auto;height:auto;transform-origin:0 0;outline:2px dashed #2f6fd6;outline-offset:0}
.skz-grid{background-image:linear-gradient(to right,rgba(47,99,200,.28) 2px,transparent 2px),linear-gradient(to bottom,rgba(47,99,200,.28) 2px,transparent 2px)}
.skz-ants{overflow:visible}.skz-ants path{fill:rgba(47,111,214,.07);stroke:#2f6fd6;stroke-width:2;stroke-dasharray:7 6;vector-effect:non-scaling-stroke;animation:skzAnts 1s linear infinite}
@keyframes skzAnts{to{stroke-dashoffset:-13}}
.skz-hud{position:absolute;inset:0;pointer-events:none;overflow:visible}
.skz-hud .h{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:#fff;border:3px solid #2f6fd6;box-shadow:0 1px 4px rgba(0,0,0,.3)}.skz-hud .h.rot{background:#2f6fd6}
.skz-hud svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.skz-hud polygon,.skz-hud line{fill:none;stroke:#2f6fd6;stroke-width:2}
.skz-cur{position:absolute;border-radius:50%;border:1.5px solid rgba(0,0,0,.55);box-shadow:0 0 0 1px rgba(255,255,255,.7);pointer-events:none;transform:translate(-50%,-50%);display:none}
.skz-zoom{position:absolute;left:50%;top:12px;transform:translateX(-50%);background:rgba(24,32,61,.82);color:#fff;font-weight:900;padding:4px 12px;border-radius:999px;font-size:.85rem;pointer-events:none;opacity:0;transition:opacity .25s}.skz-zoom.on{opacity:1}
.skz-ctx{position:absolute;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:center;background:var(--surface,#fff);border:1px solid var(--line,#d8ddee);border-radius:16px;padding:5px;box-shadow:0 8px 24px rgba(24,32,61,.18);max-width:calc(100% - 24px);z-index:5}
.skz-ctx:empty{display:none}.skz-ctx label{display:flex;align-items:center;gap:6px;font-weight:800;font-size:.85rem;padding:0 6px}.skz-ctx input[type=range]{width:110px}
.skz-pop{position:absolute;z-index:20;background:var(--surface,#fff);border:1px solid var(--line,#d8ddee);border-radius:18px;box-shadow:0 16px 40px rgba(24,32,61,.25);padding:14px;width:min(340px,calc(100vw - 20px));max-height:calc(100% - 20px);overflow:auto;-webkit-user-select:none}
.skz-pop h3{margin:0 0 8px;font-family:var(--f-display,"Baloo 2",system-ui);font-size:1.15rem}.skz-pop h4{margin:12px 0 6px;font-size:.78rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#586082)}
.skz-pop p{margin:4px 0;font-size:.88rem;color:var(--muted,#586082);font-weight:700}
.skz-sw{display:flex;flex-wrap:wrap;gap:6px}.skz-sw button{width:34px;height:34px;border-radius:50%;border:2px solid rgba(0,0,0,.12);cursor:pointer;padding:0}.skz-sw button.on{box-shadow:0 0 0 3px var(--surface,#fff),0 0 0 5px var(--navy,#26337a)}
.skz-wheel{display:grid;grid-template-columns:repeat(12,1fr);gap:3px}.skz-wheel button{aspect-ratio:1;width:auto;height:auto;border-radius:6px}
.skz-sv{position:relative;height:150px;border-radius:12px;touch-action:none;cursor:crosshair;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent)}
.skz-sv i,.skz-hue i{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.5);pointer-events:none}
.skz-hue{position:relative;height:26px;margin-top:10px;border-radius:13px;touch-action:none;cursor:ew-resize;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}.skz-hue i{top:50%}
.skz-brs{display:grid;gap:6px}.skz-br{display:flex;align-items:center;gap:10px;padding:6px;border-radius:12px;border:2px solid transparent;background:var(--surface-2,#f5f7fc);cursor:pointer;text-align:left}
.skz-br.on{border-color:var(--navy,#26337a)}.skz-br canvas{width:120px;height:36px;flex:none;border-radius:8px;background:#fff}.skz-br b{display:block}.skz-br small{display:block;font-size:.76rem;color:var(--muted,#586082);font-weight:700}
.skz-lays{display:grid;gap:6px}.skz-lay{display:flex;align-items:center;gap:8px;padding:5px;border-radius:12px;border:2px solid var(--line,#d8ddee);background:var(--surface,#fff);cursor:pointer}
.skz-lay.on{border-color:var(--navy,#26337a);background:color-mix(in srgb,var(--navy,#26337a) 8%,var(--surface,#fff))}.skz-lay canvas{width:64px;height:48px;border-radius:6px;flex:none;background:repeating-conic-gradient(#e6e6e6 0 25%,#fff 0 50%) 0 0/12px 12px;border:1px solid var(--line,#d8ddee)}
.skz-lay span{flex:1;min-width:0;font-weight:800;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.skz-lay small{display:block;font-weight:700;color:var(--muted,#586082);font-size:.72rem}
.skz-grid2{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.skz-grid2 .skz-b{flex-direction:column;font-size:.7rem;gap:2px;min-height:54px;padding:4px 2px;line-height:1.1;text-align:center}
.skz-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.skz-row label{font-weight:800;font-size:.9rem}
.skz-opt{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 10px;padding:8px 0;border-bottom:1px solid var(--line,#d8ddee);font-weight:800;font-size:.92rem}.skz-opt:last-child{border-bottom:0}
.skz-seg{display:inline-flex;border:2px solid var(--line,#d8ddee);border-radius:12px;overflow:hidden;flex:none}.skz-seg button{border:0;background:var(--surface,#fff);padding:6px 10px;font-weight:800;font-size:.82rem;cursor:pointer;min-height:36px}.skz-seg button.on{background:var(--navy,#26337a);color:var(--on-accent,#fff)}
.skz-tg{width:52px;height:30px;border-radius:15px;background:var(--line,#d8ddee);border:0;position:relative;cursor:pointer;flex:none}.skz-tg::after{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .15s}.skz-tg.on{background:var(--green,#1f8f5d)}.skz-tg.on::after{left:25px}
.skz-toast{position:absolute;left:50%;top:70px;transform:translateX(-50%);background:var(--ink,#18203d);color:var(--bg,#fff);padding:10px 16px;border-radius:14px;font-weight:800;z-index:40;max-width:min(520px,calc(100% - 24px));text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:skzIn .2s ease-out}
@keyframes skzIn{from{opacity:0;transform:translate(-50%,-8px)}}
.skz-task{display:flex;align-items:center;gap:8px;font-size:.82rem;font-weight:800;background:var(--warn-bg,#fdf0d2);color:#6d4800;padding:4px 10px;border-radius:999px;max-width:42vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.skz.focus .skz-top,.skz.focus .skz-side,.skz.focus .skz-ctx{display:none}.skz-fx .skz-close{display:flex;align-items:center;gap:6px;font-weight:900;padding:0 12px;width:auto}.skz-top{position:relative;z-index:12;touch-action:manipulation}.skz-fx{position:absolute;right:12px;top:12px;z-index:6;display:none;gap:6px}.skz.focus .skz-fx{display:flex}.skz-fx .skz-b{background:rgba(255,255,255,.92);box-shadow:0 2px 10px rgba(0,0,0,.2)}
.skz-txt{position:absolute;z-index:25;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100% - 24px))}
.skz-txt textarea{width:100%;min-height:90px;border-radius:12px;border:2px solid var(--line,#d8ddee);padding:10px;font-size:1.1rem;font-family:inherit;background:var(--surface,#fff);color:var(--ink,#18203d);-webkit-user-select:text;user-select:text}
.skz-in{width:100%;border-radius:12px;border:2px solid var(--line,#d8ddee);padding:10px;font:inherit;font-weight:700;background:var(--surface,#fff);color:var(--ink,#18203d);-webkit-user-select:text;user-select:text}
/* Skizzenbuch-Übersicht */
.skz-gal{flex:1;overflow:auto;padding:16px;padding-bottom:max(24px,env(safe-area-inset-bottom));-webkit-user-select:none}
.skz-gin{max-width:1180px;margin:0 auto}
.skz-gh{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}.skz-gh h1{font-family:var(--f-display,"Baloo 2",system-ui);margin:0;font-size:clamp(1.6rem,3.4vw,2.3rem);flex:1;min-width:200px}
.skz-gh img{width:70px;height:70px;object-fit:contain}
.skz-auf{background:var(--surface,#fff);border:1px solid var(--line,#d8ddee);border-left:6px solid #c0392b;border-radius:18px;padding:16px;margin-bottom:16px;box-shadow:var(--shadow,0 6px 20px rgba(0,0,0,.06))}
.skz-auf .k{font-size:.75rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#586082)}.skz-auf h2{margin:4px 0 12px;font-family:var(--f-display,"Baloo 2",system-ui);font-size:1.35rem;line-height:1.25}
.skz-steps{display:flex;align-items:stretch;gap:10px;overflow-x:auto;padding-bottom:4px}
.skz-step{width:150px;flex:none;border-radius:14px;border:2px dashed var(--line,#d8ddee);background:var(--surface-2,#f5f7fc);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px;min-height:140px;cursor:pointer;font-weight:800;text-align:center}
.skz-step img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#fff}.skz-step.done{border-style:solid;border-color:var(--green,#1f8f5d)}.skz-step.werk{border-color:#c0392b;border-style:solid}.skz-step.lock{opacity:.6;cursor:default}
.skz-step small{font-size:.75rem;color:var(--muted,#586082)}.skz-arrow{align-self:center;color:var(--muted,#586082);flex:none}
.skz-tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.skz-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.skz-card{position:relative;background:var(--surface,#fff);border:1px solid var(--line,#d8ddee);border-radius:16px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow,0 6px 20px rgba(0,0,0,.06));text-align:left;padding:0}
.skz-card .th{aspect-ratio:4/3;background:#fff center/contain no-repeat;border-bottom:1px solid var(--line,#d8ddee)}.skz-card .in{padding:8px 10px 10px}.skz-card b{display:block;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.skz-card small{color:var(--muted,#586082);font-weight:700;font-size:.78rem}
.skz-card .skz-kind{position:absolute;left:8px;top:8px}.skz-card .mn{position:absolute;right:4px;top:4px;background:rgba(255,255,255,.9);min-width:40px;min-height:40px}
.skz-new{border:2px dashed var(--line,#d8ddee);border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:180px;cursor:pointer;background:transparent;font-weight:800;color:var(--muted,#586082)}
.skz-empty{padding:28px;text-align:center;color:var(--muted,#586082);font-weight:700}
.skz-modal{position:absolute;inset:0;background:rgba(15,19,40,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.skz-modal>div{background:var(--surface,#fff);border-radius:20px;padding:18px;width:min(520px,100%);max-height:100%;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.skz-modal h3{margin:0 0 10px;font-family:var(--f-display,"Baloo 2",system-ui);font-size:1.3rem}.skz-modal h4{margin:14px 0 6px;font-size:.78rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#586082)}
.skz-ch{display:flex;gap:8px;flex-wrap:wrap}.skz-ch button{border:2px solid var(--line,#d8ddee);border-radius:14px;background:var(--surface,#fff);padding:8px 12px;font-weight:800;cursor:pointer;min-height:44px;display:flex;align-items:center;gap:8px}.skz-ch button.on{border-color:var(--navy,#26337a);background:color-mix(in srgb,var(--navy,#26337a) 10%,var(--surface,#fff))}
.skz-ch .pp{width:22px;height:22px;border-radius:6px;border:1px solid rgba(0,0,0,.2)}.skz-ch .fm{display:inline-block;border:2px solid currentColor;border-radius:3px}
.skz-vor{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}.skz-vor button{border:2px solid var(--line,#d8ddee);border-radius:12px;background:#fff;padding:4px;cursor:pointer}.skz-vor button.on{border-color:var(--navy,#26337a);box-shadow:0 0 0 2px var(--navy,#26337a)}.skz-vor img{width:100%;aspect-ratio:4/3;object-fit:contain;display:block}.skz-vor small{display:block;font-weight:800;font-size:.72rem;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.skz-task[hidden]{display:none}@media (max-width:900px){.skz-task{display:none}}
@media (max-width:700px){.skz-top .skz-hide-s{display:none}.skz-side{width:56px}.skz-side .skz-b{width:48px}.skz-task{display:none}}
`;
function injectCSS(){if(D.getElementById('skz-css'))return;const s=D.createElement('style');s.id='skz-css';s.textContent=CSS;D.head.appendChild(s)}

/* =====================================================================
   Editor
   ===================================================================== */
function Editor(app,page){
  const E={app,page,layers:[],act:0,view:{x:0,y:0,s:1,r:0},tool:null,prevTool:'pinsel',sel:null,fl:null,dirty:new Set(),metaDirty:false,saving:false,saveT:0,closed:false};
  const w=page.w,h=page.h;
  const root=app.root;
  root.innerHTML='';root.className='skz'+(PREF.lefty?' lefty':'');
  root.insertAdjacentHTML('beforeend',`<div class="skz-top">
      <button class="skz-b" data-k="back" title="Zum Skizzenbuch">${ico('back')}<span class="skz-hide-s">Skizzenbuch</span></button>
      <div class="skz-ttl"><b data-k="rename" title="Umbenennen"></b><span class="skz-kind"></span><span class="skz-task" hidden></span></div>
      <span class="skz-saved"></span>
      <button class="skz-b" data-k="undo" title="Rückgängig (Zwei-Finger-Tipp)">${ico('undo')}</button><button class="skz-b" data-k="redo" title="Wiederholen (Drei-Finger-Tipp)">${ico('redo')}</button>
      <span class="skz-sep"></span>
      <button class="skz-b" data-k="layers" title="Ebenen">${ico('ebenen')}</button>
      <button class="skz-b" data-k="adjust" title="Anpassen (Farbton, Helligkeit, Weichzeichnen …)">${ico('adjust')}</button>
      <button class="skz-b" data-k="export" title="Exportieren">${ico('export')}</button>
      <button class="skz-b" data-k="settings" title="Einstellungen">${ico('set')}</button>
      <button class="skz-b" data-k="fit" title="Zoom zurücksetzen" aria-label="Zoom zurücksetzen">${ico('fit')}</button>
      <button class="skz-b skz-hide-s" data-k="full" title="Vollbild">${ico('full')}</button>
      <span class="skz-qc" aria-label="Zuletzt benutzte Farben"></span>
      <button class="skz-colb" data-k="color" title="Farbe wählen" aria-label="Farbe wählen"><span class="skz-col"></span></button>
    </div>
    <div class="skz-main"><div class="skz-side"></div>
      <div class="skz-stage"><div class="skz-doc"></div><div class="skz-hud"></div><div class="skz-cur"></div><div class="skz-zoom"></div>
        <div class="skz-ctx"></div>${app.ctx.onShare?`<button class="skz-b ok skz-send" data-k="send">${ico('send',20)}<span>Mit Lehrkraft teilen</span></button>`:''}<div class="skz-fx"><button class="skz-b" data-k="undo">${ico('undo')}</button><button class="skz-b" data-k="fit" title="Zoom zurücksetzen" aria-label="Zoom zurücksetzen">${ico('fit')}</button><button class="skz-b skz-close" data-k="unfocus" aria-label="Vollbild schließen">${ico('unfull')}<span>Schließen</span></button></div></div></div>`);
  const $=s=>root.querySelector(s);
  const stage=$('.skz-stage'),doc=$('.skz-doc'),hud=$('.skz-hud'),cur=$('.skz-cur'),ctxBar=$('.skz-ctx'),side=$('.skz-side');
  doc.style.width=w+'px';doc.style.height=h+'px';
  const paper=D.createElement('div');paper.className='skz-paper';doc.appendChild(paper);
  const sc=mkCanvas(w,h),sctx=ctx2(sc);sc.className='skz-stroke';
  const grid=D.createElement('div');grid.className='skz-grid';
  const guide=D.createElementNS('http://www.w3.org/2000/svg','svg');guide.setAttribute('class','skz-guide');guide.setAttribute('viewBox',`0 0 ${w} ${h}`);guide.setAttribute('preserveAspectRatio','none');
  const vpGet=()=>page.vp||{x:w/2,y:h*.42};
  function drawGuide(){const g=PREF.guide;if(g==='drittel'){guide.innerHTML=`<path d="M${w/3} 0V${h}M${2*w/3} 0V${h}M0 ${h/3}H${w}M0 ${2*h/3}H${w}"/>`;return}
    if(g==='fp'){const v=vpGet(),L=3*Math.max(w,h);let d='';for(let a=0;a<360;a+=10){if(a===0||a===180)continue;const r=a*Math.PI/180;d+=`M${v.x} ${v.y}L${(v.x+Math.cos(r)*L).toFixed(1)} ${(v.y+Math.sin(r)*L).toFixed(1)}`}
      guide.innerHTML=`<path d="${d}"/><line class="hz" x1="0" y1="${v.y}" x2="${w}" y2="${v.y}"/><circle cx="${v.x}" cy="${v.y}" r="${Math.max(6,14/V.s)}"/>`;return}
    guide.innerHTML=''}
  // Gerade Linien rasten ein: waagrecht, senkrecht, 45° und (mit Fluchtpunkt) zum Fluchtpunkt hin
  function snapEnd(a,q){let x1=q.x,y1=q.y;const d=Math.hypot(x1-a.x,y1-a.y);if(d<2)return q;const an=Math.atan2(y1-a.y,x1-a.x);const C=[];
    if(PREF.lineSnap)for(let k=-4;k<=4;k++)C.push([k*Math.PI/4,.07]);
    if(PREF.guide==='fp'){const v=vpGet();if(Math.hypot(v.x-a.x,v.y-a.y)>4){const t=Math.atan2(v.y-a.y,v.x-a.x);C.push([t,.14],[t+Math.PI,.14],[t-Math.PI,.14])}C.push([0,.1],[Math.PI,.1],[-Math.PI,.1],[Math.PI/2,.1],[-Math.PI/2,.1])}
    let best=null;for(const [t,tol] of C){const df=Math.abs(an-t);if(df<tol&&(!best||df<best[1]))best=[t,df]}
    return best?{x:a.x+Math.cos(best[0])*d,y:a.y+Math.sin(best[0])*d}:q}
  const ants=D.createElementNS('http://www.w3.org/2000/svg','svg');ants.setAttribute('class','skz-ants');ants.setAttribute('viewBox',`0 0 ${w} ${h}`);ants.setAttribute('preserveAspectRatio','none');
  let bk=null;// Sicherung der Ebene beim Radieren (für Rückgängig)
  const bkCanvas=()=>bk||(bk=mkCanvas(w,h));

  /* --- Ebenen --- */
  function mkLayer(o){const cv=mkCanvas(w,h);return {id:o.id||uid(),name:o.name||'Ebene',vis:o.vis!==false,op:o.op==null?1:+o.op,blend:o.blend||'source-over',ref:!!o.ref,lockA:!!o.lockA,cv,ctx:ctx2(cv)}}
  const act=()=>E.layers[E.act];
  function syncLayers(){paper.style.background=page.bg||'#fff';
    const kids=[paper];E.layers.forEach((L,i)=>{const c=L.cv;c.style.opacity=L.op;c.style.display=L.vis?'':'none';c.style.mixBlendMode=cssBlend(L.blend);kids.push(c);if(i===E.act)kids.push(sc)});
    if(E.fl)kids.push(E.fl.cv);kids.push(grid,guide,ants);kids.forEach(k=>doc.appendChild(k));drawGuide();
    grid.style.display=PREF.grid?'':'none';if(PREF.grid){const g=PREF.grid;grid.style.backgroundSize=`${g}px ${g}px`}}
  E.syncLayers=syncLayers;

  /* --- Ansicht (verschieben, zoomen, drehen) --- */
  const V=E.view;
  V.f=1;// 1 oder -1: Ansicht gespiegelt (nur zum Prüfen, das Bild bleibt gleich)
  function applyView(){const c=Math.cos(V.r)*V.s,s=Math.sin(V.r)*V.s;doc.style.transform=`matrix(${c*V.f},${s*V.f},${-s},${c},${V.x},${V.y})`;drawHud()}
  const toDoc=(sx,sy)=>{const x=sx-V.x,y=sy-V.y,c=Math.cos(-V.r),s=Math.sin(-V.r);return {x:(x*c-y*s)/V.s/V.f,y:(x*s+y*c)/V.s}};
  const toScr=(x,y)=>{const c=Math.cos(V.r)*V.s,s=Math.sin(V.r)*V.s;x*=V.f;return {x:x*c-y*s+V.x,y:x*s+y*c+V.y}};
  // Zoomgrenzen: nie kleiner als ein Drittel des ganzen Blatts, nie größer als 8-fach (sonst hängt Safari)
  function fitS(){const r=stage.getBoundingClientRect();return r.width?Math.min((r.width-40)/w,(r.height-40)/h):1}
  const zMin=()=>Math.max(.05,fitS()/3),zMax=()=>Math.max(zMin()*2,8/(W.devicePixelRatio||1)*2);
  function fit(){const r=stage.getBoundingClientRect();if(!r.width)return;V.r=0;V.s=Math.min((r.width-40)/w,(r.height-40)/h);V.x=(r.width-w*V.s)/2+(V.f<0?w*V.s:0);V.y=(r.height-h*V.s)/2;applyView()}
  function flipView(){const r=stage.getBoundingClientRect(),c=toDoc(r.width/2,r.height/2);V.f*=-1;const q=toScr(c.x,c.y);V.x+=r.width/2-q.x;V.y+=r.height/2-q.y;applyView();toast(V.f<0?'Ansicht gespiegelt. So siehst du Fehler in Proportionen leichter.':'Ansicht wieder normal.')}
  let zt=0;function zoomHint(){const z=$('.skz-zoom');let deg=Math.round(V.r*180/Math.PI)%360;if(deg>180)deg-=360;if(deg<-180)deg+=360;z.textContent=Math.round(V.s*100*(W.devicePixelRatio||1)/2)+' %'+(deg?' · '+deg+'°':'');z.classList.add('on');clearTimeout(zt);zt=setTimeout(()=>z.classList.remove('on'),900)}
  function zoomAt(sx,sy,k){const p=toDoc(sx,sy);V.s=clamp(V.s*k,zMin(),zMax());const q=toScr(p.x,p.y);V.x+=sx-q.x;V.y+=sy-q.y;applyView();zoomHint()}
  E.fit=fit;

  /* --- Rückgängig --- */
  const H={st:[],i:0,bytes:0};
  function hpush(e){for(let k=H.i;k<H.st.length;k++)H.bytes-=H.st[k].bytes||0;H.st.length=H.i;H.st.push(e);H.i++;H.bytes+=e.bytes||0;
    while(H.st.length>HIST_MAX||(H.bytes>HIST_BYTES&&H.st.length>1)){const o=H.st.shift();H.bytes-=o.bytes||0;H.i--}changed()}
  function pxEntry(L,x,y,before,after){return {bytes:before.data.length*2,undo(){L.ctx.putImageData(before,x,y);mark(L)},redo(){L.ctx.putImageData(after,x,y);mark(L)}}}
  function undo(){if(E.fl)return cancelFloat();if(H.i>0){H.st[--H.i].undo();changed(true)}}
  function redo(){if(H.i<H.st.length){H.st[H.i++].redo();changed(true)}}
  const mark=L=>{E.dirty.add(L);E.metaDirty=true};
  function changed(re){if(E.closed)return;$('[data-k=undo]').disabled=H.i===0&&!E.fl;$('[data-k=redo]').disabled=H.i>=H.st.length;if(re)syncLayers();if(E.pop==='layers')popLayers();queueSave()}
  E.undo=undo;E.redo=redo;

  /* --- Speichern (automatisch) --- */
  function setSaved(t){const el=$('.skz-saved');if(el)el.textContent=t}
  function queueSave(){E.metaDirty=true;setSaved('');clearTimeout(E.saveT);E.saveT=setTimeout(save,1600)}
  // Speichern läuft immer nacheinander (Kette), damit beim Schließen nichts Halbes auf dem Gerät landet
  function save(){clearTimeout(E.saveT);E.chain=(E.chain||Promise.resolve()).then(doSave,doSave);return E.chain}
  async function doSave(){if((!E.metaDirty&&!E.dirty.size)||!E.layers.length)return;
    setSaved('Speichert …');try{
      const ls=[...E.dirty];E.dirty.clear();E.metaDirty=false;const blobs=[];for(const L of ls)if(E.layers.includes(L))blobs.push([L.id,await toBlob(L.cv)]);
      const th=await thumb(320,.72);
      page.layers=E.layers.map(L=>({id:L.id,name:L.name,vis:L.vis,op:L.op,blend:L.blend,ref:L.ref,lockA:L.lockA}));page.act=act()&&act().id;page.updated=Date.now();page.thumb=th;
      const keep=new Set(page.layers.map(l=>l.id)),old=(E.saved||[]).filter(id=>!keep.has(id));E.saved=[...keep];
      await run(['pages','px'],'readwrite',t=>{const px=t.objectStore('px');blobs.forEach(([id,b])=>px.put(b,page.id+'/'+id));old.forEach(id=>px.delete(page.id+'/'+id));t.objectStore('pages').put(page)});
      setSaved('Gespeichert');app.progress()}
    catch(e){console.warn(e);setSaved('Nicht gespeichert!');E.metaDirty=true;toast('Speichern ging gerade nicht. Ist der Speicher des iPads voll?')}}
  E.save=save;
  function flatten(maxW,withPaper=true){const k=maxW?Math.min(1,maxW/Math.max(w,h)):1,c=mkCanvas(Math.round(w*k),Math.round(h*k)),x=ctx2(c);x.imageSmoothingQuality='high';
    if(withPaper){x.fillStyle=page.bg||'#fff';x.fillRect(0,0,c.width,c.height)}
    E.layers.forEach(L=>{if(!L.vis)return;x.globalAlpha=L.op;x.globalCompositeOperation=L.blend;x.drawImage(L.cv,0,0,c.width,c.height)});x.globalAlpha=1;x.globalCompositeOperation='source-over';return c}
  E.flatten=flatten;
  async function thumb(n,q){const c=flatten(n);const b=await toBlob(c,'image/jpeg',q);freeCanvas(c);return b}

  /* --- Werkzeugleiste --- */
  const TOOLS=[['pinsel','Pinsel'],['bleistift','Bleistift'],['radierer','Radierer'],['wischen','Wischen'],['marker','Textmarker'],['fuellen','Füllen'],['form','Formen und Linien'],['auswahl','Auswahl'],['transform','Verschieben'],['pipette','Pipette'],['text','Text'],['bild','Bild einfügen']];
  side.innerHTML=TOOLS.map(([k,n])=>`<button class="skz-b" data-tool="${k}" title="${n}" aria-label="${n}">${ico(k==='pinsel'?'pinsel':k)}</button>`).join('')+
    `<div class="skz-sl"><div title="Größe"><div class="skz-vs" data-vs="size" aria-label="Größe"><i></i><b></b></div><small data-v="size"></small></div><div title="Deckkraft"><div class="skz-vs" data-vs="op" aria-label="Deckkraft"><i></i><b></b></div><small data-v="op"></small></div></div>`;
  const brushId=()=>E.tool==='pinsel'?PREF.pinsel:E.tool==='bleistift'?'bleistift':E.tool==='marker'?'marker':E.tool==='radierer'?'radierer':E.tool==='wischen'?'wischen':E.tool==='form'?(E.lastBrush||PREF.pinsel):null;
  const sizeOf=id=>PREF.sizes[id]!=null?PREF.sizes[id]:(BR[id]?BR[id].def:.3);
  const opOf=id=>PREF.ops[id]!=null?PREF.ops[id]:1;
  function updSliders(){const id=brushId();root.querySelectorAll('.skz-sl').forEach(el=>el.style.visibility=id?'':'hidden');if(!id)return;
    const s=sizeOf(id),o=opOf(id),b=BR[id];[['size',s],['op',o]].forEach(([k,v])=>{const el=root.querySelector(`[data-vs=${k}]`);el.querySelector('i').style.height=(v*100)+'%';el.querySelector('b').style.bottom=(v*100)+'%'});
    root.querySelector('[data-v=size]').textContent=Math.round(sizePx(b,s))+' px';root.querySelector('[data-v=op]').textContent=Math.round(o*100)+' %'}
  // eigene senkrechte Regler: auf dem iPad mit Finger und Stift gut zu treffen
  side.addEventListener('pointerdown',e=>{const el=e.target.closest('.skz-vs');if(!el)return;e.preventDefault();const k=el.dataset.vs,id=brushId();if(!id)return;
    const set=ev=>{const r=el.getBoundingClientRect(),v=clamp(1-(ev.clientY-r.top)/r.height,k==='op'?.05:0,1);if(k==='size')PREF.sizes[id]=Math.round(v*1000)/1000;else PREF.ops[id]=Math.round(v*100)/100;updSliders();showCur(r.right+60,ev.clientY)};
    set(e);const mv=ev=>set(ev),up=()=>{W.removeEventListener('pointermove',mv);W.removeEventListener('pointerup',up);W.removeEventListener('pointercancel',up);prefSave();cur.style.display='none'};
    W.addEventListener('pointermove',mv);W.addEventListener('pointerup',up);W.addEventListener('pointercancel',up)});
  function showCur(sx,sy){const id=brushId();if(!id)return;const st=stage.getBoundingClientRect(),d=sizePx(BR[id],sizeOf(id))*V.s;cur.style.width=cur.style.height=Math.max(4,d)+'px';cur.style.left=(sx-st.left)+'px';cur.style.top=(sy-st.top)+'px';cur.style.display='block'}

  function setTool(t){if(t==='bild'){closePop();pickImage();return}if(t===E.tool&&t==='pinsel'){openPop('brush');return}if(E.pop==='brush'||E.pop==='adjust')closePop();
    if(E.fl&&t!=='transform')commitFloat();if(E.txt)closeText();
    if(t==='transform'&&E.tool!=='transform')E.beforeT=E.tool;if(t!=='pipette')E.prevTool=t;E.tool=t;if(['pinsel','bleistift','marker'].includes(t))E.lastBrush=brushId();
    side.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===t));updSliders();ctxBarUpd();
    if(t==='transform')startFloat();stage.style.cursor=t==='transform'?'move':t==='pipette'?'copy':'crosshair'}
  E.setTool=setTool;

  /* --- Kontextleiste unten (Optionen je Werkzeug) --- */
  function seg(k,opts,val){return `<span class="skz-seg">${opts.map(([v,n,ic])=>`<button data-seg="${k}" data-v="${v}" class="${String(val)===String(v)?'on':''}" title="${n}">${ic?ico(ic,18):''}${ic?'':n}</button>`).join('')}</span>`}
  function ctxBarUpd(){const t=E.tool;let h='';
    if(t==='pinsel'){const b=BR[PREF.pinsel];h=`<button class="skz-b line" data-k="brush">${ico('pinsel',18)} ${esc(b.name)}</button>`}
    if(t==='radierer')h=seg('eraseK',[['hart','Hart'],['weich','Weich'],['korn','Körnig']],PREF.eraseK);
    if(t==='wischen')h='<small style="font-weight:800;padding:0 8px;color:var(--muted)">Ziehe über Farbe, um sie zu verwischen. Unterer Regler = Stärke.</small>';
    if(t==='form')h=seg('formK',[['linie','Linie','linie'],['rect','Rechteck','rect'],['ellipse','Ellipse','ellipse'],['tri','Dreieck','tri']],PREF.formK)+(PREF.formK==='linie'?`<label><button class="skz-tg ${PREF.lineSnap?'on':''}" data-tg="lineSnap"></button> Einrasten</label>`:seg('formFill',[[false,'Umriss'],[true,'Gefüllt']],PREF.formFill))+`<small style="font-weight:800;padding:0 6px;color:var(--muted)">Pinsel: ${esc(BR[E.lastBrush||PREF.pinsel].name)}</small>`;
    if(t==='fuellen')h=seg('fillK',[['eimer','Farbeimer'],['verlauf','Verlauf']],PREF.fillK)+(PREF.fillK==='verlauf'
      ?seg('gradK',[['linear','Gerade'],['radial','Rund']],PREF.gradK)+seg('gradEnd',[['trans','zu durchsichtig'],['zweit','zur vorigen Farbe']],PREF.gradEnd)+`<span class="skz-gp" style="width:70px;height:26px;border-radius:8px;border:1px solid var(--line);background:linear-gradient(to right,${PREF.color},${PREF.gradEnd==='zweit'?prevCol():hexA(PREF.color,0)}),repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/10px 10px"></span>`
      :`<label>Toleranz <input type="range" min="0" max="120" value="${PREF.fillTol}" data-rng="fillTol"></label>${seg('fillAll',[[true,'Alle Ebenen beachten'],[false,'Nur diese Ebene']],PREF.fillAll)}`);
    if(t==='auswahl')h=seg('selK',[['rect','Rechteck','rect'],['lasso','Lasso','lasso']],PREF.selK)+(E.sel?`<button class="skz-b" data-k="sel-move">${ico('transform',18)} Verschieben</button><button class="skz-b" data-k="sel-copy">${ico('dup',18)} Kopieren</button><button class="skz-b red" data-k="sel-del">${ico('trash',18)} Löschen</button><button class="skz-b" data-k="sel-none">${ico('x',18)} Aufheben</button>`:'<small style="font-weight:800;padding:0 6px;color:var(--muted)">Umrande, was du ändern willst.</small>');
    if(t==='transform')h=E.fl?`<button class="skz-b" data-k="fl-h">${ico('flipH',18)} Spiegeln</button><button class="skz-b" data-k="fl-v">${ico('flipV',18)} Kippen</button><label><button class="skz-tg ${E.fl.free?'on':''}" data-k="fl-free"></button> Verzerren</label><button class="skz-b" data-k="fl-x">${ico('x',18)} Abbrechen</button><button class="skz-b pri" data-k="fl-ok">${ico('check',18)} Fertig</button>`:'';
    if(t==='pipette')h='<small style="font-weight:800;padding:0 8px;color:var(--muted)">Tippe auf eine Farbe im Bild. Mit dem Finger: lange drücken geht immer.</small>';
    if(t==='text')h='<small style="font-weight:800;padding:0 8px;color:var(--muted)">Tippe dahin, wo der Text stehen soll.</small>';
    ctxBar.innerHTML=h}

  /* --- Farbe --- */
  function showCol(){$('.skz-col').style.background=PREF.color}
  function quickCols(){const q=$('.skz-qc');if(!q)return;q.innerHTML=PREF.recent.filter(c=>c!==PREF.color).slice(0,5).map(c=>`<button data-col="${c}" style="background:${c}" title="${c}" aria-label="Farbe ${c}"></button>`).join('')}
  function setColor(c,keep){PREF.color=c;showCol();if(E.tool==='fuellen'&&PREF.fillK==='verlauf')setTimeout(ctxBarUpd);if(!keep){PREF.recent=[c,...PREF.recent.filter(x=>x!==c)].slice(0,14);quickCols()}prefSave();if(E.pop==='color')colorPopUpd()}
  E.setColor=setColor;
  function colHint(){if(PREF.hintCol)return;const t=$('.skz-top').getBoundingClientRect(),rr=root.getBoundingClientRect(),el=D.createElement('div');el.className='skz-hint';el.textContent='Hier wählst du die Farbe: Farbscheibe, Paletten und Farbharmonien.';
    el.style.top=(t.bottom-rr.top+10)+'px';root.appendChild(el);setTimeout(()=>el.remove(),7000)}

  /* --- Popups --- */
  function closePop(){const p=root.querySelector('.skz-pop');if(p)p.remove();if(E.pop==='adjust')adjCancel();E.pop=null}
  function openPop(k){if(E.pop===k){closePop();return}closePop();E.pop=k;const p=D.createElement('div');p.className='skz-pop';
    const top=$('.skz-top').getBoundingClientRect(),rr=root.getBoundingClientRect();p.style.top=(top.bottom-rr.top+6)+'px';p.style.maxHeight=(rr.bottom-top.bottom-16)+'px';
    if(k==='brush'){const sb=side.getBoundingClientRect();if(PREF.lefty)p.style.right=(rr.right-sb.left+6)+'px';else p.style.left=(sb.right-rr.left+6)+'px'}else p.style.right='8px';
    if(k==='brush')p.classList.add('wide');if(k==='color'){PREF.hintCol=true;prefSave();const hn=root.querySelector('.skz-hint');if(hn)hn.remove()}
    root.appendChild(p);({color:colorPop,brush:brushPop,layers:popLayers,settings:setPop,export:expPop,adjust:adjPop}[k])()}
  E.openPop=openPop;E.closePop=closePop;
  const pop=()=>root.querySelector('.skz-pop');
  let HSV=[0,0,0];
  const fromHSV=()=>{PREF.color=rgb2hex(...hsv2rgb(...HSV));showCol();colorPopUpd(true)};
  const prevCol=()=>PREF.recent.find(c=>c!==PREF.color)||'#ffffff';
  const sw=(L,cls='',del)=>`<div class="skz-sw ${cls}">${L.map(c=>`<button ${del?'data-paldel':'data-col'}="${c}" style="background:${c}" class="${c===PREF.color?'on':''}" aria-label="${c}"></button>`).join('')}</div>`;
  const CTABS=[['scheibe','Scheibe'],['klassisch','Feld'],['werte','Werte'],['harmonie','Harmonie'],['paletten','Paletten']];
  function colorPop(){const p=pop();HSV=rgb2hsv(...hex2rgb(PREF.color));const T=PREF.colTab;
    let body='';
    if(T==='scheibe')body=`<canvas class="skz-disc" width="500" height="500"></canvas>`;
    if(T==='klassisch')body=`<div class="skz-sv"><i></i></div><div class="skz-hue"><i></i></div>`;
    if(T==='werte')body=`<div class="skz-cv">${[['h','H',360],['s','S',100],['v','B',100],['r','R',255],['g','G',255],['b','B',255]].map(([k,n,m])=>`<span>${{h:'Ton',s:'Sätt.',v:'Hell',r:'Rot',g:'Grün',b:'Blau'}[k]}</span><input type="range" min="0" max="${m}" data-cv="${k}"><output data-cvo="${k}"></output>`).join('')}</div>`;
    if(T==='harmonie')body=`<div class="skz-ch" style="gap:6px">${[['komp','Komplementär'],['analog','Benachbart'],['triade','Dreiklang'],['split','Geteilt']].map(([v,n])=>`<button data-harm="${v}" class="${PREF.harm===v?'on':''}" style="min-height:36px;padding:4px 10px;font-size:.8rem">${n}</button>`).join('')}</div>
      <p class="skz-harmt"></p><div class="skz-harm"></div><h4>Heller und dunkler (mit Weiß / Schwarz)</h4><div class="skz-ramp1"></div><h4>Trüben (mit Grau)</h4><div class="skz-ramp2"></div>`;
    if(T==='paletten')body=`<h4 style="margin-top:0">Farbkreis nach Itten</h4>${sw(ITTEN,'skz-wheel')}<h4>Erdtöne und Hauttöne</h4>${sw(ERDE)}<div style="height:6px"></div>${sw(HAUT)}<h4>Unbunt</h4>${sw(GRAU)}
      <div class="skz-row" style="justify-content:space-between;margin-top:12px"><h4 style="margin:0">Meine Palette</h4>${PREF.pal.length?`<button class="skz-b" data-k="pal-edit" style="min-height:32px;font-size:.8rem">${E.palEdit?'Fertig':'Bearbeiten'}</button>`:''}</div>
      <div class="skz-sw ${E.palEdit?'edit':''}" style="margin-top:6px">${PREF.pal.map(c=>`<button ${E.palEdit?'data-paldel':'data-col'}="${c}" style="background:${c}" class="${c===PREF.color?'on':''}" aria-label="${c}"></button>`).join('')}${PREF.pal.length<30?`<button class="add" data-k="pal-add" title="Aktuelle Farbe merken" aria-label="Aktuelle Farbe merken">${ico('plus',18)}</button>`:''}</div>`;
    p.innerHTML=`<div class="skz-cph"><div class="skz-cmp"><button data-col="${prevCol()}" style="background:${prevCol()}" title="Vorige Farbe"></button><b></b></div>
        <input class="skz-in skz-hex" data-k="hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Farbcode"><span style="flex:1"></span><button class="skz-b line" data-k="c-pick" title="Pipette: Farbe aus dem Bild nehmen">${ico('pipette',20)}</button></div>
      <div class="skz-tabs">${CTABS.map(([k,n])=>`<button data-ctab="${k}" class="${T===k?'on':''}">${n}</button>`).join('')}</div>${body}
      ${PREF.recent.length?`<h4>Zuletzt</h4>${sw(PREF.recent.slice(0,14))}`:''}`;
    colorPopUpd(true);
    const drag=(el,fn,start)=>el.addEventListener('pointerdown',e=>{e.preventDefault();const r=el.getBoundingClientRect(),f=ev=>fn((ev.clientX-r.left)/r.width,(ev.clientY-r.top)/r.height);if(start)start((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);f(e);
      const mv=ev=>f(ev),up=()=>{W.removeEventListener('pointermove',mv);W.removeEventListener('pointerup',up);W.removeEventListener('pointercancel',up);setColor(PREF.color)};W.addEventListener('pointermove',mv);W.addEventListener('pointerup',up);W.addEventListener('pointercancel',up)});
    if(T==='klassisch'){drag(p.querySelector('.skz-sv'),(x,y)=>{HSV[1]=clamp(x,0,1);HSV[2]=clamp(1-y,0,1);fromHSV()});
      drag(p.querySelector('.skz-hue'),x=>{HSV[0]=clamp(x,0,.999)*360;fromHSV()})}
    if(T==='scheibe'){let part='';drag(p.querySelector('.skz-disc'),(x,y)=>{const dx=x-.5,dy=y-.5;
        if(part==='ring'){HSV[0]=((Math.atan2(dy,dx)*180/Math.PI)+450)%360}else{const q=DISC.q/DISC.n;HSV[1]=clamp((x-(.5-q))/(2*q),0,1);HSV[2]=clamp(1-(y-(.5-q))/(2*q),0,1)}fromHSV()},
      (x,y)=>{part=Math.hypot(x-.5,y-.5)>DISC.ri/DISC.n-.02?'ring':'sq'})}}
  // Farbscheibe: außen Farbton-Ring, innen Feld für Sättigung und Helligkeit
  const DISC={n:500,ro:244,ri:196,q:128};let RING=null;
  function ringCanvas(){if(RING)return RING;const c=mkCanvas(DISC.n,DISC.n),x=ctx2(c),m=DISC.n/2;for(let i=0;i<360;i++){x.beginPath();x.fillStyle=`hsl(${i},100%,50%)`;const a0=(i-90.6)*Math.PI/180,a1=(i-89.2)*Math.PI/180;x.arc(m,m,DISC.ro,a0,a1);x.arc(m,m,DISC.ri,a1,a0,true);x.closePath();x.fill()}return RING=c}
  function drawDisc(cv){const x=ctx2(cv),n=DISC.n,m=n/2,q=DISC.q;x.clearRect(0,0,n,n);x.drawImage(ringCanvas(),0,0);
    x.fillStyle=`hsl(${HSV[0]},100%,50%)`;x.fillRect(m-q,m-q,2*q,2*q);let g=x.createLinearGradient(m-q,0,m+q,0);g.addColorStop(0,'#fff');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(m-q,m-q,2*q,2*q);
    g=x.createLinearGradient(0,m-q,0,m+q);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'#000');x.fillStyle=g;x.fillRect(m-q,m-q,2*q,2*q);
    const mk=(px,py,c)=>{x.beginPath();x.arc(px,py,15,0,7);x.fillStyle=c;x.fill();x.lineWidth=5;x.strokeStyle='#fff';x.stroke();x.lineWidth=1.5;x.strokeStyle='rgba(0,0,0,.5)';x.stroke()};
    const a=(HSV[0]-90)*Math.PI/180,rm=(DISC.ro+DISC.ri)/2;mk(m+Math.cos(a)*rm,m+Math.sin(a)*rm,`hsl(${HSV[0]},100%,50%)`);mk(m-q+HSV[1]*2*q,m-q+(1-HSV[2])*2*q,PREF.color)}
  // Harmonien im Farbkreis nach Itten (Rot-Gelb-Blau), nicht im Bildschirm-Farbkreis
  const RYB=[[0,0],[30,60],[60,120],[120,180],[240,240],[280,300],[360,360]];
  const mapH=(h,a,b)=>{h=((h%360)+360)%360;for(let i=1;i<RYB.length;i++)if(h<=RYB[i][a]){const p=RYB[i-1],q=RYB[i];return p[b]+(q[b]-p[b])*(h-p[a])/((q[a]-p[a])||1)}return h};
  function harmCols(){const [h,s,v]=HSV,ry=mapH(h,0,1),off={komp:[180],analog:[-30,30],triade:[120,240],split:[150,210]}[PREF.harm]||[180];
    return [PREF.color,...off.map(o=>rgb2hex(...hsv2rgb(mapH(ry+o,1,0),Math.max(s,.35),Math.max(v,.45))))]}
  const mix=(c1,c2,k)=>{const a=hex2rgb(c1),b=hex2rgb(c2);return rgb2hex(...a.map((v,i)=>v+(b[i]-v)*k))};
  function colorPopUpd(keepHsv){const p=pop();if(!p||E.pop!=='color')return;if(!keepHsv)HSV=rgb2hsv(...hex2rgb(PREF.color));const T=PREF.colTab;
    p.querySelector('.skz-cmp b').style.background=PREF.color;const hx=p.querySelector('.skz-hex');if(hx&&D.activeElement!==hx)hx.value=PREF.color.toUpperCase();
    if(T==='klassisch'){const sv=p.querySelector('.skz-sv');sv.style.backgroundColor=`hsl(${HSV[0]},100%,50%)`;const i=sv.querySelector('i');i.style.left=(HSV[1]*100)+'%';i.style.top=((1-HSV[2])*100)+'%';i.style.background=PREF.color;
      const hi=p.querySelector('.skz-hue i');hi.style.left=(HSV[0]/360*100)+'%';hi.style.background=`hsl(${HSV[0]},100%,50%)`}
    if(T==='scheibe')drawDisc(p.querySelector('.skz-disc'));
    if(T==='werte'){const [r,g,b]=hex2rgb(PREF.color),vals={h:Math.round(HSV[0]),s:Math.round(HSV[1]*100),v:Math.round(HSV[2]*100),r,g,b};
      p.querySelectorAll('[data-cv]').forEach(el=>{if(D.activeElement!==el)el.value=vals[el.dataset.cv]});p.querySelectorAll('[data-cvo]').forEach(el=>el.textContent=vals[el.dataset.cvo]+(['s','v'].includes(el.dataset.cvo)?' %':el.dataset.cvo==='h'?'°':''))}
    if(T==='harmonie'){const H=harmCols();p.querySelector('.skz-harm').innerHTML=sw(H,'big');
      p.querySelector('.skz-harmt').textContent={komp:'Gegenüber im Farbkreis: der stärkste Kontrast.',analog:'Nachbarn im Farbkreis: ruhig und harmonisch.',triade:'Drei Farben mit gleichem Abstand: bunt, aber ausgewogen.',split:'Die zwei Nachbarn der Gegenfarbe: Kontrast, aber weicher.'}[PREF.harm];
      const c=PREF.color;p.querySelector('.skz-ramp1').innerHTML=sw([.8,.6,.4,.2].map(k=>mix(c,'#ffffff',k)).concat([c],[.2,.4,.6,.8].map(k=>mix(c,'#000000',k))),'ramp');
      const [r,g,b]=hex2rgb(c),gr=rgb2hex(...Array(3).fill(.299*r+.587*g+.114*b));p.querySelector('.skz-ramp2').innerHTML=sw([0,.2,.4,.6,.8,1].map(k=>mix(c,gr,k)),'ramp')}
    p.querySelectorAll('[data-col]').forEach(b=>b.classList.toggle('on',b.dataset.col===PREF.color&&!b.closest('.skz-cmp')))}
  function brushPop(){const p=pop();p.innerHTML=`<h3>Pinsel</h3>${PINSEL_GR.map(([g,L])=>`<h4>${g}</h4><div class="skz-brs two">${L.map(id=>`<button class="skz-br ${PREF.pinsel===id?'on':''}" data-br="${id}" title="${esc(BR[id].hint)}"><canvas width="300" height="80"></canvas><span><b>${BR[id].name}</b><small>${esc(BR[id].hint)}</small></span></button>`).join('')}</div>`).join('')}`;
    p.querySelectorAll('.skz-br').forEach(b=>{const c=b.querySelector('canvas'),x=ctx2(c);demoStroke(x,b.dataset.br,c.width,c.height)})}
  function demoStroke(x,id,cw,ch){const b=BR[id],col='#26337a',r0=Math.min(ch*.32,Math.max(3,sizePx(b,b.def)*.35));const pts=[];for(let i=0;i<=60;i++){const t=i/60;pts.push({x:14+t*(cw-28),y:ch/2+Math.sin(t*Math.PI*2)*ch*.22,p:Math.sin(t*Math.PI)*.9+.1})}
    const tmp=mkCanvas(cw,ch),tx=ctx2(tmp);const S=newStroke(id,col,tx,1,r0/Math.max(1,sizePx(b,b.def)));pts.forEach(q=>S.add(q.x,q.y,q.p,Math.PI/2,0));S.end();x.globalAlpha=b.op||1;x.drawImage(tmp,0,0);x.globalAlpha=1;freeCanvas(tmp)}
  function popLayers(){const p=pop();if(!p||E.pop!=='layers')return;const L=act();
    p.innerHTML=`<div class="skz-row" style="justify-content:space-between"><h3 style="margin:0">Ebenen</h3><button class="skz-b pri" data-k="l-add" ${E.layers.length>=MAX_LAYERS?'disabled':''}>${ico('plus',18)} Neue Ebene</button></div>
      <p>Oben liegt vorne. Tippe eine Ebene an, um auf ihr zu malen.</p>
      <div class="skz-lays">${E.layers.map((l,i)=>({l,i})).reverse().map(({l,i})=>`<div class="skz-lay ${i===E.act?'on':''}" data-li="${i}"><canvas width="128" height="96"></canvas><span>${esc(l.name)}${l.ref?' · Vorlage':''}<small>${Math.round(l.op*100)} %${l.blend!=='source-over'?' · '+BLENDS.find(b=>b[0]===l.blend)[1]:''}</small></span>${l.ref?ico('lock',18):''}<button class="skz-b" data-k="l-vis" data-li="${i}" title="Ein- oder ausblenden">${ico(l.vis?'eye':'eyeoff',20)}</button></div>`).join('')}</div>
      <h4>Diese Ebene: ${esc(L.name)}</h4>
      <div class="skz-row"><label style="flex:1">Deckkraft <input type="range" min="0" max="100" value="${Math.round(L.op*100)}" data-k="l-op" style="width:100%"></label></div>
      <div class="skz-row" style="margin:6px 0"><label>Modus</label><select class="skz-in" style="width:auto;padding:6px" data-k="l-blend">${BLENDS.map(([v,n])=>`<option value="${v}" ${L.blend===v?'selected':''}>${n}</option>`).join('')}</select>
        <label style="margin-left:auto;display:flex;align-items:center;gap:8px">Gesperrt <button class="skz-tg ${L.ref?'on':''}" data-k="l-ref"></button></label></div>
      <div class="skz-row" style="margin:6px 0"><label style="display:flex;align-items:center;gap:8px;flex:1">Transparenz schützen <button class="skz-tg ${L.lockA?'on':''}" data-k="l-lockA"></button></label></div>
      <p style="margin-top:0">Geschützt: Du malst nur dort, wo auf der Ebene schon etwas ist. Gut zum Schattieren innerhalb einer Form.</p>
      <div class="skz-grid2">
        <button class="skz-b" data-k="l-ren">${ico('text',18)}Umbenennen</button><button class="skz-b" data-k="l-up" ${E.act>=E.layers.length-1?'disabled':''}>${ico('up',18)}Nach oben</button><button class="skz-b" data-k="l-down" ${E.act<=0?'disabled':''}>${ico('down',18)}Nach unten</button><button class="skz-b" data-k="l-dup" ${E.layers.length>=MAX_LAYERS?'disabled':''}>${ico('dup',18)}Verdoppeln</button>
        <button class="skz-b" data-k="l-merge" ${E.act<=0?'disabled':''}>${ico('merge',18)}Mit unterer vereinen</button><button class="skz-b" data-k="l-fill">${ico('fuellen',18)}Mit Farbe füllen</button><button class="skz-b" data-k="l-clear">${ico('clear',18)}Leeren</button><button class="skz-b red" data-k="l-del" ${E.layers.length<=1?'disabled':''}>${ico('trash',18)}Löschen</button></div>`;
    p.querySelectorAll('.skz-lay canvas').forEach(c=>{const l=E.layers[+c.parentElement.dataset.li],x=ctx2(c),k=Math.min(c.width/w,c.height/h);x.drawImage(l.cv,(c.width-w*k)/2,(c.height-h*k)/2,w*k,h*k)})}
  function setPop(){const p=pop();const tg=(k,v)=>`<button class="skz-tg ${v?'on':''}" data-tg="${k}" aria-pressed="${!!v}"></button>`;
    p.innerHTML=`<h3>Einstellungen</h3>
      <div class="skz-opt"><span>Wer zeichnet?<br><small style="color:var(--muted)">${E.penSeen?'Apple Pencil erkannt.':'Noch kein Stift erkannt.'}</small></span>${seg('penOnly',[['auto','Auto'],['pen','Nur Stift'],['all','Stift + Finger']],PREF.penOnly)}</div>
      <p style="margin-top:2px">„Automatisch“: Sobald der Apple Pencil malt, verschiebt der Finger nur noch das Blatt (Handballen stört nicht).</p>
      <div class="skz-opt"><span>Druck des Stifts</span>${seg('curve',[['weich','Leicht'],['normal','Normal'],['fest','Fest']],PREF.curve)}</div>
      <div class="skz-opt"><span>Glättung der Linie</span><input type="range" min="0" max="100" value="${Math.round(PREF.smooth*100)}" data-rng="smooth"></div>
      <div class="skz-opt"><span>Spiegeln beim Zeichnen<br><small style="color:var(--muted)">Symmetrisch an der Mitte</small></span>${tg('sym',PREF.sym)}</div>
      <div class="skz-opt"><span>Raster</span>${seg('grid',[[0,'Aus'],[64,'Fein'],[128,'Mittel'],[256,'Grob']],PREF.grid)}</div>
      <div class="skz-opt"><span>Hilfslinien<br><small style="color:var(--muted)">${PREF.guide==='fp'?'Roten Punkt mit dem Stift verschieben. Gerade Linien rasten zum Fluchtpunkt ein.':'Drittel: für den Bildaufbau.'}</small></span>${seg('guide',[['aus','Aus'],['drittel','Drittel'],['fp','Fluchtpunkt']],PREF.guide)}</div>
      <div class="skz-opt"><span>Blatt drehen mit zwei Fingern</span>${tg('rotate',PREF.rotate)}</div>
      <div class="skz-opt"><span>Werkzeuge rechts (Linkshänder)</span>${tg('lefty',PREF.lefty)}</div>
      <h4>Papier</h4><div class="skz-sw">${PAPER.map(([c,n])=>`<button data-paper="${c}" title="${n}" style="background:${c};border-radius:10px;width:46px" class="${page.bg===c?'on':''}"></button>`).join('')}</div>
      <h4>Ansicht</h4><div class="skz-row"><button class="skz-b line" data-k="fit">${ico('fit',18)} Ganzes Blatt zeigen</button><button class="skz-b line" data-k="z100">100 %</button></div>
      <div class="skz-opt"><span>Ansicht spiegeln<br><small style="color:var(--muted)">Zeigt Fehler in Proportionen. Das Bild selbst bleibt gleich.</small></span><button class="skz-tg ${V.f<0?'on':''}" data-k="v-flip"></button></div>
      <div class="skz-opt"><span>Schwarz-weiß ansehen<br><small style="color:var(--muted)">Hell und Dunkel prüfen, ohne Farbe.</small></span><button class="skz-tg ${E.gray?'on':''}" data-k="v-gray"></button></div>
      <h4>Referenzbild</h4><p>Ein Bild schwebt neben deinem Blatt, zum Abzeichnen. Tippe darauf, um eine Farbe daraus zu nehmen.</p>
      <div class="skz-row" style="flex-wrap:wrap;gap:6px"><button class="skz-b line" data-k="ref-file">${ico('ref',18)} Bild vom iPad</button>${(app.pages||[]).filter(x=>x.id!==page.id&&x.thumb).slice(0,8).map(x=>`<button class="skz-b line" data-refp="${x.id}" title="${esc(x.title||'Blatt')}" style="padding:2px"><img alt="" style="width:56px;height:42px;object-fit:cover;border-radius:6px" src="${app.thumbUrl?app.thumbUrl(x):''}"></button>`).join('')}</div>`}
  function expPop(){const p=pop();p.innerHTML=`<h3>Exportieren</h3>
      <button class="skz-b line" style="width:100%;justify-content:flex-start;margin-bottom:8px" data-k="exp-png">${ico('img',20)} Als Bild sichern (PNG)</button>
      ${app.ctx.onShare?`<button class="skz-b line" style="width:100%;justify-content:flex-start;margin-bottom:8px" data-k="exp-send">${ico('send',20)} An meine Lehrkraft schicken</button>`:''}
      <p>Auf dem iPad öffnet sich das Teilen-Menü: „Bild sichern“ legt es in die Fotos. Die Ebenen bleiben im Skizzenbuch erhalten.</p>`}

  /* --- Anpassen: Farbton, Sättigung, Helligkeit, Kontrast, Weichzeichnen --- */
  // Vorschau mit CSS-Filter (schnell), beim Übernehmen rechnet ELIO die Pixel selbst (klappt auch in Safari)
  const ADJ=[['h','Farbton',-180,180,0,'°'],['s','Sättigung',0,200,100,' %'],['b','Helligkeit',0,200,100,' %'],['c','Kontrast',0,200,100,' %'],['bl','Weichzeichnen',0,40,0,' px']];
  function adjFilter(A){const f=[];if(A.h)f.push(`hue-rotate(${A.h}deg)`);if(A.s!==100)f.push(`saturate(${A.s}%)`);if(A.b!==100)f.push(`brightness(${A.b}%)`);if(A.c!==100)f.push(`contrast(${A.c}%)`);if(A.g)f.push('grayscale(1)');if(A.i)f.push('invert(1)');if(A.bl)f.push(`blur(${A.bl}px)`);return f.join(' ')}
  function adjPop(){const p=pop();if(!p||E.pop!=='adjust')return;const L=act();if(!E.adj||E.adj.L!==L){adjCancel();E.adj={L,h:0,s:100,b:100,c:100,bl:0,g:0,i:0}}const A=E.adj;
    p.innerHTML=`<h3>Anpassen</h3><p>Gilt für die Ebene „${esc(L.name)}“${E.sel?', nur in der Auswahl':''}.</p>
      <div class="skz-cv" style="grid-template-columns:98px 1fr 52px">${ADJ.map(([k,n,mi,ma,d,u])=>`<span>${n}</span><input type="range" min="${mi}" max="${ma}" value="${A[k]}" data-adj="${k}"><output data-adjo="${k}">${A[k]}${u}</output>`).join('')}</div>
      <div class="skz-row" style="margin-top:10px;gap:6px"><button class="skz-b line ${A.g?'on':''}" data-k="adj-g">Schwarz-weiß</button><button class="skz-b line ${A.i?'on':''}" data-k="adj-i">Umkehren</button></div>
      <div class="skz-row" style="justify-content:flex-end;margin-top:12px;gap:6px"><button class="skz-b line" data-k="adj-reset">Zurücksetzen</button><button class="skz-b pri" data-k="adj-ok">${ico('check',18)} Übernehmen</button></div>`;
    adjPreview()}
  function adjPreview(){const A=E.adj;if(!A)return;A.L.cv.style.filter=adjFilter(A)}
  function adjSet(k,v){const A=E.adj;if(!A)return;A[k]=v;const o=pop()&&pop().querySelector(`[data-adjo="${k}"]`);if(o){const u=ADJ.find(a=>a[0]===k);o.textContent=v+(u?u[5]:'')}adjPreview()}
  function adjReset(){if(!E.adj)return;Object.assign(E.adj,{h:0,s:100,b:100,c:100,bl:0,g:0,i:0});adjPop()}
  function adjCancel(){const A=E.adj;if(A){A.L.cv.style.filter='';E.adj=null}}
  function adjApply(){const A=E.adj;if(!A)return;const L=A.L;E.adj=null;closePop();
    if(!adjFilter(A))return;if(L.ref){L.cv.style.filter='';return toast('Diese Ebene ist gesperrt (Vorlage).')}
    // Vorschau bleibt sichtbar, bis das Ergebnis fertig gerechnet ist
    L.cv.style.filter=adjFilter(A);toast('Wird angewendet …');setTimeout(()=>{L.cv.style.filter='';if(!E.closed)adjBake(A,L)},40)}
  function adjBake(A,L){
    // nur den Bereich rechnen, in dem auf der Ebene etwas ist (schneller auf dem iPad)
    const m=Math.ceil(A.bl*3),cb=contentBox(L);if(!cb)return toast('Auf dieser Ebene ist noch nichts.');const sb=E.sel?E.sel.bb:cb,B={x:Math.max(0,sb.x-m),y:Math.max(0,sb.y-m)};B.w=Math.min(w,sb.x+sb.w+m)-B.x;B.h=Math.min(h,sb.y+sb.h+m)-B.y;
    const before=L.ctx.getImageData(B.x,B.y,B.w,B.h),im=new ImageData(new Uint8ClampedArray(before.data),B.w,B.h);adjPixels(im.data,A);if(A.bl)blurPx(im,A.bl);
    if(E.sel){const t=mkCanvas(B.w,B.h);ctx2(t).putImageData(im,0,0);L.ctx.save();L.ctx.clip(E.sel.p2d);L.ctx.clearRect(B.x,B.y,B.w,B.h);L.ctx.drawImage(t,B.x,B.y);L.ctx.restore();freeCanvas(t)}else L.ctx.putImageData(im,B.x,B.y);
    hpush(pxEntry(L,B.x,B.y,before,L.ctx.getImageData(B.x,B.y,B.w,B.h)));mark(L);toast('Angepasst. Rückgängig geht mit zwei Fingern.')}
  // Farbmatrizen wie in der CSS-Filter-Spezifikation
  function adjPixels(d,A){const ops=[];
    if(A.h){const r=A.h*Math.PI/180,c=Math.cos(r),s=Math.sin(r);ops.push([.213+c*.787-s*.213,.715-c*.715-s*.715,.072-c*.072+s*.928,0,.213-c*.213+s*.143,.715+c*.285+s*.14,.072-c*.072-s*.283,0,.213-c*.213-s*.787,.715-c*.715+s*.715,.072+c*.928+s*.072,0])}
    const sat=k=>[.213+.787*k,.715-.715*k,.072-.072*k,0,.213-.213*k,.715+.285*k,.072-.072*k,0,.213-.213*k,.715-.715*k,.072+.928*k,0];
    if(A.s!==100)ops.push(sat(A.s/100));if(A.b!==100){const k=A.b/100;ops.push([k,0,0,0,0,k,0,0,0,0,k,0])}if(A.c!==100){const k=A.c/100,o=.5-.5*k;ops.push([k,0,0,o,0,k,0,o,0,0,k,o])}
    if(A.g)ops.push([.2126,.7152,.0722,0,.2126,.7152,.0722,0,.2126,.7152,.0722,0]);if(A.i)ops.push([-1,0,0,1,0,-1,0,1,0,0,-1,1]);if(!ops.length)return;
    // alle Schritte zu einer Matrix zusammenfassen (Werte 0..255)
    let M=[1,0,0,0,0,1,0,0,0,0,1,0];for(const N of ops){const o=[];for(let r=0;r<3;r++){for(let c=0;c<3;c++)o.push(N[r*4]*M[c]+N[r*4+1]*M[4+c]+N[r*4+2]*M[8+c]);o.push(N[r*4]*M[3]+N[r*4+1]*M[7]+N[r*4+2]*M[11]+N[r*4+3])}M=o}
    const [a0,a1,a2,a3,b0,b1,b2,b3,c0,c1,c2,c3]=M,o0=a3*255,o1=b3*255,o2=c3*255;
    for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const r=d[i],g=d[i+1],b=d[i+2];d[i]=a0*r+a1*g+a2*b+o0;d[i+1]=b0*r+b1*g+b2*b+o1;d[i+2]=c0*r+c1*g+c2*b+o2}}
  // Weichzeichnen: dreimal Kastenfilter ≈ Gauß, mit vormultiplizierter Deckkraft (keine dunklen Ränder)
  function blurPx(im,sig){const W0=im.width,H0=im.height,d=im.data,n=W0*H0,ch=[0,1,2,3].map(()=>new Float32Array(n)),tmp=new Float32Array(Math.max(W0,H0));
    for(let i=0;i<n;i++){const a=d[i*4+3]/255;ch[3][i]=a;ch[0][i]=d[i*4]*a;ch[1][i]=d[i*4+1]*a;ch[2][i]=d[i*4+2]*a}
    const wi=Math.sqrt(12*sig*sig/3+1),wl=Math.floor(wi)-(Math.floor(wi)%2?0:1),wu=wl+2,mm=Math.round((12*sig*sig-3*wl*wl-12*wl-9)/(-4*wl-4));
    const pass=(a,len,cnt,stride,step,r)=>{const inv=1/(2*r+1);for(let l=0;l<cnt;l++){const o=l*stride;let acc=0;for(let k=-r;k<=r;k++)if(k>=0&&k<len)acc+=a[o+k*step];
        for(let k=0;k<len;k++){tmp[k]=acc*inv;const add=k+r+1,rem=k-r;if(add<len)acc+=a[o+add*step];if(rem>=0)acc-=a[o+rem*step]}for(let k=0;k<len;k++)a[o+k*step]=tmp[k]}};
    for(let it=0;it<3;it++){const r=Math.max(0,((it<mm?wl:wu)-1)/2|0);if(!r)continue;for(const a of ch){pass(a,W0,H0,W0,1,r);pass(a,H0,W0,1,W0,r)}}
    for(let i=0;i<n;i++){const a=ch[3][i];d[i*4+3]=a*255+.5;if(a>1e-4){d[i*4]=ch[0][i]/a;d[i*4+1]=ch[1][i]/a;d[i*4+2]=ch[2][i]/a}}}

  /* --- Referenzbild (schwebendes Fenster) --- */
  function refFile(){const i=D.createElement('input');i.type='file';i.accept='image/*';i.onchange=()=>{const f=i.files&&i.files[0];if(f)refOpen(f,f.name.replace(/\.[^.]+$/,''));closePop()};i.click()}
  async function refOpen(blob,title){refClose();let im;try{im=await blobImg(blob)}catch(e){toast('Dieses Bild konnte nicht geöffnet werden.');return}
    const k=Math.min(1,1200/Math.max(im.width,im.height)),c=mkCanvas(Math.round(im.width*k),Math.round(im.height*k));ctx2(c,true).drawImage(im,0,0,c.width,c.height);if(im.close)im.close();
    const st=stage.getBoundingClientRect(),bw=Math.min(320,st.width*.4),bh=bw*c.height/c.width+34,el=D.createElement('div');el.className='skz-ref';
    el.style.cssText=`left:${st.width-bw-14}px;top:14px;width:${bw}px;height:${Math.min(bh,st.height*.6)}px`;
    el.innerHTML=`<header><span>${esc(title||'Referenz')}</span><button class="skz-b" data-k="ref-x" title="Schließen">${ico('x',18)}</button></header><div class="im"></div><i></i>`;
    c.toBlob(b=>{if(!E.ref||E.ref.el!==el)return;E.ref.url=URL.createObjectURL(b);el.querySelector('.im').style.backgroundImage=`url(${E.ref.url})`});
    stage.appendChild(el);E.ref={el,c};
    el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();e.stopPropagation();const r=el.getBoundingClientRect(),s=stage.getBoundingClientRect(),x0=e.clientX,y0=e.clientY;
      const kind=e.target.tagName==='I'?'size':e.target.closest('header')?'move':'pick';let moved=false;
      const mv=ev=>{const dx=ev.clientX-x0,dy=ev.clientY-y0;if(Math.hypot(dx,dy)>6)moved=true;
        if(kind==='move'){el.style.left=clamp(r.left-s.left+dx,-r.width+60,s.width-60)+'px';el.style.top=clamp(r.top-s.top+dy,0,s.height-40)+'px'}
        if(kind==='size'){el.style.width=clamp(r.width+dx,140,s.width-20)+'px';el.style.height=clamp(r.height+dy,110,s.height-20)+'px'}
        if(kind==='pick')refPick(ev,false)};
      const up=ev=>{W.removeEventListener('pointermove',mv);W.removeEventListener('pointerup',up);W.removeEventListener('pointercancel',up);if(kind==='pick')refPick(ev,true)};
      W.addEventListener('pointermove',mv);W.addEventListener('pointerup',up);W.addEventListener('pointercancel',up);if(kind==='pick')refPick(e,false)})}
  function refPick(e,fin){const R0=E.ref;if(!R0)return;const box=R0.el.querySelector('.im').getBoundingClientRect(),c=R0.c,k=Math.min(box.width/c.width,box.height/c.height),ox=box.left+(box.width-c.width*k)/2,oy=box.top+(box.height-c.height*k)/2;
    const x=Math.floor((e.clientX-ox)/k),y=Math.floor((e.clientY-oy)/k);if(x<0||y<0||x>=c.width||y>=c.height)return;const d=ctx2(c,true).getImageData(x,y,1,1).data;if(d[3]<10)return;setColor(rgb2hex(d[0],d[1],d[2]),!fin)}
  function refClose(){const R0=E.ref;if(!R0)return;R0.el.remove();if(R0.url)URL.revokeObjectURL(R0.url);freeCanvas(R0.c);E.ref=null}

  /* --- Toast --- */
  let tt=0;function toast(t){let el=root.querySelector('.skz-toast');if(!el){el=D.createElement('div');el.className='skz-toast';el.setAttribute('role','status');root.appendChild(el)}el.textContent=t;clearTimeout(tt);tt=setTimeout(()=>el.remove(),3200)}
  E.toast=toast;

  /* =========== Striche =========== */
  // Ein Strich zeichnet Tupfer entlang der (geglätteten) Linie. Glatte und körnige Pinsel landen erst in einer eigenen Lage (sc)
  // und werden beim Absetzen mit ihrer Deckkraft auf die Ebene gelegt: so werden durchscheinende Striche in sich nicht fleckig.
  function newStroke(id,color,cx,scale=1,sizeK){const b=BR[id],sz=sizePx(b,sizeK!=null?sizeK*b.def:sizeOf(id))*scale,ek=id==='radierer'?PREF.eraseK:'',soft=ek==='weich';
    const S={id,b,bb:null,pts:[],n:0,last:null,rem:0,sm:null,t0:performance.now(),len:0};
    let pat=null,tip=null;if(b.type==='grain'){pat=grainPattern(cx,b.grain,color);if(b.grain==='grob'&&pat.setTransform&&W.DOMMatrix)pat.setTransform(new DOMMatrix().scale(1.6))}
    if(b.type==='tip')tip=tipCanvas(b.tip,color);if(soft)tip=tipCanvas('weich','#000000');if(ek==='korn')pat=grainPattern(cx,'grob','#000000');
    const sym=PREF.sym&&scale===1&&b.type!=='smudge';
    let seed=(Math.random()*2147483646|0)+1;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
    // Wischen: ein kleiner Puffer nimmt Farbe auf und trägt sie weiter (wie ein Finger)
    let sb=null,sbx=null,tm=null,tmx=null,msk=null,N=0;
    function smudge(x,y,r,a){const L=S.L;if(!L)return;
      if(!sb){N=Math.max(8,Math.ceil(sz*1.25));sb=mkCanvas(N,N);sbx=ctx2(sb);tm=mkCanvas(N,N);tmx=ctx2(tm);msk=tipCanvas('weich','#000000');sbx.drawImage(L.cv,x-r,y-r,2*r,2*r,0,0,N,N);return}
      tmx.globalCompositeOperation='copy';tmx.globalAlpha=1;tmx.drawImage(sb,0,0);tmx.globalCompositeOperation='destination-in';tmx.drawImage(msk,0,0,N,N);
      L.ctx.globalAlpha=clamp(a*S.k,0,1);L.ctx.drawImage(tm,0,0,N,N,x-r,y-r,2*r,2*r);
      tmx.globalCompositeOperation='copy';tmx.drawImage(L.cv,x-r,y-r,2*r,2*r,0,0,N,N);sbx.globalAlpha=.3;sbx.drawImage(tm,0,0);sbx.globalAlpha=1}
    S.k=1;
    function grow(x,y,r){r+=2;const B=S.bb;if(!B)S.bb={x0:x-r,y0:y-r,x1:x+r,y1:y+r};else{if(x-r<B.x0)B.x0=x-r;if(y-r<B.y0)B.y0=y-r;if(x+r>B.x1)B.x1=x+r;if(y+r>B.y1)B.y1=y+r}}
    function dab(x,y,r,a,ang){if(r<.3)r=.3;grow(x,y,r);if(sym)grow(w-x,y,r);
      const one=(X)=>{if(b.type==='path'){cx.globalAlpha=1;cx.fillStyle=color;if(b.cap==='chisel'){cx.save();cx.translate(X,y);cx.rotate(-.6);cx.fillRect(-r*.35,-r,r*.7,r*2);cx.restore()}
          else if(b.cap==='nib'){cx.save();cx.translate(X,y);cx.rotate(X===x?-Math.PI/4:Math.PI/4);cx.beginPath();cx.ellipse(0,0,r,Math.max(.6,r*.2),0,0,Math.PI*2);cx.fill();cx.restore()}else{cx.beginPath();cx.arc(X,y,r,0,Math.PI*2);cx.fill()}}
        else if(b.type==='splat'){cx.fillStyle=color;const n=2+Math.floor(rnd()*4);for(let i=0;i<n;i++){const an=rnd()*6.283,d=Math.pow(rnd(),.7)*r,rr=Math.max(.7,r*.028*(.4+rnd()*1.6)*(rnd()<.08?3.5:1));cx.globalAlpha=clamp(a*(.55+rnd()*.45),0,1);cx.beginPath();cx.arc(X+Math.cos(an)*d,y+Math.sin(an)*d,rr,0,6.283);cx.fill()}}
        else if(b.type==='smudge')smudge(X,y,r,a);
        else if(b.type==='grain'){cx.globalAlpha=clamp(a,0,1);cx.fillStyle=pat;cx.beginPath();cx.arc(X,y,r,0,Math.PI*2);cx.fill()}
        else if(b.type==='tip'){cx.globalAlpha=clamp(a,0,1);cx.drawImage(tip,X-r,y-r,r*2,r*2)}
        else if(b.type==='erase'){cx.globalAlpha=soft?.35:ek==='korn'?.5:1;if(soft)cx.drawImage(tip,X-r,y-r,r*2,r*2);else{cx.fillStyle=pat||'#000';cx.beginPath();cx.arc(X,y,r,0,Math.PI*2);cx.fill()}}};
      one(x);if(sym)one(w-x)}
    S.add=(x,y,p,alt,v)=>{p=clamp(p,.02,1);const tilt=b.tilt&&alt!=null?clamp((1.15-alt)/1.0,0,1):0;
      let r=sz/2*b.sz(p)*(1+2.6*tilt);if(b.taper&&S.len<sz*3&&!S.pen)r*=.35+.65*S.len/(sz*3);if(b.taper&&!S.pen&&v!=null)r*=clamp(1.15-v*.18,.35,1);
      const a=b.fl?b.fl(p)*(1-.5*tilt):1;
      // Glätten: der gezeichnete Punkt folgt dem Stift weich hinterher
      const s=clamp((b.smooth||0)*(PREF.smooth*1.6)*(S.pen?1:1.2),0,.9);if(!S.sm)S.sm={x,y,r,a};else{S.sm.x+=(x-S.sm.x)*(1-s);S.sm.y+=(y-S.sm.y)*(1-s);S.sm.r+=(r-S.sm.r)*(1-s*.6);S.sm.a+=(a-S.sm.a)*(1-s*.6)}
      S.pts.push({x,y,p,alt});to(S.sm.x,S.sm.y,S.sm.r,S.sm.a)};
    function to(x,y,r,a){const L=S.last;if(!L){dab(x,y,r,a);S.last={x,y,r,a};return}
      const dx=x-L.x,dy=y-L.y,d=Math.hypot(dx,dy);S.len+=d;const step=b.cap==='nib'?Math.max(.4,Math.min(r,L.r)*.12):b.type==='path'?Math.max(.5,Math.min(r,L.r)*.32):Math.max(.6,Math.min(r,L.r)*2*(b.sp||.15));
      let t=step-S.rem;while(t<=d){const k=t/d;dab(L.x+dx*k,L.y+dy*k,L.r+(r-L.r)*k,L.a+(a-L.a)*k);t+=step}S.rem=d-(t-step);S.last={x,y,r,a}}
    S.end=()=>{// Rest bis zum echten Endpunkt nachziehen
      const q=S.pts[S.pts.length-1];if(q&&S.sm){for(let i=1;i<=4;i++){const k=i/4;to(S.sm.x+(q.x-S.sm.x)*k,S.sm.y+(q.y-S.sm.y)*k,S.sm.r,S.sm.a)}}cx.globalAlpha=1;
      if(sb){freeCanvas(sb);freeCanvas(tm);sb=tm=null}};
    S.redrawLine=(x0,y0,x1,y1,p)=>{// für gerade Linien: alles neu als Gerade
      S.last=null;S.rem=0;S.sm=null;S.len=0;const n=Math.max(2,Math.ceil(Math.hypot(x1-x0,y1-y0)/2));for(let i=0;i<=n;i++){const k=i/n;const xx=x0+(x1-x0)*k,yy=y0+(y1-y0)*k;let r=sz/2*b.sz(p);const a=b.fl?b.fl(p):1;to(xx,yy,r,a)}};
    S.radius=sz/2;return S}

  // Zeichnen beginnen/fortsetzen/beenden
  let ST=null;// aktueller Strich
  function strokeBegin(pt,e){const id=brushId(),L=act();if(!L.vis){toast('Diese Ebene ist ausgeblendet. Blende sie ein, um darauf zu malen.');return false}
    if(L.ref){toast('Diese Ebene ist gesperrt (Vorlage). Wähle in „Ebenen“ eine andere Ebene.');return false}
    const erase=id==='radierer'||id==='wischen';const target=erase?L.ctx:sctx;
    if(erase){const k=bkCanvas(),x=ctx2(k);x.clearRect(0,0,w,h);x.drawImage(L.cv,0,0);L.ctx.save();L.ctx.globalCompositeOperation=id==='wischen'?(L.lockA?'source-atop':'source-over'):'destination-out';if(E.sel)L.ctx.clip(E.sel.p2d)}
    const S=newStroke(id,PREF.color,target);if(id==='wischen')S.k=opOf(id);S.pen=e.pointerType==='pen';S.erase=erase;S.L=L;S.start=pt;S.lastT=performance.now();S.lastPt=pt;S.hold=0;
    sc.style.opacity=erase?1:(BR[id].op||1)*opOf(id);sc.style.mixBlendMode=cssBlend(BR[id].blend||'source-over');sc.style.clipPath=E.sel?`path('${E.sel.d}')`:'';
    ST=S;S.add(pt.x,pt.y,pt.p,pt.alt,0);return true}
  function strokeMove(pts){const S=ST;if(!S)return;if(S.straight){const q=pts[pts.length-1];straightTo(S,q);return}
    for(const q of pts){const now=q.t||performance.now(),dt=Math.max(1,now-S.lastT),v=Math.hypot(q.x-S.lastPt.x,q.y-S.lastPt.y)*V.s/dt;S.add(q.x,q.y,q.p,q.alt,v);S.lastT=now;S.lastPt=q}
    // Stillhalten am Ende macht den Strich gerade (wie bei Procreate)
    clearTimeout(S.hold);const q=pts[pts.length-1];if(!S.erase&&S.len*V.s>60)S.hold=setTimeout(()=>{if(ST===S&&!S.straight){S.straight=true;S.sp=q.p;straightTo(S,S.lastPt);if(navigator.vibrate)try{navigator.vibrate(10)}catch(x){}}},650)}
  function straightTo(S,q){const B=S.bb;if(B)sctx.clearRect(B.x0-4,B.y0-4,B.x1-B.x0+8,B.y1-B.y0+8);S.bb=null;const e=snapEnd(S.start,q);
    S.redrawLine(S.start.x,S.start.y,e.x,e.y,S.sp||.6)}
  function strokeEnd(cancel){const S=ST;if(!S)return;ST=null;clearTimeout(S.hold);if(!S.straight)S.end();const L=S.L;
    if(cancel){if(S.erase){L.ctx.restore();L.ctx.globalCompositeOperation='source-over';L.ctx.clearRect(0,0,w,h);L.ctx.drawImage(bk,0,0)}else sctx.clearRect(0,0,w,h);return}
    const B=box(S.bb);if(S.erase){L.ctx.restore();if(B){const before=ctx2(bk).getImageData(B.x,B.y,B.w,B.h),after=L.ctx.getImageData(B.x,B.y,B.w,B.h);hpush(pxEntry(L,B.x,B.y,before,after));mark(L)}return}
    if(!B){sctx.clearRect(0,0,w,h);return}
    const before=L.ctx.getImageData(B.x,B.y,B.w,B.h);L.ctx.save();if(E.sel)L.ctx.clip(E.sel.p2d);L.ctx.globalAlpha=(S.b.op||1)*opOf(S.id);L.ctx.globalCompositeOperation=L.lockA?'source-atop':S.b.blend||'source-over';
    L.ctx.drawImage(sc,B.x,B.y,B.w,B.h,B.x,B.y,B.w,B.h);L.ctx.restore();sctx.clearRect(B.x,B.y,B.w,B.h);
    const after=L.ctx.getImageData(B.x,B.y,B.w,B.h);hpush(pxEntry(L,B.x,B.y,before,after));mark(L);page.n=(page.n||0)+1}
  function box(B){if(!B)return null;const x=Math.max(0,Math.floor(B.x0)),y=Math.max(0,Math.floor(B.y0)),x1=Math.min(w,Math.ceil(B.x1)),y1=Math.min(h,Math.ceil(B.y1));return x1>x&&y1>y?{x,y,w:x1-x,h:y1-y}:null}

  /* --- Formen und Linien --- */
  let SH=null;
  function shapeBegin(pt){const L=act();if(L.ref||!L.vis){toast(L.ref?'Diese Ebene ist gesperrt (Vorlage).':'Diese Ebene ist ausgeblendet.');return false}SH={a:pt,b:pt,L};sc.style.opacity=1;sc.style.mixBlendMode='normal';sc.style.clipPath=E.sel?`path('${E.sel.d}')`:'';return true}
  function shapeDraw(){const id=E.lastBrush||PREF.pinsel,b=BR[id];sctx.clearRect(0,0,w,h);let {a,b:q}=SH;
    if(PREF.formK==='linie'){q=snapEnd(a,q);
      const S=newStroke(id,PREF.color,sctx);S.redrawLine(a.x,a.y,q.x,q.y,.7);SH.bb=S.bb;sc.style.opacity=(b.op||1)*opOf(id);sc.style.mixBlendMode=cssBlend(b.blend||'source-over');return}
    const lw=Math.max(1,sizePx(b,sizeOf(id))*(b.type==='path'?b.sz(.7):.8));const x0=Math.min(a.x,q.x),y0=Math.min(a.y,q.y),x1=Math.max(a.x,q.x),y1=Math.max(a.y,q.y);
    sctx.save();sctx.lineWidth=lw;sctx.lineJoin='round';sctx.strokeStyle=sctx.fillStyle=PREF.color;sctx.beginPath();
    if(PREF.formK==='rect')sctx.rect(x0,y0,x1-x0,y1-y0);else if(PREF.formK==='ellipse')sctx.ellipse((x0+x1)/2,(y0+y1)/2,Math.max(.5,(x1-x0)/2),Math.max(.5,(y1-y0)/2),0,0,Math.PI*2);else{sctx.moveTo((x0+x1)/2,y0);sctx.lineTo(x1,y1);sctx.lineTo(x0,y1);sctx.closePath()}
    if(PREF.formFill)sctx.fill();sctx.stroke();sctx.restore();SH.bb={x0:x0-lw,y0:y0-lw,x1:x1+lw,y1:y1+lw};sc.style.opacity=opOf(id)}
  function shapeEnd(){if(!SH)return;const L=SH.L,B=box(SH.bb);const isLine=PREF.formK==='linie',id=E.lastBrush||PREF.pinsel,b=BR[id];SH=null;if(!B){sctx.clearRect(0,0,w,h);return}
    const before=L.ctx.getImageData(B.x,B.y,B.w,B.h);L.ctx.save();if(E.sel)L.ctx.clip(E.sel.p2d);L.ctx.globalAlpha=isLine?(b.op||1)*opOf(id):opOf(id);L.ctx.globalCompositeOperation=L.lockA?'source-atop':isLine?(b.blend||'source-over'):'source-over';L.ctx.drawImage(sc,B.x,B.y,B.w,B.h,B.x,B.y,B.w,B.h);L.ctx.restore();sctx.clearRect(0,0,w,h);
    hpush(pxEntry(L,B.x,B.y,before,L.ctx.getImageData(B.x,B.y,B.w,B.h)));mark(L);page.n=(page.n||0)+1}

  /* --- Füllen (Farbeimer) --- */
  function fill(pt){const L=act();if(L.ref||!L.vis){toast(L.ref?'Diese Ebene ist gesperrt (Vorlage).':'Diese Ebene ist ausgeblendet.');return}
    const x0=Math.floor(pt.x),y0=Math.floor(pt.y);if(x0<0||y0<0||x0>=w||y0>=h)return;
    let src;if(PREF.fillAll){const c=mkCanvas(w,h),x=ctx2(c,true);E.layers.forEach(l=>{if(!l.vis)return;x.globalAlpha=l.op;x.drawImage(l.cv,0,0)});src=x.getImageData(0,0,w,h).data;freeCanvas(c)}else src=L.ctx.getImageData(0,0,w,h).data;
    const i0=(y0*w+x0)*4,r0=src[i0],g0=src[i0+1],b0=src[i0+2],a0=src[i0+3],tol=PREF.fillTol;
    const same=i=>{const a=src[i+3];if(a0<8&&a<8)return true;return Math.abs(src[i]-r0)+Math.abs(src[i+1]-g0)+Math.abs(src[i+2]-b0)+Math.abs(a-a0)*1.2<=tol*2};
    const m=new Uint8Array(w*h),st=[x0,y0];let n=0,minX=x0,maxX=x0,minY=y0,maxY=y0;
    while(st.length){const y=st.pop(),x=st.pop();let l=x;while(l>0&&!m[y*w+l-1]&&same((y*w+l-1)*4))l--;let r=x;while(r<w-1&&!m[y*w+r+1]&&same((y*w+r+1)*4))r++;
      if(m[y*w+l]&&l===r)continue;for(let i=l;i<=r;i++){m[y*w+i]=1;n++}if(l<minX)minX=l;if(r>maxX)maxX=r;if(y<minY)minY=y;if(y>maxY)maxY=y;
      for(const yy of [y-1,y+1]){if(yy<0||yy>=h)continue;let inR=false;for(let i=l;i<=r;i++){const k=yy*w+i;const ok=!m[k]&&same(k*4);if(ok&&!inR){st.push(i,yy);inR=true}else if(!ok)inR=false}}}
    if(!n)return;
    // 2 Pixel weiter füllen, damit an Linien keine hellen Ränder bleiben
    minX=Math.max(0,minX-2);minY=Math.max(0,minY-2);maxX=Math.min(w-1,maxX+2);maxY=Math.min(h-1,maxY+2);const bw=maxX-minX+1,bh=maxY-minY+1;
    const mk=mkCanvas(bw,bh),mx=ctx2(mk),id=mx.createImageData(bw,bh),d=id.data,[cr,cg,cb]=hex2rgb(PREF.color);
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){let on=m[y*w+x];if(!on){for(let dy=-2;dy<=2&&!on;dy++)for(let dx=-2;dx<=2;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<w&&Y<h&&m[Y*w+X]){on=1;break}}}
      if(on){const k=((y-minY)*bw+(x-minX))*4;d[k]=cr;d[k+1]=cg;d[k+2]=cb;d[k+3]=255}}
    mx.putImageData(id,0,0);const before=L.ctx.getImageData(minX,minY,bw,bh);L.ctx.save();if(E.sel)L.ctx.clip(E.sel.p2d);if(L.lockA)L.ctx.globalCompositeOperation='source-atop';L.ctx.drawImage(mk,minX,minY);L.ctx.restore();freeCanvas(mk);
    hpush(pxEntry(L,minX,minY,before,L.ctx.getImageData(minX,minY,bw,bh)));mark(L);page.n=(page.n||0)+1}

  /* --- Pipette --- */
  function pick(pt,fin){const x=Math.floor(pt.x),y=Math.floor(pt.y);if(x<0||y<0||x>=w||y>=h)return;const c=mkCanvas(1,1),cx=ctx2(c,true);cx.fillStyle=page.bg||'#fff';cx.fillRect(0,0,1,1);
    E.layers.forEach(l=>{if(!l.vis)return;cx.globalAlpha=l.op;cx.globalCompositeOperation=l.blend;cx.drawImage(l.cv,x,y,1,1,0,0,1,1)});const d=cx.getImageData(0,0,1,1).data;setColor(rgb2hex(d[0],d[1],d[2]),!fin);
    const s=toScr(pt.x,pt.y);cur.style.display='block';cur.style.left=s.x+'px';cur.style.top=s.y+'px';cur.style.width=cur.style.height='54px';cur.style.background=PREF.color;cur.style.border='4px solid #fff';
    if(fin){setTimeout(()=>{cur.style.display='none';cur.style.background='';cur.style.border=''},250)}}

  /* --- Auswahl --- */
  let SEL=null;
  function selBegin(pt){setSel(null);SEL={k:PREF.selK,pts:[pt],a:pt};drawAnts()}
  function selMove(pt){if(!SEL)return;if(SEL.k==='lasso')SEL.pts.push(pt);else SEL.b=pt;drawAnts()}
  function selPath(S){if(S.k==='rect'){const b=S.b||S.a,x0=Math.min(S.a.x,b.x),y0=Math.min(S.a.y,b.y),x1=Math.max(S.a.x,b.x),y1=Math.max(S.a.y,b.y);return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`}
    return 'M'+S.pts.map(p=>p.x.toFixed(1)+' '+p.y.toFixed(1)).join('L')+'Z'}
  function drawAnts(){const d=SEL?selPath(SEL):E.sel?E.sel.d:'';ants.innerHTML=d?`<path d="${d}"/>`:''}
  function selEnd(){if(!SEL)return;const d=selPath(SEL);let xs,ys;if(SEL.k==='rect'){const b=SEL.b||SEL.a;xs=[SEL.a.x,b.x];ys=[SEL.a.y,b.y]}else{xs=SEL.pts.map(p=>p.x);ys=SEL.pts.map(p=>p.y)}
    const bb={x:Math.max(0,Math.floor(Math.min(...xs))),y:Math.max(0,Math.floor(Math.min(...ys)))};bb.w=Math.min(w,Math.ceil(Math.max(...xs)))-bb.x;bb.h=Math.min(h,Math.ceil(Math.max(...ys)))-bb.y;SEL=null;
    if(bb.w<6||bb.h<6){setSel(null);return}setSel({d,p2d:new Path2D(d),bb})}
  function setSel(s){E.sel=s;drawAnts();ctxBarUpd()}
  function selDelete(){const L=act(),s=E.sel;if(!s||L.ref)return;const B=s.bb,before=L.ctx.getImageData(B.x,B.y,B.w,B.h);L.ctx.save();L.ctx.clip(s.p2d);L.ctx.clearRect(B.x,B.y,B.w,B.h);L.ctx.restore();hpush(pxEntry(L,B.x,B.y,before,L.ctx.getImageData(B.x,B.y,B.w,B.h)));mark(L)}
  function selCopy(){const L=act(),s=E.sel;if(!s)return;if(E.layers.length>=MAX_LAYERS){toast('Höchstens '+MAX_LAYERS+' Ebenen. Vereine oder lösche zuerst eine Ebene.');return}
    const N=mkLayer({name:'Kopie'});N.ctx.save();N.ctx.clip(s.p2d);N.ctx.drawImage(L.cv,0,0);N.ctx.restore();addLayer(N,E.act+1);setTool('transform')}

  /* --- Verschieben / Transformieren --- */
  function contentBox(L){const d=L.ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y+=1){const o=y*w*4;for(let x=0;x<w;x++)if(d[o+x*4+3]>4){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
    return x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}}
  function startFloat(){if(E.fl)return;const L=act();if(L.ref){toast('Die Vorlage ist gesperrt. Entsperre sie in „Ebenen“, um sie zu verschieben.');return}if(!L.vis)return;
    const s=E.sel,bb=s?s.bb:contentBox(L);if(!bb){toast('Auf dieser Ebene ist noch nichts, was man verschieben kann.');ctxBarUpd();return}
    const before=L.ctx.getImageData(0,0,w,h),cv=mkCanvas(bb.w,bb.h),x=ctx2(cv);x.save();x.translate(-bb.x,-bb.y);if(s)x.clip(s.p2d);x.drawImage(L.cv,0,0);x.restore();
    L.ctx.save();if(s)L.ctx.clip(s.p2d);L.ctx.clearRect(bb.x,bb.y,bb.w,bb.h);L.ctx.restore();cv.className='skz-float';cv.style.opacity=L.op;
    E.fl={L,cv,before,cx:bb.x+bb.w/2,cy:bb.y+bb.h/2,sx:1,sy:1,r:0,w:bb.w,h:bb.h,free:false};setSel(null);syncLayers();flView();ctxBarUpd();changed()}
  function flView(){const F=E.fl;if(!F)return;F.cv.style.transform=`translate(${F.cx}px,${F.cy}px) rotate(${F.r}rad) scale(${F.sx},${F.sy}) translate(${-F.w/2}px,${-F.h/2}px)`;drawHud()}
  function flCorners(){const F=E.fl,c=Math.cos(F.r),s=Math.sin(F.r);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const lx=a*F.w/2*F.sx,ly=b*F.h/2*F.sy;return {x:F.cx+lx*c-ly*s,y:F.cy+lx*s+ly*c}})}
  function flRot(){const F=E.fl,c=Math.cos(F.r),s=Math.sin(F.r),ly=-(F.h/2*Math.abs(F.sy))-36/V.s;return {x:F.cx-ly*s,y:F.cy+ly*c}}
  function drawHud(){if(!E.fl){hud.innerHTML='';return}const cs=flCorners().map(p=>toScr(p.x,p.y)),ro=toScr(...Object.values(flRot())),top=toScr((flCorners()[0].x+flCorners()[1].x)/2,(flCorners()[0].y+flCorners()[1].y)/2);
    hud.innerHTML=`<svg><polygon points="${cs.map(p=>p.x+','+p.y).join(' ')}"/><line x1="${top.x}" y1="${top.y}" x2="${ro.x}" y2="${ro.y}"/></svg>${cs.map((p,i)=>`<i class="h" data-h="${i}" style="left:${p.x}px;top:${p.y}px"></i>`).join('')}<i class="h rot" style="left:${ro.x}px;top:${ro.y}px"></i>`}
  function inPoly(p,P){let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){if(((P[i].y>p.y)!==(P[j].y>p.y))&&(p.x<(P[j].x-P[i].x)*(p.y-P[i].y)/(P[j].y-P[i].y)+P[i].x))c=!c}return c}
  let FD=null;
  function flDown(sx,sy){const F=E.fl;if(!F)return false;const cs=flCorners().map(p=>toScr(p.x,p.y)),ro=toScr(...Object.values(flRot()));const pt=toDoc(sx,sy);
    if(Math.hypot(ro.x-sx,ro.y-sy)<26){FD={k:'rot',a0:Math.atan2(pt.y-F.cy,pt.x-F.cx),r0:F.r};return true}
    for(let i=0;i<4;i++)if(Math.hypot(cs[i].x-sx,cs[i].y-sy)<26){FD={k:'scale',d0:Math.hypot(pt.x-F.cx,pt.y-F.cy),sx0:F.sx,sy0:F.sy};return true}
    if(inPoly({x:sx,y:sy},cs)){FD={k:'move',p0:pt,cx0:F.cx,cy0:F.cy};return true}FD=null;return true}
  function flMove(sx,sy){const F=E.fl;if(!F||!FD)return;const pt=toDoc(sx,sy);
    if(FD.k==='move'){F.cx=FD.cx0+pt.x-FD.p0.x;F.cy=FD.cy0+pt.y-FD.p0.y}
    if(FD.k==='rot'){let r=FD.r0+Math.atan2(pt.y-F.cy,pt.x-F.cx)-FD.a0;const st=Math.PI/12,sn=Math.round(r/st)*st;if(Math.abs(r-sn)<.05)r=sn;F.r=r}
    if(FD.k==='scale'){if(F.free){const c=Math.cos(-F.r),s=Math.sin(-F.r),lx=(pt.x-F.cx)*c-(pt.y-F.cy)*s,ly=(pt.x-F.cx)*s+(pt.y-F.cy)*c;F.sx=Math.sign(FD.sx0)*Math.max(.02,Math.abs(lx)/(F.w/2));F.sy=Math.sign(FD.sy0)*Math.max(.02,Math.abs(ly)/(F.h/2))}
      else{const k=Math.max(.02,Math.hypot(pt.x-F.cx,pt.y-F.cy)/Math.max(1,FD.d0));F.sx=FD.sx0*k;F.sy=FD.sy0*k}}
    flView()}
  function commitFloat(){const F=E.fl;if(!F)return;E.fl=null;const L=F.L,x=L.ctx;x.save();x.imageSmoothingQuality='high';x.translate(F.cx,F.cy);x.rotate(F.r);x.scale(F.sx,F.sy);x.drawImage(F.cv,-F.w/2,-F.h/2);x.restore();
    const after=x.getImageData(0,0,w,h);F.cv.remove();freeCanvas(F.cv);hpush(pxEntry(L,0,0,F.before,after));mark(L);drawHud();syncLayers();if(E.tool==='transform')backFromT();ctxBarUpd()}
  function backFromT(){const b=E.beforeT;E.tool=null;setTool(b&&!['text','transform','pipette','bild'].includes(b)?b:'pinsel')}
  function cancelFloat(){const F=E.fl;if(!F)return;E.fl=null;F.L.ctx.putImageData(F.before,0,0);F.cv.remove();freeCanvas(F.cv);drawHud();syncLayers();if(E.tool==='transform')backFromT();changed()}
  E.commitFloat=commitFloat;

  /* --- Ebenen-Aktionen (mit Rückgängig) --- */
  function addLayer(N,at){E.layers.splice(at,0,N);E.act=at;mark(N);hpush({bytes:w*h*4,undo(){const i=E.layers.indexOf(N);if(i>=0)E.layers.splice(i,1);E.act=clamp(E.act,0,E.layers.length-1);E.metaDirty=true},redo(){E.layers.splice(at,0,N);E.act=at;mark(N)}});syncLayers()}
  E.addLayer=addLayer;E.mkLayer=mkLayer;
  function layerAct(k,val){const L=act(),i=E.act;
    if(k==='l-add'){if(E.layers.length>=MAX_LAYERS)return toast('Höchstens '+MAX_LAYERS+' Ebenen.');addLayer(mkLayer({name:'Ebene '+(E.layers.length+1)}),i+1)}
    if(k==='l-dup'){if(E.layers.length>=MAX_LAYERS)return toast('Höchstens '+MAX_LAYERS+' Ebenen.');const N=mkLayer({name:L.name+' Kopie',op:L.op,blend:L.blend});N.ctx.drawImage(L.cv,0,0);addLayer(N,i+1)}
    if(k==='l-up'||k==='l-down'){const j=k==='l-up'?i+1:i-1;if(j<0||j>=E.layers.length)return;const sw=()=>{[E.layers[i],E.layers[j]]=[E.layers[j],E.layers[i]];E.metaDirty=true};sw();E.act=j;hpush({undo(){sw();E.act=i},redo(){sw();E.act=j}});syncLayers()}
    if(k==='l-del'){if(E.layers.length<=1)return;E.layers.splice(i,1);E.act=Math.max(0,i-1);E.metaDirty=true;hpush({bytes:w*h*4,undo(){E.layers.splice(i,0,L);E.act=i;mark(L)},redo(){E.layers.splice(i,1);E.act=Math.max(0,i-1);E.metaDirty=true}});syncLayers()}
    if(k==='l-fill'){if(L.ref)return toast('Diese Ebene ist gesperrt (Vorlage).');const before=L.ctx.getImageData(0,0,w,h);L.ctx.save();if(E.sel)L.ctx.clip(E.sel.p2d);if(L.lockA)L.ctx.globalCompositeOperation='source-atop';L.ctx.fillStyle=PREF.color;L.ctx.fillRect(0,0,w,h);L.ctx.restore();hpush(pxEntry(L,0,0,before,L.ctx.getImageData(0,0,w,h)));mark(L);page.n=(page.n||0)+1}
    if(k==='l-clear'){const before=L.ctx.getImageData(0,0,w,h);L.ctx.clearRect(0,0,w,h);hpush(pxEntry(L,0,0,before,L.ctx.getImageData(0,0,w,h)));mark(L)}
    if(k==='l-merge'){if(i<=0)return;const B=E.layers[i-1],before=B.ctx.getImageData(0,0,w,h);B.ctx.save();B.ctx.globalAlpha=L.op;B.ctx.globalCompositeOperation=L.blend;if(L.vis)B.ctx.drawImage(L.cv,0,0);B.ctx.restore();const after=B.ctx.getImageData(0,0,w,h);
      E.layers.splice(i,1);E.act=i-1;mark(B);hpush({bytes:w*h*8,undo(){B.ctx.putImageData(before,0,0);E.layers.splice(i,0,L);E.act=i;mark(B);mark(L)},redo(){B.ctx.putImageData(after,0,0);E.layers.splice(i,1);E.act=i-1;mark(B)}});syncLayers()}
    if(k==='l-vis'||k==='l-op'||k==='l-blend'||k==='l-ref'||k==='l-ren'||k==='l-lockA'){const T=k==='l-vis'?E.layers[val]:L,o={vis:T.vis,op:T.op,blend:T.blend,ref:T.ref,name:T.name,lockA:T.lockA};
      if(k==='l-vis')T.vis=!T.vis;if(k==='l-lockA')T.lockA=!T.lockA;if(k==='l-op')T.op=clamp(val/100,0,1);if(k==='l-blend')T.blend=val;if(k==='l-ref')T.ref=!T.ref;if(k==='l-ren'){const n=prompt('Name der Ebene',T.name);if(n==null)return;T.name=n.trim().slice(0,40)||T.name}
      const n={vis:T.vis,op:T.op,blend:T.blend,ref:T.ref,name:T.name,lockA:T.lockA};E.metaDirty=true;
      const last=H.st[H.i-1];if(k==='l-op'&&last&&last.opOf===T&&H.i===H.st.length){last.n=n}else hpush({opOf:k==='l-op'?T:null,n,undo(){Object.assign(T,o);E.metaDirty=true},redo(){Object.assign(T,this.n);E.metaDirty=true}});syncLayers()}
    if(E.pop==='layers'&&k!=='l-op')popLayers()}

  /* --- Text --- */
  const FONTS={baloo:['Rund','"Baloo 2",system-ui'],nunito:['Klar','Nunito,system-ui'],serif:['Buch','Georgia,"Times New Roman",serif'],hand:['Handschrift','"Bradley Hand","Segoe Print","Comic Sans MS",cursive'],mono:['Schreibmaschine','"Courier New",monospace']};
  function openText(pt){closeText();const L=act();const box=D.createElement('div');box.className='skz-pop skz-txt';E.txt={pt,box};
    box.innerHTML=`<h3>Text einfügen</h3><textarea class="skz-in" maxlength="400" placeholder="Dein Text"></textarea>
      <h4>Schrift</h4><div class="skz-ch">${Object.entries(FONTS).map(([k,[n,f]])=>`<button data-font="${k}" class="${PREF.textFont===k?'on':''}" style="font-family:${f.replace(/"/g,'&quot;')}">${n}</button>`).join('')}</div>
      <h4>Größe</h4><input type="range" min="24" max="320" value="${PREF.textSize||96}" data-rng="textSize" style="width:100%">
      <div class="skz-row" style="justify-content:flex-end;margin-top:12px"><button class="skz-b line" data-k="txt-x">Abbrechen</button><button class="skz-b pri" data-k="txt-ok">${ico('check',18)} Einfügen</button></div>
      <p>Der Text kommt auf eine eigene Ebene. Danach kannst du ihn verschieben und drehen.</p>`;
    stage.appendChild(box);setTimeout(()=>box.querySelector('textarea').focus(),50)}
  function closeText(){if(E.txt){E.txt.box.remove();E.txt=null}}
  function placeText(){const t=E.txt;if(!t)return;const s=t.box.querySelector('textarea').value.replace(/\s+$/,'');if(!s){closeText();return}
    if(E.layers.length>=MAX_LAYERS){toast('Höchstens '+MAX_LAYERS+' Ebenen. Vereine oder lösche zuerst eine Ebene.');return}
    const N=mkLayer({name:'Text: '+s.split('\n')[0].slice(0,18)}),x=N.ctx,sz=PREF.textSize||96,f=FONTS[PREF.textFont]||FONTS.baloo;x.font=`700 ${sz}px ${f[1]}`;x.fillStyle=PREF.color;x.textBaseline='top';
    s.split('\n').forEach((l,i)=>x.fillText(l,t.pt.x,t.pt.y+i*sz*1.18));closeText();addLayer(N,E.act+1);page.n=(page.n||0)+1;setTool('transform')}

  /* --- Bild einfügen --- */
  function pickImage(){const i=D.createElement('input');i.type='file';i.accept='image/*';i.onchange=async()=>{const f=i.files&&i.files[0];if(!f)return;
      if(E.layers.length>=MAX_LAYERS){toast('Höchstens '+MAX_LAYERS+' Ebenen. Vereine oder lösche zuerst eine Ebene.');return}
      try{const im=await blobImg(f),iw=im.width,ih=im.height,k=Math.min(1,w*.8/iw,h*.8/ih),N=mkLayer({name:'Bild'});N.ctx.imageSmoothingQuality='high';N.ctx.drawImage(im,(w-iw*k)/2,(h-ih*k)/2,iw*k,ih*k);if(im.close)im.close();
        if(E.fl)commitFloat();setSel(null);addLayer(N,E.act+1);setTool('transform');toast('Bild eingefügt. Ziehe an den Ecken, um es größer oder kleiner zu machen.')}
      catch(e){toast('Dieses Bild konnte nicht geöffnet werden.')}};i.click()}

  /* =========== Eingabe: Stift, Finger, Maus =========== */
  const PT=new Map();let G=null,mode=null,ptrId=null,sRect=null,spaceDown=false,penSince=0;
  E.penSeen=false;
  const penOnly=()=>PREF.penOnly==='pen'||(PREF.penOnly==='auto'&&E.penSeen);
  function evPt(e){const a=e.altitudeAngle!=null?e.altitudeAngle:(e.tiltX||e.tiltY)?Math.atan(1/Math.max(1e-3,Math.hypot(Math.tan((e.tiltX||0)*Math.PI/180),Math.tan((e.tiltY||0)*Math.PI/180)))):Math.PI/2;
    const p=toDoc(e.clientX-sRect.left,e.clientY-sRect.top);p.p=e.pointerType==='pen'?curve(e.pressure||.02):e.pointerType==='touch'&&e.pressure>0&&e.pressure!==.5&&e.pressure!==1?curve(e.pressure):.62;p.alt=e.pointerType==='pen'?a:null;p.t=e.timeStamp;return p}
  let GR=null;
  function gradDraw(){const {a,b}=GR,c=PREF.color,c2=PREF.gradEnd==='zweit'?prevCol():hexA(c,0);sctx.clearRect(0,0,w,h);
    const g=PREF.gradK==='radial'?sctx.createRadialGradient(a.x,a.y,0,a.x,a.y,Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))):sctx.createLinearGradient(a.x,a.y,b.x,b.y);g.addColorStop(0,c);g.addColorStop(1,c2);sctx.fillStyle=g;sctx.fillRect(0,0,w,h);
    sctx.save();sctx.lineWidth=3/V.s;sctx.strokeStyle='#fff';sctx.setLineDash([10/V.s,8/V.s]);sctx.beginPath();sctx.moveTo(a.x,a.y);sctx.lineTo(b.x,b.y);sctx.stroke();sctx.restore()}
  function gradEnd(cancel){const G0=GR;GR=null;if(!G0)return;sctx.clearRect(0,0,w,h);if(cancel||Math.hypot(G0.b.x-G0.a.x,G0.b.y-G0.a.y)*V.s<8)return;GR=G0;
    const {a,b}=G0,c=PREF.color,c2=PREF.gradEnd==='zweit'?prevCol():hexA(c,0);const L=G0.L,x=L.ctx,before=x.getImageData(0,0,w,h);
    const g=PREF.gradK==='radial'?x.createRadialGradient(a.x,a.y,0,a.x,a.y,Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))):x.createLinearGradient(a.x,a.y,b.x,b.y);g.addColorStop(0,c);g.addColorStop(1,c2);
    x.save();if(E.sel)x.clip(E.sel.p2d);if(L.lockA)x.globalCompositeOperation='source-atop';x.fillStyle=g;x.fillRect(0,0,w,h);x.restore();GR=null;
    hpush(pxEntry(L,0,0,before,x.getImageData(0,0,w,h)));mark(L);page.n=(page.n||0)+1}
  function toolDown(e){const pt=evPt(e),t=E.tool;
    if(PREF.guide==='fp'){const v=vpGet(),q=toScr(v.x,v.y);if(Math.hypot(q.x-(e.clientX-sRect.left),q.y-(e.clientY-sRect.top))<30){mode='vp';return}}
    if(t==='fuellen'&&PREF.fillK==='verlauf'){const L=act();if(L.ref||!L.vis){toast(L.ref?'Diese Ebene ist gesperrt (Vorlage).':'Diese Ebene ist ausgeblendet.');return}
      GR={a:pt,b:pt,L};sc.style.opacity=1;sc.style.mixBlendMode='normal';sc.style.clipPath=E.sel?`path('${E.sel.d}')`:'';mode='grad';return}
    if(['pinsel','bleistift','radierer','marker','wischen'].includes(t)){if(strokeBegin(pt,e))mode='stroke';return}
    if(t==='form'){if(shapeBegin(pt)){mode='shape'}return}
    if(t==='fuellen'){fill(pt);mode='none';return}
    if(t==='pipette'){pick(pt,false);mode='pick';return}
    if(t==='text'){openText(pt);mode='none';return}
    if(t==='auswahl'){selBegin(pt);mode='sel';return}
    if(t==='transform'){if(!E.fl)startFloat();if(E.fl&&flDown(e.clientX-sRect.left,e.clientY-sRect.top))mode='fl';return}}
  function toolMove(e){if(mode==='stroke'){const evs=e.getCoalescedEvents?e.getCoalescedEvents():[];strokeMove((evs.length?evs:[e]).map(evPt));return}
    const pt=evPt(e);if(mode==='vp'){page.vp={x:clamp(pt.x,0,w),y:clamp(pt.y,0,h)};drawGuide();return}if(mode==='grad'){GR.b=pt;gradDraw();return}if(mode==='shape'){SH.b=pt;shapeDraw()}else if(mode==='pick')pick(pt,false);else if(mode==='sel')selMove(pt);else if(mode==='fl')flMove(e.clientX-sRect.left,e.clientY-sRect.top)}
  function toolUp(e,cancel){if(mode==='vp'){E.metaDirty=true;queueSave()}if(mode==='grad')gradEnd(cancel);if(mode==='stroke')strokeEnd(cancel);else if(mode==='shape'){if(cancel){SH=null;sctx.clearRect(0,0,w,h)}else shapeEnd()}
    else if(mode==='pick'){if(!cancel)pick(evPt(e),true);setTool(E.prevTool||'pinsel')}else if(mode==='sel'){if(cancel){SEL=null;drawAnts()}else selEnd()}else if(mode==='fl'){FD=null;}mode=null}
  // Zwei Finger: verschieben, zoomen, drehen. Kurzer Tipp mit zwei Fingern = rückgängig, drei Finger = wiederholen
  function gStart(){const ps=[...PT.values()].filter(p=>p.type==='touch');if(!ps.length)return;const o=G&&!G.pan?G:null;G={v0:{...V},t0:o?o.t0:performance.now(),max:Math.max(o?o.max:0,ps.length),moved:o?o.moved:false,p0:ps.map(p=>({id:p.id,x:p.x,y:p.y}))}}
  function gMove(){if(!G)return;const ps=[...PT.values()].filter(p=>p.type==='touch'),a=G.p0.map(q=>({q,c:PT.get(q.id)})).filter(o=>o.c);if(!a.length)return;
    if(a.some(o=>Math.hypot(o.c.x-o.q.x,o.c.y-o.q.y)>10))G.moved=true;const v0=G.v0;
    if(a.length===1){const o=a[0];V.x=v0.x+o.c.x-o.q.x;V.y=v0.y+o.c.y-o.q.y;V.s=v0.s;V.r=v0.r;applyView();return}
    const [A,B]=a,m0={x:(A.q.x+B.q.x)/2,y:(A.q.y+B.q.y)/2},m={x:(A.c.x+B.c.x)/2,y:(A.c.y+B.c.y)/2};
    const d0=Math.hypot(B.q.x-A.q.x,B.q.y-A.q.y),d=Math.hypot(B.c.x-A.c.x,B.c.y-A.c.y),k=d0>10?d/d0:1;
    let dr=PREF.rotate?Math.atan2(B.c.y-A.c.y,B.c.x-A.c.x)-Math.atan2(B.q.y-A.q.y,B.q.x-A.q.x):0;
    // Doc-Punkt unter der alten Mitte bleibt unter den Fingern
    Object.assign(V,v0);const P0=toDoc(m0.x,m0.y);V.s=clamp(v0.s*k,zMin(),zMax());let r=v0.r+dr;const tw=Math.PI*2,rn=((r%tw)+tw)%tw;if(Math.min(rn,tw-rn)<.09)r=Math.round(r/tw)*tw;
    if(Math.abs(rn-Math.PI/2)<.06)r+=Math.PI/2-rn;else if(Math.abs(rn-Math.PI)<.06)r+=Math.PI-rn;else if(Math.abs(rn-3*Math.PI/2)<.06)r+=3*Math.PI/2-rn;
    V.r=r;const q=toScr(P0.x,P0.y);V.x+=m.x-q.x;V.y+=m.y-q.y;applyView();if(G.moved)zoomHint()}
  function gEnd(){if(!G)return;const ps=[...PT.values()].filter(p=>p.type==='touch');if(ps.length){gStart();return}
    const dt=performance.now()-G.t0;if(!G.moved&&dt<320){if(G.max===2){const n=performance.now();if(n-(E.tap2||0)<500){E.tap2=0;redo();fit();zoomHint()}else{E.tap2=n;undo()}}else if(G.max>=3)redo()}G=null}
  let LP=0;// langes Drücken mit dem Finger = Pipette
  function onDown(e){if(E.closed)return;if(e.target.closest('.skz-ctx,.skz-pop,.skz-fx,.skz-txt,.skz-ref'))return;e.preventDefault();closePop();
    if(!sRect||e.pointerType!=='touch'||!PT.size)sRect=stage.getBoundingClientRect();
    const sx=e.clientX-sRect.left,sy=e.clientY-sRect.top;PT.set(e.pointerId,{id:e.pointerId,type:e.pointerType,x:sx,y:sy});try{stage.setPointerCapture(e.pointerId)}catch(x){}
    if(e.pointerType==='pen'){if(!E.penSeen){E.penSeen=true;if(PREF.penOnly==='auto'&&mode==='stroke'&&ptrId!=null&&PT.get(ptrId)&&PT.get(ptrId).type==='touch')toolUp(e,true)}penSince=performance.now()}
    if(e.pointerType==='touch'){
      // Ein Finger malt (ohne Stift); kommt schnell ein zweiter dazu, war es eine Geste: Strich verwerfen
      if(mode&&ptrId!=null&&PT.get(ptrId)&&PT.get(ptrId).type==='touch'){if(mode==='stroke'&&ST&&performance.now()-ST.t0<300)toolUp(e,true);else if(mode!=='stroke'&&mode!=='fl')toolUp(e,true);else if(mode==='fl'||mode==='stroke'){toolUp(e,false)}ptrId=null;mode=null}
      if(mode&&ptrId!=null)return;// Stift malt gerade: Handballen ignorieren
      const touches=[...PT.values()].filter(p=>p.type==='touch').length;
      if(touches>=2||penOnly()||E.hand){gStart();clearTimeout(LP);
        if(touches===1&&penOnly()&&E.tool!=='transform'){const p0={x:sx,y:sy};LP=setTimeout(()=>{if(G&&!G.moved&&PT.size===1){G=null;mode='pick';ptrId=e.pointerId;pick(toDoc(p0.x,p0.y),false)}},480)}
        if(touches===1&&penOnly()&&E.tool==='transform'&&E.fl){G=null;ptrId=e.pointerId;if(flDown(sx,sy))mode='fl'}
        return}}
    if(e.pointerType==='mouse'&&(e.button===1||spaceDown||E.hand)){G={pan:true,x:sx,y:sy,v0:{...V}};ptrId=e.pointerId;return}
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(mode)return;ptrId=e.pointerId;cur.style.display='none';toolDown(e)}
  function onMove(e){if(E.closed)return;const p=PT.get(e.pointerId);
    if(e.pointerType==='pen'||e.pointerType==='mouse'){if(!e.buttons&&!mode&&brushId()){if(!sRect)sRect=stage.getBoundingClientRect();showCur(e.clientX,e.clientY)}}// Stift schwebt (Hover): Pinselgröße zeigen
    if(!p)return;if(!sRect)sRect=stage.getBoundingClientRect();p.x=e.clientX-sRect.left;p.y=e.clientY-sRect.top;
    if(G&&G.pan&&e.pointerId===ptrId){V.x=G.v0.x+p.x-G.x;V.y=G.v0.y+p.y-G.y;applyView();return}
    if(e.pointerId===ptrId&&mode){e.preventDefault();toolMove(e);return}
    if(G&&p.type==='touch'){gMove();if(G&&G.moved)clearTimeout(LP)}}
  function onUp(e){const p=PT.get(e.pointerId);PT.delete(e.pointerId);if(E.closed)return;
    if(G&&G.pan&&e.pointerId===ptrId){G=null;ptrId=null;return}
    if(e.pointerId===ptrId){if(mode)toolUp(e,e.type==='pointercancel');ptrId=null;mode=null;return}
    if(p&&p.type==='touch'){clearTimeout(LP);gEnd()}}
  stage.addEventListener('pointerdown',onDown);stage.addEventListener('pointermove',onMove);stage.addEventListener('pointerup',onUp);stage.addEventListener('pointercancel',onUp);
  stage.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'&&!mode)cur.style.display='none'});
  const noTouch=e=>{if(e.target.closest('.skz-pop,.skz-txt,.skz-ctx,.skz-fx'))return;e.preventDefault()};stage.addEventListener('touchstart',noTouch,{passive:false});stage.addEventListener('touchmove',noTouch,{passive:false});
  stage.addEventListener('wheel',e=>{e.preventDefault();if(!sRect)sRect=stage.getBoundingClientRect();sRect=stage.getBoundingClientRect();const sx=e.clientX-sRect.left,sy=e.clientY-sRect.top;
    const mouseWheel=!e.ctrlKey&&e.deltaX===0&&Math.abs(e.deltaY)>=50&&Number.isInteger(e.deltaY);
    if(e.ctrlKey||mouseWheel)zoomAt(sx,sy,Math.exp(-e.deltaY*(e.ctrlKey?.01:.0015)));else{V.x-=e.deltaX;V.y-=e.deltaY;applyView()}},{passive:false});
  const gest=e=>e.preventDefault();D.addEventListener('gesturestart',gest);D.addEventListener('gesturechange',gest);
  const onKey=e=>{if(E.closed||!root.isConnected)return;const tg=e.target;if(tg&&(tg.tagName==='TEXTAREA'||tg.tagName==='INPUT'||tg.tagName==='SELECT'))return;const m=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
    if(m&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}if(m&&k==='y'){e.preventDefault();redo();return}if(m&&k==='s'){e.preventDefault();save();return}
    if(e.type==='keyup'){if(k===' ')spaceDown=false;return}if(m)return;
    if(k===' '){spaceDown=true;e.preventDefault();return}
    if(k==='l'){PREF.formK='linie';setTool('form');return}const map={b:'pinsel',p:'bleistift',e:'radierer',w:'wischen',g:'fuellen',i:'pipette',u:'form',s:'auswahl',v:'transform',t:'text',h:'marker'};if(map[k]){setTool(map[k]);return}
    const id=brushId();if(id&&(k==='['||k===']')){PREF.sizes[id]=clamp(sizeOf(id)+(k===']'?.04:-.04),0,1);updSliders();prefSave();return}
    if(k==='0')fit();if(k==='+'||k==='=')zoomAt(stage.clientWidth/2,stage.clientHeight/2,1.25);if(k==='-')zoomAt(stage.clientWidth/2,stage.clientHeight/2,.8);
    if((k==='escape'||k==='arrowleft'||k==='arrowup')&&root.classList.contains('focus')&&!E.fl&&!E.sel){exitFull();return}
    if(k==='escape'){if(E.fl)cancelFloat();else if(E.sel)setSel(null);closePop();closeText()}if(k==='enter'&&E.fl)commitFloat()};
  W.addEventListener('keydown',onKey);W.addEventListener('keyup',onKey);
  const onRes=()=>{sRect=null;if(!E.closed)drawHud()};W.addEventListener('resize',onRes);
  E.off=()=>{root.removeEventListener('click',onRootClick);root.removeEventListener('input',onRootInput);root.removeEventListener('change',onRootChange);W.removeEventListener('keydown',onKey);W.removeEventListener('keyup',onKey);W.removeEventListener('resize',onRes);D.removeEventListener('gesturestart',gest);D.removeEventListener('gesturechange',gest)};

  /* --- Klicks auf Knöpfe --- */
  const onRootClick=e=>{if(E.closed)return;const b=e.target.closest('button,[data-k]');if(!b||!root.contains(b))return;const k=b.dataset.k;
    if(b.dataset.tool){setTool(b.dataset.tool);return}
    if(b.dataset.paldel!=null&&b.dataset.paldel){PREF.pal=PREF.pal.filter(c=>c!==b.dataset.paldel);if(!PREF.pal.length)E.palEdit=false;prefSave();colorPop();return}
    if(b.dataset.col){setColor(b.dataset.col);return}
    if(b.dataset.ctab){PREF.colTab=b.dataset.ctab;prefSave();colorPop();return}
    if(b.dataset.harm){PREF.harm=b.dataset.harm;prefSave();b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));colorPopUpd(true);return}
    if(b.dataset.br){PREF.pinsel=b.dataset.br;prefSave();closePop();if(E.tool!=='pinsel')setTool('pinsel');else{E.lastBrush=PREF.pinsel;updSliders();ctxBarUpd()}return}
    if(b.dataset.seg){const v=b.dataset.v,key=b.dataset.seg;PREF[key]=v==='true'?true:v==='false'?false:/^\d+$/.test(v)?+v:v;prefSave();
      if(key==='grid'||key==='guide')syncLayers();if(E.pop==='settings')setPop();ctxBarUpd();return}
    if(b.dataset.tg){const key=b.dataset.tg;PREF[key]=!PREF[key];prefSave();if(key==='lefty')root.classList.toggle('lefty',PREF.lefty);if(key==='rotate'&&!PREF.rotate){V.r=0;applyView()}
      if(E.pop==='settings')setPop();else ctxBarUpd();return}
    if(b.dataset.refp){const x=(app.pages||[]).find(q=>q.id===b.dataset.refp);if(x&&x.thumb)refOpen(x.thumb,x.title||'Blatt');closePop();return}
    if(b.dataset.paper){page.bg=b.dataset.paper;E.metaDirty=true;syncLayers();setPop();queueSave();return}
    if(b.dataset.font){PREF.textFont=b.dataset.font;prefSave();b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));return}
    if(b.classList.contains('skz-lay')||(b.closest('.skz-lay')&&!k)){const li=+(b.closest('.skz-lay').dataset.li);if(E.fl)commitFloat();E.act=li;syncLayers();popLayers();return}
    switch(k){
      case 'back':app.closeEditor();break;case 'undo':undo();break;case 'redo':redo();break;
      case 'color':case 'layers':case 'settings':case 'export':case 'adjust':openPop(k);break;
      case 'c-pick':closePop();setTool('pipette');break;
      case 'pal-add':if(!PREF.pal.includes(PREF.color)&&PREF.pal.length<30){PREF.pal.push(PREF.color);prefSave()}colorPop();break;
      case 'pal-edit':E.palEdit=!E.palEdit;colorPop();break;case 'brush':openPop('brush');break;
      case 'send':app.share(true);break;case 'full':goFull();break;case 'unfocus':exitFull();break;
      case 'rename':{const n=prompt('Name für dieses Blatt',page.title||'');if(n!=null&&n.trim()){page.title=n.trim().slice(0,60);$('.skz-ttl b').textContent=page.title;queueSave()}break}
      case 'fit':fit();break;case 'z100':{const r=stage.getBoundingClientRect();zoomAt(r.width/2,r.height/2,(2/(W.devicePixelRatio||1))/V.s);break}
      case 'l-add':case 'l-dup':case 'l-up':case 'l-down':case 'l-del':case 'l-clear':case 'l-merge':case 'l-ref':case 'l-ren':case 'l-lockA':case 'l-fill':layerAct(k);break;
      case 'adj-ok':adjApply();break;case 'adj-reset':adjReset();break;case 'adj-g':case 'adj-i':adjSet(k.slice(4),E.adj&&E.adj[k.slice(4)]?0:1);adjPop();break;
      case 'v-flip':flipView();setPop();break;case 'v-gray':E.gray=!E.gray;doc.style.filter=E.gray?'grayscale(1)':'';setPop();break;
      case 'ref-file':refFile();break;case 'ref-x':refClose();break;
      case 'l-vis':layerAct('l-vis',+b.dataset.li);break;
      case 'sel-del':selDelete();break;case 'sel-none':setSel(null);break;case 'sel-copy':selCopy();break;case 'sel-move':setTool('transform');break;
      case 'fl-ok':commitFloat();break;case 'fl-x':cancelFloat();break;case 'fl-h':if(E.fl){E.fl.sx*=-1;flView()}break;case 'fl-v':if(E.fl){E.fl.sy*=-1;flView()}break;
      case 'fl-free':if(E.fl){E.fl.free=!E.fl.free;ctxBarUpd()}break;
      case 'txt-ok':placeText();break;case 'txt-x':closeText();break;
      case 'exp-png':exportPng();break;case 'exp-send':closePop();app.share(true);break}};
  const onRootInput=e=>{if(E.closed)return;const t=e.target;
    if(t.dataset.cv){const k=t.dataset.cv,v=+t.value;if('hsv'.includes(k)){HSV['hsv'.indexOf(k)]=k==='h'?Math.min(v,359.9):v/100;fromHSV()}else{const c=hex2rgb(PREF.color);c['rgb'.indexOf(k)]=v;PREF.color=rgb2hex(...c);showCol();colorPopUpd()}clearTimeout(E.cvT);E.cvT=setTimeout(()=>setColor(PREF.color),500);return}
    if(t.dataset.k==='hex'){const v=t.value.trim().replace(/^#?/,'#');if(/^#[0-9a-f]{6}$/i.test(v)){setColor(v.toLowerCase())}return}
    if(t.dataset.adj){adjSet(t.dataset.adj,+t.value);return}if(t.dataset.rng){PREF[t.dataset.rng]=t.dataset.rng==='smooth'?+t.value/100:+t.value;prefSave();return}
    if(t.dataset.k==='l-op')layerAct('l-op',+t.value)};
  const onRootChange=e=>{if(E.closed)return;const t=e.target;if(t.dataset.k==='l-blend')layerAct('l-blend',t.value)};
  root.addEventListener('click',onRootClick);root.addEventListener('input',onRootInput);root.addEventListener('change',onRootChange);
  function goFull(){root.classList.add('focus');const r=root;try{(r.requestFullscreen||r.webkitRequestFullscreen||(()=>{})).call(r)}catch(x){}setTimeout(()=>{sRect=null;drawHud()},300)}
  function exitFull(){root.classList.remove('focus');try{if(D.fullscreenElement||D.webkitFullscreenElement)(D.exitFullscreen||D.webkitExitFullscreen).call(D)}catch(x){}setTimeout(()=>{sRect=null;drawHud()},300)}
  const fsc=()=>{if(!(D.fullscreenElement||D.webkitFullscreenElement))root.classList.remove('focus')};D.addEventListener('fullscreenchange',fsc);D.addEventListener('webkitfullscreenchange',fsc);
  async function exportPng(){closePop();if(E.fl)commitFloat();const c=flatten(),b=await toBlob(c);freeCanvas(c);const name=(page.title||'Skizze').replace(/[^\wäöüÄÖÜß -]/g,'').trim()+'.png';
    try{const f=new File([b],name,{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:page.title||'Skizze'});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=D.createElement('a');a.href=URL.createObjectURL(b);a.download=name;D.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}

  /* --- Laden --- */
  E.load=async()=>{const L=page.layers&&page.layers.length?page.layers:[{id:uid(),name:'Ebene 1'}];
    for(const m of L){const N=mkLayer(m);try{const b=await pxGet(page.id+'/'+m.id);if(b){const im=await blobImg(b);N.ctx.drawImage(im,0,0);if(im.close)im.close()}}catch(e){console.warn(e)}E.layers.push(N)}
    E.saved=L.map(l=>l.id);E.act=Math.max(0,E.layers.findIndex(l=>l.id===page.act));if(E.act<0||E.layers[E.act].ref){const j=E.layers.map(l=>!l.ref).lastIndexOf(true);E.act=j>=0?j:0}
    $('.skz-ttl b').textContent=page.title||'Ohne Titel';const kd=$('.skz-kind');kd.textContent={skizze:'Skizze',werk:'Werk',frei:'Blatt'}[page.kind]||'Blatt';kd.className='skz-kind '+(page.kind||'frei');
    const tk=$('.skz-task');if(page.task&&page.task.text){tk.hidden=false;tk.textContent='Auftrag: '+page.task.text;tk.title=page.task.text}
    setColor(PREF.color,true);quickCols();setTimeout(colHint,900);syncLayers();setTool(['pinsel','bleistift','marker'].includes(PREF.lastTool)?PREF.lastTool:'pinsel');
    requestAnimationFrame(fit);changed();setSaved(page.n?'Gespeichert':'')};
  E.destroy=async()=>{if(E.closed)return;E.closed=true;PREF.lastTool=E.tool;prefSave();if(E.fl)commitFloat();if(ST)strokeEnd(false);try{await save()}catch(e){}E.off();
    D.removeEventListener('fullscreenchange',fsc);D.removeEventListener('webkitfullscreenchange',fsc);if(root.classList.contains('focus'))exitFull();
    refClose();E.layers.forEach(L=>freeCanvas(L.cv));freeCanvas(sc);freeCanvas(bk);H.st=[];E.layers=[]};
  E.root=root;return E}

/* =====================================================================
   Skizzenbuch (Übersicht, Auftrag „Erst skizzieren, dann gestalten“)
   ===================================================================== */
const APP={root:null,ctx:null,ed:null,pages:[],filter:'alle',urls:[],busy:false};
APP.thumbUrl=p=>{const u=URL.createObjectURL(p.thumb);APP.urls.push(u);return u};
function revoke(){APP.urls.forEach(u=>URL.revokeObjectURL(u));APP.urls=[]}
const thumbUrl=p=>{if(!p.thumb)return '';const u=URL.createObjectURL(p.thumb);APP.urls.push(u);return u};
const isDone=p=>(p.n||0)>=MIN_STROKES;
function taskInfo(){const T=APP.ctx.task;if(!T||!T.id)return null;const sk=APP.pages.filter(p=>p.task&&p.task.id===T.id&&p.kind==='skizze').sort((a,b)=>a.created-b.created),wk=APP.pages.filter(p=>p.task&&p.task.id===T.id&&p.kind==='werk');
  const n=clamp(+T.n||2,1,6),done=sk.filter(isDone).length;return {T,sk,wk,n,done,open:done>=n||!!T.werk}}
APP.progress=()=>{const ti=taskInfo();if(ti&&APP.ctx.onProgress)try{APP.ctx.onProgress({id:ti.T.id,s:ti.done,w:ti.wk.some(p=>(p.n||0)>0)?1:0})}catch(e){}};
async function refresh(){try{APP.pages=await pagesOf(APP.ctx.owner)}catch(e){APP.pages=[];APP.err='Das Skizzenbuch kann hier nicht gespeichert werden (privates Surfen?).'}}
// Vorlage der Lehrkraft (z. B. Schuh-Umriss für Produktdesign): Zum Auftrag gibt es ein fertiges Blatt mit dem Bild auf der unteren Ebene.
// Es wird einmal pro Auftrag angelegt und gleich geöffnet. Ist das Bild noch nicht da, versucht es das Skizzenbuch gleich nochmal.
async function ensureVor(){const ti=taskInfo();if(!ti||!ti.T.vor||APP.vorBusy||!APP.ctx.getVor)return false;
  if(APP.pages.some(p=>p.task&&p.task.id===ti.T.id&&p.vor))return false;APP.vorBusy=true;
  try{const b=await APP.ctx.getVor(ti.T.vor);if(!b){clearTimeout(APP.vorT);if((APP.vorN=(APP.vorN||0)+1)<20)APP.vorT=setTimeout(()=>{if(APP.root&&!APP.ed)showGallery()},6000);return false}
    const im=await blobImg(b),iw=im.width||1,ih=im.height||1,F=FORMAT.find(f=>f[0]===(ih>iw*1.1?'hoch':iw>ih*1.1?'quer':'quad')),w=F[2],h=F[3];
    const lc=mkCanvas(w,h),x=ctx2(lc),k=Math.min(w/iw,h/ih)*.94;x.drawImage(im,(w-iw*k)/2,(h-ih*k)/2,iw*k,ih*k);if(im.close)im.close();
    const id0=uid(),id1=uid(),lay=[{meta:{id:id0,name:'Vorlage',vis:true,op:1,blend:'source-over',ref:false},blob:await toBlob(lc)},{meta:{id:id1,name:'Mein Entwurf',vis:true,op:1,blend:'source-over',ref:false},blob:null}];freeCanvas(lc);
    const page={id:'sk'+uid(),owner:APP.ctx.owner,title:String(ti.T.vname||ti.T.text||'Vorlage').slice(0,60),kind:'skizze',task:{id:ti.T.id,text:String(ti.T.text||'').slice(0,200)},vor:ti.T.vor,created:Date.now(),updated:Date.now(),w,h,bg:'#ffffff',layers:lay.map(l=>l.meta),act:id1,n:0};
    await run(['pages','px'],'readwrite',t=>{lay.forEach(l=>{if(l.blob)t.objectStore('px').put(l.blob,page.id+'/'+l.meta.id)});t.objectStore('pages').put(page)});
    APP.vorN=0;if(APP.root&&!APP.ed){await openEditor(page);return true}}catch(e){console.warn('vorlage',e)}finally{APP.vorBusy=false}return false}
async function showGallery(){APP.ed=null;revoke();await refresh();if(!APP.root)return;if(await ensureVor())return;APP.progress();const R=APP.root;R.className='skz';R.classList.toggle('lefty',PREF.lefty);
  const ti=taskInfo(),f=APP.filter,L=APP.pages.filter(p=>f==='alle'||p.kind===f),elo=APP.ctx.elo;
  const card=p=>`<div class="skz-card" data-open="${p.id}" role="button" tabindex="0"><div class="th" style="background-image:url('${thumbUrl(p)}');background-color:${esc(p.bg||'#fff')}"></div><span class="skz-kind ${p.kind}">${{skizze:'Skizze',werk:'Werk',frei:'Blatt'}[p.kind]||'Blatt'}</span>
    <button class="skz-b mn" data-menu="${p.id}" aria-label="Mehr">${ico('more')}</button><div class="in"><b>${esc(p.title||'Ohne Titel')}</b><small>${new Date(p.updated).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}${p.kind==='skizze'&&p.task?(isDone(p)?' · angelegt':' · noch zu wenig'):''}</small></div></div>`;
  // Reines Skizzenbuch (Fabian 20.10.): kein Werk-Schritt mehr. Läuft gerade eine Skizzenphase, steht nur eine schmale Zeile mit dem Auftrag.
  let auf='';if(ti)auf=`<section class="skz-auf" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px"><span style="flex:1;min-width:180px;font-weight:800">✏️ ${esc(ti.T.text||'Skizziere deine Ideen')} <span style="color:var(--muted)">· ${ti.done} von ${ti.n} Skizzen</span></span><button class="skz-b pri" data-k="new-sk">${ico('plus',20)} Skizze</button></section>`;
  R.innerHTML=`<div class="skz-top"><button class="skz-b" data-k="exit">${ico('back')}<span>Zurück</span></button><div class="skz-ttl"></div>${APP.ctx.who==='teacher'?'<span class="skz-saved">Dein eigenes Skizzenbuch (Lehrkraft)</span>':''}</div>
    <div class="skz-gal"><div class="skz-gin"><div class="skz-gh">${elo?`<img src="${esc(elo)}" alt="">`:''}<h1>Mein Skizzenbuch</h1><button class="skz-b pri" data-k="new">${ico('plus',20)} Neue Skizze</button></div>
      ${APP.err?`<div class="skz-auf" style="border-left-color:var(--red)">${esc(APP.err)}</div>`:''}${auf}
      <div class="skz-tabs">${[['alle','Alle'],['skizze','Skizzen'],['werk','Werke'],['frei','Freie Blätter']].filter(([k])=>k!=='werk'||APP.pages.some(p=>p.kind==='werk')).map(([k,n])=>`<button class="skz-b ${f===k?'on':'line'}" data-filter="${k}">${n} · ${k==='alle'?APP.pages.length:APP.pages.filter(p=>p.kind===k).length}</button>`).join('')}</div>
      <div class="skz-cards">${L.length?L.map(card).join(''):''}<button class="skz-new" data-k="new">${ico('plus',30)}Neue Skizze</button></div>
      ${!APP.pages.length?'<p class="skz-empty">Dein Skizzenbuch ist noch leer. Leg ein neues Blatt an und probier die Pinsel aus.</p>':''}
      <p class="skz-empty" style="font-size:.85rem">Alles im Skizzenbuch bleibt auf diesem iPad. Nur was du selbst an deine Lehrkraft schickst, sieht sie.</p></div></div>`}
function modal(html){const m=D.createElement('div');m.className='skz-modal';m.innerHTML=`<div>${html}</div>`;APP.root.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)m.remove()});return m}
function newDialog(kind,taskId){const ti=taskInfo(),forTask=taskId&&ti;const st={kind:kind||'skizze',fmt:'quer',bg:'#ffffff',vor:null,title:''};
  if(forTask&&st.kind==='werk'){const best=ti.sk.filter(isDone).sort((a,b)=>(b.n||0)-(a.n||0))[0]||ti.sk[0];st.vor=best?best.id:null}
  const sketches=APP.pages.filter(p=>p.kind==='skizze'||p.kind==='frei');
  const m=modal('');const draw=()=>{m.firstChild.innerHTML=`<h3>${forTask?(st.kind==='werk'?'Werk beginnen':'Neue Skizze zum Auftrag'):'Neues Blatt'}</h3>
    ${forTask?'':`<h4>Art</h4><div class="skz-ch">${[['skizze','Skizze'],['frei','Freies Blatt']].map(([k,n])=>`<button data-nk="${k}" class="${st.kind===k?'on':''}">${n}</button>`).join('')}</div>`}
    <h4>Name</h4><input class="skz-in" data-nt maxlength="60" placeholder="${forTask?esc((st.kind==='werk'?'Werk: ':'Skizze: ')+(ti.T.text||'')).slice(0,60):'z. B. Mein Baum'}" value="${esc(st.title)}">
    <h4>Format</h4><div class="skz-ch">${FORMAT.map(([k,n,fw,fh])=>`<button data-nf="${k}" class="${st.fmt===k?'on':''}"><i class="fm" style="width:${fw/90}px;height:${fh/90}px"></i>${n}</button>`).join('')}</div>
    <h4>Papier</h4><div class="skz-ch">${PAPER.map(([c,n])=>`<button data-np="${c}" class="${st.bg===c?'on':''}"><i class="pp" style="background:${c}"></i>${n}</button>`).join('')}</div>
    ${st.kind==='werk'&&sketches.length?`<h4>Vorlage aus deinen Skizzen</h4><p style="margin:0 0 6px;font-weight:700;color:var(--muted);font-size:.88rem">Die Skizze liegt blass auf einer gesperrten Ebene. Du malst darüber auf einer neuen Ebene.</p>
      <div class="skz-vor"><button data-nv="" class="${!st.vor?'on':''}" style="display:flex;align-items:center;justify-content:center;font-weight:800;min-height:80px">Ohne Vorlage</button>${sketches.map(p=>`<button data-nv="${p.id}" class="${st.vor===p.id?'on':''}"><img src="${thumbUrl(p)}" alt=""><small>${esc(p.title||'Skizze')}</small></button>`).join('')}</div>`:''}
    <div class="skz-row" style="justify-content:flex-end;margin-top:16px"><button class="skz-b line" data-nx>Abbrechen</button><button class="skz-b pri" data-ngo>${ico('check',18)} Anlegen</button></div>`};draw();
  m.addEventListener('input',e=>{if(e.target.dataset.nt!=null)st.title=e.target.value});
  m.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;if(d.nk){st.kind=d.nk;draw()}if(d.nf){st.fmt=d.nf;draw()}if(d.np){st.bg=d.np;draw()}if(d.nv!=null){st.vor=d.nv||null;draw()}if(d.nx!=null)m.remove();
    if(d.ngo!=null){if(APP.busy)return;APP.busy=true;b.disabled=true;try{const F=FORMAT.find(f=>f[0]===st.fmt),cnt=APP.pages.filter(p=>p.kind===st.kind&&(!forTask||(p.task&&p.task.id===ti.T.id))).length+1;
      const title=st.title.trim()||(forTask?(st.kind==='werk'?'Mein Werk':'Skizze '+cnt):(st.kind==='skizze'?'Skizze ':st.kind==='werk'?'Werk ':'Blatt ')+cnt);
      const page={id:'sk'+uid(),owner:APP.ctx.owner,title,kind:st.kind,task:forTask?{id:ti.T.id,text:String(ti.T.text||'').slice(0,200)}:null,created:Date.now(),updated:Date.now(),w:F[2],h:F[3],bg:st.bg,layers:[],n:0};
      const lay=[];if(st.kind==='werk'&&st.vor){const src=APP.pages.find(p=>p.id===st.vor);if(src){const c=await flatPage(src,false);if(c){const lc=mkCanvas(page.w,page.h),x=ctx2(lc),k=Math.min(page.w/c.width,page.h/c.height);x.drawImage(c,(page.w-c.width*k)/2,(page.h-c.height*k)/2,c.width*k,c.height*k);freeCanvas(c);
        const id=uid();lay.push({meta:{id,name:'Vorlage: '+(src.title||'Skizze'),vis:true,op:.35,blend:'source-over',ref:true},blob:await toBlob(lc)});freeCanvas(lc)}}}
      const id1=uid();lay.push({meta:{id:id1,name:st.kind==='werk'?'Mein Werk':'Ebene 1',vis:true,op:1,blend:'source-over',ref:false},blob:null});page.layers=lay.map(l=>l.meta);page.act=id1;
      await run(['pages','px'],'readwrite',t=>{lay.forEach(l=>{if(l.blob)t.objectStore('px').put(l.blob,page.id+'/'+l.meta.id)});t.objectStore('pages').put(page)});m.remove();openEditor(page)}
    catch(err){console.warn(err);alert('Das Blatt konnte nicht angelegt werden.')}APP.busy=false}})}
async function flatPage(p,withPaper=true){const c=mkCanvas(p.w,p.h),x=ctx2(c);if(withPaper){x.fillStyle=p.bg||'#fff';x.fillRect(0,0,p.w,p.h)}
  for(const l of p.layers||[]){if(!l.vis||l.ref)continue;const b=await pxGet(p.id+'/'+l.id);if(!b)continue;const im=await blobImg(b);x.globalAlpha=l.op;x.globalCompositeOperation=l.blend||'source-over';x.drawImage(im,0,0);if(im.close)im.close()}return c}
function cardMenu(id){const p=APP.pages.find(x=>x.id===id);if(!p)return;const m=modal(`<h3>${esc(p.title||'Blatt')}</h3><div style="display:grid;gap:8px">
    <button class="skz-b line" data-mm="open" style="justify-content:flex-start">${ico('pinsel',20)} Öffnen</button>
    <button class="skz-b line" data-mm="ren" style="justify-content:flex-start">${ico('text',20)} Umbenennen</button>
    <button class="skz-b line" data-mm="dup" style="justify-content:flex-start">${ico('dup',20)} Verdoppeln</button>
    ${APP.ctx.onShare?`<button class="skz-b line" data-mm="send" style="justify-content:flex-start">${ico('send',20)} An meine Lehrkraft schicken</button>`:''}
    <button class="skz-b line red" data-mm="del" style="justify-content:flex-start">${ico('trash',20)} Löschen</button>
    <button class="skz-b" data-mm="x">Schließen</button></div>`);
  m.addEventListener('click',async e=>{const b=e.target.closest('[data-mm]');if(!b)return;const k=b.dataset.mm;
    if(k==='x'){m.remove();return}if(k==='open'){m.remove();openEditor(p);return}
    if(k==='ren'){const n=prompt('Neuer Name',p.title||'');if(n!=null&&n.trim()){p.title=n.trim().slice(0,60);await run('pages','readwrite',t=>t.objectStore('pages').put(p))}m.remove();showGallery();return}
    if(k==='del'){if(!confirm(`„${p.title||'Blatt'}“ wirklich löschen? Das geht nicht rückgängig.`))return;await pageDel(p);m.remove();showGallery();return}
    if(k==='send'){m.remove();await sharePage(p);return}
    if(k==='dup'){const q={...p,id:'sk'+uid(),title:(p.title||'Blatt')+' (Kopie)',created:Date.now(),updated:Date.now(),layers:(p.layers||[]).map(l=>({...l,id:uid()}))};
      const bl=[];for(let i=0;i<(p.layers||[]).length;i++){const b2=await pxGet(p.id+'/'+p.layers[i].id);if(b2)bl.push([q.id+'/'+q.layers[i].id,b2])}
      const ai=(p.layers||[]).findIndex(l=>l.id===p.act);q.act=ai>=0?q.layers[ai].id:(q.layers[0]||{}).id;
      if(q.task&&q.kind==='werk')q.task=null;// eine Kopie zählt nicht als zweites Werk zum Auftrag
      await run(['pages','px'],'readwrite',t=>{bl.forEach(([k2,b2])=>t.objectStore('px').put(b2,k2));t.objectStore('pages').put(q)});m.remove();showGallery()}})}
async function sharePage(p){if(!APP.ctx.onShare)return;try{const c=await flatPage(p),k=Math.min(1,1400/Math.max(c.width,c.height)),s=mkCanvas(Math.round(c.width*k),Math.round(c.height*k));s.getContext('2d').drawImage(c,0,0,s.width,s.height);freeCanvas(c);
    const img=s.toDataURL('image/jpeg',.78);freeCanvas(s);const ok=await APP.ctx.onShare({id:p.id,title:p.title||'Skizze',kind:p.kind,task:p.task&&p.task.id||null,taskText:p.task&&p.task.text||'',img});
    flash(ok===false?'Gerade keine Verbindung. Es wird später geschickt.':'An deine Lehrkraft geschickt.')}catch(e){console.warn(e);flash('Das ging gerade nicht.')}}
function flash(t){if(APP.ed){APP.ed.toast(t);return}const el=D.createElement('div');el.className='skz-toast';el.textContent=t;APP.root.appendChild(el);setTimeout(()=>el.remove(),3200)}
async function openEditor(page){revoke();APP.ed=Editor(APP,page);await APP.ed.load()}
APP.closeEditor=async()=>{const e=APP.ed;if(!e||e.closing)return;e.closing=true;const sv=APP.root.querySelector('.skz-saved');if(sv)sv.textContent='Speichert …';await e.destroy();showGallery()};
APP.share=async()=>{const e=APP.ed;if(!e)return;if(e.fl)e.commitFloat();await e.save();const p=await pageGet(e.page.id);if(p)await sharePage(p)};
function onClick(e){if(APP.ed)return;const b=e.target.closest('[data-k],[data-open],[data-menu],[data-filter]');if(!b||!APP.root.contains(b))return;const d=b.dataset;
  if(d.menu){e.stopPropagation();cardMenu(d.menu);return}if(d.open){const p=APP.pages.find(x=>x.id===d.open);if(p)openEditor(p);return}
  if(d.filter){APP.filter=d.filter;showGallery();return}
  if(d.k==='exit'){unmount().then(()=>APP.ctx&&APP.ctx.onExit&&APP.ctx.onExit());return}
  if(d.k==='new'){newDialog();return}if(d.k==='new-sk'){newDialog('skizze',true);return}if(d.k==='new-wk'){newDialog('werk',true);return}}
const onVis=()=>{if(D.visibilityState==='hidden'&&APP.ed)APP.ed.save()};
async function mount(el,ctx){injectCSS();if(APP.root)await unmount(true);APP.root=el;APP.ctx=ctx||{};APP.err='';el.addEventListener('click',onClick);D.addEventListener('visibilitychange',onVis);W.addEventListener('pagehide',onVis);
  if(ctx&&ctx.open){const p=await pageGet(ctx.open).catch(()=>null);if(p&&p.owner===ctx.owner){await refresh();return openEditor(p)}}
  await showGallery()}
async function unmount(quiet){const e=APP.ed;APP.ed=null;if(e)await e.destroy();if(APP.root){APP.root.removeEventListener('click',onClick);APP.root.innerHTML='';APP.root.className=''}D.removeEventListener('visibilitychange',onVis);W.removeEventListener('pagehide',onVis);revoke();APP.root=null}
function setTask(task){if(!APP.ctx)return;const a=JSON.stringify(APP.ctx.task||null),b=JSON.stringify(task||null);APP.ctx.task=task||null;if(a!==b&&APP.root&&!APP.ed)showGallery()}
W.Skizze={mount,unmount,setTask,isOpen:()=>!!APP.root,editing:()=>!!APP.ed,_E:()=>APP.ed,MIN_STROKES};
})();
