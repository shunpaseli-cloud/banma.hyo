import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createElement,Children,isValidElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
const memory=new Map()
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}
const server=await createServer({server:{middlewareMode:true}})
const render=(Component,props)=>renderToStaticMarkup(createElement(Component,props))
const walk=(node,type)=>{
  if(!isValidElement(node))return []
  return [...(node.type===type?[node]:[]),...Children.toArray(node.props.children).flatMap(child=>walk(child,type))]
}
try {
  const {default:SelectionComment,qualitativeReason,horseComments}=await server.ssrLoadModule('/src/components/SelectionComment.jsx')
  const {default:Card}=await server.ssrLoadModule('/src/components/RecommendationCard.jsx')
  const {default:Disclosure,syncDisclosure}=await server.ssrLoadModule('/src/components/Disclosure.jsx')
  const {default:RaceResult}=await server.ssrLoadModule('/src/components/RaceResult.jsx')
  const {default:RaceDetail}=await server.ssrLoadModule('/src/components/RaceDetail.jsx')
  const {default:OfficialFinishes}=await server.ssrLoadModule('/src/components/OfficialFinishes.jsx')
  const {default:RaceCard}=await server.ssrLoadModule('/src/components/RaceCard.jsx')
  const {predictionOf}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx')
  const {dayInfo}=await server.ssrLoadModule('/src/lib/paginate.js')
  const {predict}=await server.ssrLoadModule('/src/feedback.js')
  const {buildRaceRecommendation}=await server.ssrLoadModule('/src/selectionReason.js')
  const {VIEWS,viewSearch}=await server.ssrLoadModule('/src/App.jsx')
  const data=JSON.parse(await readFile('src/data/confidence-results.json','utf8'))
  const before=JSON.stringify(data)
  for(const row of data.races){
    const reason=qualitativeReason({...row,selection_comment:'pf=0.123 score=99.99 寄与率1.234 λ=0.92'})
    assert.ok(!/[\d０-９]|past_form|\bpf\b|\bscore\b|係数|寄与率|λ|feature/.test(reason))
    for(const note of horseComments(row))assert.ok(render(SelectionComment,{rec:row}).includes(note.text))
    assert.ok(!reason.includes('スピード')&&!reason.includes('好調'),'do not invent performance grounds')
    const props={race:{race_id:row.race_id,race_date:row.race_date,race_no:row.race_no,name:row.race_name,entries:[]},rec:row,tickets:row.tickets,resultOverride:row.result,predictionOverride:predictionOf(row)}
    const tree=Card(props),html=render(Card,props)
    assert.ok(html.includes(Number(row.confidence).toFixed(3)))
    assert.equal((html.match(/選定理由/g)||[]).length,1)
    for(const h of row.selection_meta.top3)assert.ok(html.includes(`${h.umaban}番 ${h.name}`))
    const tickets=walk(tree,Disclosure).find(d=>d.props.label.startsWith('BOX6券'))
    assert.ok(tickets,'tickets must remain discoverable')
    const expanded=render(Disclosure,{...tickets.props,initialOpen:true})
    assert.equal((expanded.match(/<li/g)||[]).length,6)
    for(const ticket of row.tickets)assert.ok(expanded.includes(ticket.join('−')))
    assert.ok(!html.includes('ticket-grid'),'closed disclosure does not mount tickets')
    const resultTree=RaceResult(props)
    const provenance=walk(resultTree,Disclosure).find(d=>d.props.label.includes('出典'))
    const source=render(Disclosure,{...provenance.props,initialOpen:true})
    assert.ok(source.includes(row.snapshot_saved_at))
    if(row.result.status==='final'){
      assert.ok(source.includes('公式確定発表時刻'))
      assert.ok(html.includes('1着')&&html.includes('2着')&&html.includes('3着'))
      for(const kind of ['trifecta','trio'])for(const p of row.result.payouts[kind])assert.ok(html.includes(`¥${p.yen.toLocaleString('ja-JP')}`))
      if(row.snapshot_timing!=='prestart')assert.ok(html.includes('発走以後')&&html.includes('参考照合'))
      const rest=walk(OfficialFinishes({finishes:row.result.finishes}),Disclosure)[0]
      assert.ok(rest)
      const all=render(Disclosure,{...rest.props,initialOpen:true})
      for(const f of row.result.finishes.filter(f=>f.finish>3))assert.ok(all.includes(`${f.finish}着`)&&all.includes(f.name))
    }else{
      assert.ok(html.includes('結果待ち'))
      assert.ok(!html.includes('不的中')&&!html.includes('¥0')&&!html.includes('収支'))
    }
  }
  const unavailableRace={race_id:'unknown',race_date:'2099-01-01',race_no:1,entries:[]}
  for(const [status,label] of [['cancelled','競走取止'],['not_held','非開催']]){
    const html=render(RaceResult,{race:unavailableRace,resultOverride:{status,finishes:[]}})
    assert.ok(html.includes(label));assert.ok(!html.includes('不的中')&&!html.includes('¥0')&&!html.includes('結果待ち'))
  }
  assert.equal(JSON.stringify(data),before)
  const empty=render(Disclosure,{label:'詳細',children:createElement('div',null,'EXPENSIVE')})
  assert.ok(!empty.includes('EXPENSIVE'))
  const own={open:true},states=[]
  syncDisclosure({target:own,currentTarget:own},v=>states.push(v))
  own.open=false;syncDisclosure({target:own,currentTarget:own},v=>states.push(v))
  syncDisclosure({target:{open:true},currentTarget:own},v=>states.push(v))
  assert.deepEqual(states,[true,false],'open/close follow own native toggle, not nested toggle')
  for(const date of ['2026-11-06','2026-11-07','2026-11-08'])for(const view of VIEWS){
    const q=new URLSearchParams(viewSearch(date,view))
    assert.equal(q.get('date'),date);assert.equal(q.get('view')||'races',view)
  }
  assert.deepEqual([...VIEWS],['races','confidence','results','racecard'])
  const race=dayInfo('2026-11-07').races[0],preds=predict(race),rec=buildRaceRecommendation(race,preds)
  const predictedBefore=JSON.stringify(preds)
  const detail=render(RaceDetail,{race,preds,rec}),card=render(RaceCard,{race})
  assert.ok(!/<table|着順スコア|past_form|寄与|λ|feature|牽引力/.test(detail+card))
  assert.equal((card.match(/aria-label="公式実着順"/g)||[]).length,1,'do not duplicate official results in details')
  assert.equal((card.match(/選定理由/g)||[]).length,1)
  assert.equal(JSON.stringify(preds),predictedBefore)
  const css=await readFile('src/styles/theme.css','utf8')
  assert.ok(css.includes('min-height:44px'))
  assert.ok(css.includes('minmax(0,1fr)')&&css.includes('overflow-wrap:anywhere'))
  assert.ok(css.includes('@media(max-width:480px)'))
  assert.ok(css.includes('font-size: clamp(1.5rem, 1.1rem + 2vw, 2rem)'),'retain enlarged podium')
  const model=JSON.parse(await readFile('src/data/learned_model.json'));delete model.comment_style;delete model.confidence_method;delete model.card_score_age4;delete model.graded5_age4
  assert.equal(createHash('sha256').update(JSON.stringify(model)).digest('hex'),'877b650d3f340d403ad61667c415c8ee2f1967e76a928466ee31d4436edb55a5')
  console.log('PASS readable UI: current shared comments, no numeric rationale, confidence/6 tickets/payouts retained, lazy disclosure open/close, top3/all finishes, post-start/pending separation, single result section, route/date preservation, unchanged predictive model data (comment metadata allowed).')
}finally{await server.close()}
