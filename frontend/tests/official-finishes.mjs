import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
const memory=new Map()
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}
const server=await createServer({server:{middlewareMode:true}})
const temp=await mkdtemp(path.join(tmpdir(),'banma-finish-style-'))
try {
  const {default:OfficialFinishes}=await server.ssrLoadModule('/src/components/OfficialFinishes.jsx')
  const {default:View}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx')
  const {default:RaceDetail}=await server.ssrLoadModule('/src/components/RaceDetail.jsx')
  const {dayInfo}=await server.ssrLoadModule('/src/lib/paginate.js')
  const {predict}=await server.ssrLoadModule('/src/feedback.js')
  const {resultForRace}=await server.ssrLoadModule('/src/raceResults.js')
  const css=await readFile(new URL('../src/styles/theme.css',import.meta.url),'utf8')
  const race=dayInfo('2026-11-06').races[0]
  const finishes=resultForRace(race).finishes
  const before=JSON.stringify(finishes)
  const official=renderToStaticMarkup(createElement(OfficialFinishes,{finishes}))
  assert.equal(JSON.stringify(finishes),before,'presentation must not mutate results')
  assert.equal((official.match(/official-finish-podium/g)||[]).length,3)
  assert.ok(official.includes('1着')&&official.includes('2着')&&official.includes('3着'))
  assert.equal(renderToStaticMarkup(createElement(OfficialFinishes,{finishes:[]})),'')
  const detail=renderToStaticMarkup(createElement(RaceDetail,{race,preds:predict(race)}))
  assert.ok(detail.includes('公式実着順'))
  const confidence=renderToStaticMarkup(createElement(View,{date:'2026-11-06'}))
  const stress=renderToStaticMarkup(createElement(OfficialFinishes,{finishes:[{finish:1,umaban:10,name:'非常に長い馬名LongUnbrokenHorseName'.repeat(10)}]}))
  const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  let frames=''
  for(const width of [320,375,880])for(const [screen,markup] of [['confidence-results',confidence],['race-detail',`<article class="card">${detail}</article>`]]){
    const inner=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main class="app"><p class="meta baseline-finish">実着順: 1着 3番フジベンケイ</p><ol class="trio-list unchanged-ticket"><li>3−4−8</li></ol>${markup}<article class="card">${stress}</article></main>`
    frames+=`<iframe data-screen="${screen}" data-width="${width}" style="width:${width}px;height:1000px;border:0" srcdoc="${escape(inner)}"></iframe>`
  }
  const measure=`window.addEventListener('load',()=>{
    const reports=[...document.querySelectorAll('iframe')].map(frame=>{
      const doc=frame.contentDocument,win=frame.contentWindow;
      const podium=doc.querySelector('.official-finish-podium');
      const style=selector=>win.getComputedStyle(podium.querySelector(selector));
      return {screen:frame.dataset.screen,width:win.innerWidth,baselinePx:parseFloat(win.getComputedStyle(doc.querySelector('.baseline-finish')).fontSize),
        rankPx:parseFloat(style('.official-finish-rank').fontSize),numberPx:parseFloat(style('.official-finish-number').fontSize),namePx:parseFloat(style('.official-finish-name').fontSize),
        rankWeight:style('.official-finish-rank').fontWeight,nameWeight:style('.official-finish-name').fontWeight,
        rankColor:style('.official-finish-rank').color,nameColor:style('.official-finish-name').color,background:win.getComputedStyle(podium).backgroundColor,
        ticketPx:parseFloat(win.getComputedStyle(doc.querySelector('.unchanged-ticket')).fontSize),
        noFinishOverflow:[...doc.querySelectorAll('.official-finishes,.official-finish,.official-finish-horse,.official-finish-name')].every(el=>el.scrollWidth<=el.clientWidth+1&&el.getBoundingClientRect().right<=win.innerWidth+1)};
    });const report=document.createElement('pre');report.id='measurements';report.textContent=JSON.stringify(reports);document.body.appendChild(report);
  });`
  const file=path.join(temp,'render.html')
  await writeFile(file,`<!doctype html><meta charset="utf-8">${frames}<script>${measure}</script>`)
  if (process.env.BANMA_HEADLESS === '1') {
  // Offline, noninteractive headless render only; no desktop or signed-in browser session.
  const output=execFileSync('/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking',`--user-data-dir=${path.join(temp,'profile')}`,'--no-first-run','--no-default-browser-check','--virtual-time-budget=5000','--dump-dom',`file://${file}`],{encoding:'utf8',timeout:30000,maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe']})
  const match=output.match(/<pre id="measurements">([\s\S]*?)<\/pre>/)
  assert.ok(match,'headless renderer must report computed styles')
  const reports=JSON.parse(match[1]);assert.equal(reports.length,6)
  const luminance=color=>{
    const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4)
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
  }
  for(const r of reports){
    assert.ok([320,375,880].includes(r.width));assert.equal(r.baselinePx,13.6)
    assert.ok(r.rankPx>=24&&r.rankPx<=32);assert.ok(r.numberPx>=20&&r.numberPx<=24)
    assert.ok(r.namePx>=18&&r.namePx<=22);assert.ok(+r.rankWeight>=800&&+r.nameWeight>=700)
    assert.equal(r.ticketPx,13.6,'prediction ticket font must not change')
    assert.ok(r.noFinishOverflow,`${r.screen} ${r.width}px: official results must wrap even with long names`)
    for(const color of [r.rankColor,r.nameColor]){
      const values=[luminance(color),luminance(r.background)].sort((a,b)=>b-a)
      assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,'result text contrast must meet 4.5:1')
    }
  }
  console.log('PASS offline headless Chrome: actual confidence-results and race detail, 320/375/880px, long-name wrap/no finish overflow, >=4.5:1 contrast, unchanged ticket font.')
  console.log(JSON.stringify(reports.map(({screen,width,baselinePx,rankPx,numberPx,namePx,ticketPx})=>({screen,width,baselinePx,rankPx,numberPx,namePx,ticketPx}))))
  } else {
    assert.ok(css.includes('grid-template-columns: max-content minmax(0, 1fr)'))
    assert.ok(css.includes('overflow-wrap: anywhere'))
    assert.ok(css.includes('.official-finish-podium .official-finish-rank'))
    assert.ok(css.includes('font-size: clamp(1.5rem, 1.1rem + 2vw, 2rem)'))
    assert.ok(css.includes('font-size: clamp(1.25rem, 1rem + 1vw, 1.5rem)'))
    assert.ok(css.includes('font-size: clamp(1.125rem, .95rem + 1vw, 1.375rem)'))
    const sizes=[320,375,880].map(width=>({width,baselinePx:13.6,
      rankPx:Math.max(24,Math.min(32,17.6+.02*width)),
      numberPx:Math.max(20,Math.min(24,16+.01*width)),
      namePx:Math.max(18,Math.min(22,15.2+.01*width))}))
    for(const row of sizes)assert.ok(row.rankPx>row.baselinePx&&row.numberPx>row.baselinePx&&row.namePx>row.baselinePx)
    console.log('PASS official finishes: both target component markups, unchanged data, shared classes, scoped wrapping CSS and responsive clamp calculations (not browser-computed styles).')
    console.log(JSON.stringify(sizes))
  }
}finally{await server.close();await rm(temp,{recursive:true,force:true})}
