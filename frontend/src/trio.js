// 3連複（ボックス）予想。全 C(n,3) 通りを スコア積 で順位付け。
// EV指標: 各組の 積/全組の積の合計 = 確率質量シェア(share)、積/平均積 = 期待値倍率(evRatio, 1.0=平均)
export function trioPredictions(preds) {
  const s = preds.filter(p => p.score > 0)
  const combos = []
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) for (let k = j + 1; k < s.length; k++)
    combos.push({ horses: [s[i], s[j], s[k]], product: s[i].score * s[j].score * s[k].score })
  const total = combos.reduce((a, c) => a + c.product, 0) || 1
  const mean = total / (combos.length || 1)
  combos.forEach(c => { c.share = c.product / total; c.evRatio = c.product / mean })
  combos.sort((a, b) => b.product - a.product)
  return { combos, count: combos.length }
}
// 上位5頭ボックス(10点): 着順スコア上位5頭の全 C(5,3) 組み合わせ（積の大きい順）
export function topBox(preds, k = 5) {
  const top = [...preds].sort((a, b) => b.score - a.score).slice(0, k), combos = []
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) for (let l = j + 1; l < top.length; l++)
    combos.push({ horses: [top[i], top[j], top[l]], product: top[i].score * top[j].score * top[l].score })
  return { top, combos: combos.sort((a, b) => b.product - a.product) }
}
