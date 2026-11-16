import STYLE from '../data/comment_style.json'

// Presentation only. Input is the shared saved selection, never a new prediction or result.
export function horseComments(rec, policy=STYLE.comment_style) {
  const meta=rec?.selection_meta||{},used=new Set()
  return (meta.top3||[]).map((horse,index)=>{
    const axis=Number(horse.umaban)===Number(meta.axis?.umaban)
    const role=axis?'axis':index===1?'partner':'cover'
    const prediction=rec?.predictions?.find(p=>p.name===horse.name)
    const contributions=prediction?.top_contribs||(axis?meta.axis?.top_contribs:[])||[]
    const supported=contributions.filter(c=>Number.isFinite(c.contrib)&&c.contrib>0&&Number.isFinite(c.value)&&policy.feature_phrases[c.name])
    const evidence=supported.find(c=>!used.has(c.name))||supported[0]
    let text
    if(evidence){
      used.add(evidence.name)
      const phrases=policy.feature_phrases[evidence.name]
      const end=rec?.recommended===false?policy.skipped[role]:axis&&meta.memrobo_axis?policy.roles.fixed_axis:policy.roles[role]
      text=phrases[index%phrases.length]+end
    }else if(axis&&meta.memrobo_axis&&rec?.recommended!==false){text=policy.roles.fixed_axis}
    else{text=(rec?.recommended===false?policy.fallback_skipped:policy.fallback)[role]}
    return {...horse,role,text,evidence_feature:evidence?.name||null,evidence_source:evidence?'saved_positive_contribution':'saved_selection_role'}
  })
}
export function qualitativeReason(rec) { return horseComments(rec).map(h=>h.text).join(' ') }
export default function SelectionComment({ rec }) {
  const notes=horseComments(rec)
  return <div className="selection-comment" data-comment-style={STYLE.comment_style.version} data-comment-model={STYLE.model_file_sha256}>
    <h3>選定理由</h3>
    {rec?.selection_meta?.box_method==='card_score_age4'&&<p className="box-method muted" data-box-method="card_score_age4">買い目の3頭は、4歳以上限定の出走表評価で選びました。</p>}
    {notes.length?notes.map(h=><p className="horse-comment" key={h.umaban}><strong>{h.name}</strong><span>　{h.text}</span></p>):<p>保存された選定馬の情報がなく、寸評は用意できません。</p>}
  </div>
}
