// Kontrast-Prüfung (WCAG AA) für ELONUKI: öffnet app.html hell und dunkel, geht Lehrer- und Schüleransichten durch und listet Schrift mit zu wenig Kontrast.
// Start: python3 -m http.server 8765 im Repo, dann: npm i playwright-core && node tools/kontrast-check.js [T:mod S:dash ...]. Ziel: keine Zeile außer "ok".
const {chromium}=require('playwright-core');
const AUD=()=>{const lum=c=>{const sr=/^color\(srgb/.test(c);const m=c.match(/[\d.]+/g);if(!m)return null;const [r,g,b]=m.slice(0,3).map(v=>{v=sr?+v:v/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return {L:.2126*r+.7152*g+.0722*b,a:sr?(c.includes('/')?+m[3]:1):(m[3]==null?1:+m[3])}};
 const bgOf=el=>{for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);const b=lum(cs.backgroundColor);if(b&&b.a>.5)return {L:b.L,img:cs.backgroundImage!=='none'};if(cs.backgroundImage&&cs.backgroundImage.includes('url('))return null}return {L:lum(getComputedStyle(document.body).backgroundColor).L}};
 const out=[];document.querySelectorAll('#view *').forEach(el=>{if(!el.offsetParent&&el.tagName!=='BODY')return;const t=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');if(!t)return;
  const cs=getComputedStyle(el);if(cs.visibility==='hidden'||+cs.opacity<.3)return;const f=lum(cs.color),b=bgOf(el);if(!f||!b)return;const r=(Math.max(f.L,b.L)+.05)/(Math.min(f.L,b.L)+.05);
  const big=parseFloat(cs.fontSize)>=24||parseFloat(cs.fontSize)>=18.6&&+cs.fontWeight>=700;if(r<(big?3:4.5))out.push(r.toFixed(2)+' '+el.tagName.toLowerCase()+'.'+[...el.classList].join('.')+' "'+t.slice(0,40)+'"')});return [...new Set(out)].slice(0,40)};
(async()=>{const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
for(const scheme of ['light','dark']){const p=await b.newPage({viewport:{width:1180,height:900},colorScheme:scheme});
await p.route(/supabase|jsdelivr/,r=>r.abort());await p.goto('http://localhost:8765/app.html');await p.waitForTimeout(1200);
await p.evaluate(async()=>{S.role='teacher';TDKEY=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);TDIDLE=false;await heftLoadPlan(true,'M')});await p.waitForTimeout(600);
const views=process.argv.slice(2).length?process.argv.slice(2):['T:mod','T:tsubj','T:tdesk','T:library','T:lessons','T:tplan','T:toolbox','S:dash','S:desk','S:mod','S:homework','S:vok','S:subject'];
for(const v of views){const [r,n]=v.split(':');await p.evaluate(([r,n])=>{S.role=r==='T'?'teacher':'student';const ch=(modChs('M')[0]||{}).ch;go(n,{s:'M',ch,tab:'heft'});const b=document.querySelector('[data-act=sbox]');if(n==='mod'&&b)b.click()},[r,n]);await p.waitForTimeout(350);
 const res=await p.evaluate(AUD);console.log(scheme,v,res.length?'\n  '+res.join('\n  '):'ok');if(process.env.SHOT)await p.screenshot({path:'a-'+scheme+'-'+n+r+'.png'})}}
await b.close()})();
