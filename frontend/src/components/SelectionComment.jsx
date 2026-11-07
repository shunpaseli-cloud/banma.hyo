// Presentation only: describe existing metadata, never regenerate predictions or invent contributions.
export function qualitativeReason(rec) {
  const meta = rec?.selection_meta || {}
  if (rec?.recommended === false) {
    return meta.axis?.past_form_ok === false
      ? '軸の近走内容が推奨条件に届かないため見送りです。表示している組合せは参考です。'
      : '推奨条件を満たしていないため見送りです。組合せは参考として表示しています。'
  }
  if (meta.memrobo_axis) return '軸固定の保存ルールを適用した組合せです。相手は保存された評価上位から選んでいます。'
  if (meta.axis && meta.axis.past_form_ok === true && meta.box_idx?.join(',') === '0,1,2') {
    return '軸はモデル評価で上位の馬です。近走内容が推奨条件を満たしており、相手も評価上位から選んでいます。'
  }
  if (meta.axis && meta.top3?.length >= 3) return 'モデル評価で上位となった馬を中心に、保存された組合せを表示しています。'
  return '保存された選定ルールに基づく組合せです。細かな計算値は元データに保持しています。'
}
export default function SelectionComment({ rec }) {
  return <div className="selection-comment"><h3>選定理由</h3><p>{qualitativeReason(rec)}</p></div>
}
