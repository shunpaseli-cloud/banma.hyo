import rules from './data/skip_rules.json' with { type: 'json' }
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

// 軸の過去着順平均フィルタ（予測側）。SKIP方式: 閾値未満なら買い目を出さない（次点軸に繰り上げない＝検証と一致）
export function axisGate(preds, r = rules) {
  if (!r.pastFormFilterEnabled || !preds?.length) return { skip: false }
  const ax = [...preds].sort((a, b) => b.score - a.score)[0]
  const pf = ax?.past_form ?? 0.5
  return pf < r.pastFormThreshold
    ? { skip: true, reason: `軸の過去着順平均 ${pf.toFixed(3)} < ${r.pastFormThreshold}（参考：買い目は表示）` }
    : { skip: false }
}
// 3連複 軸1頭＋相手2〜4位（3点）
export function axis3(preds, r = rules) {
  const s = [...preds].sort((a, b) => b.score - a.score)
  if (s.length < 4) return []
  const [X, a, b, c] = s
  return [[X, a, b], [X, a, c], [X, b, c]]
}
// 三連複5点: 軸3点 + 穴1点(軸-2位-モデル5〜6位) + 大穴1点(軸-2位-モデル7位以下)。オッズ不使用
export function trio5(preds, r = rules) {
  const s = [...preds].sort((a, b) => b.score - a.score)
  const base = axis3(preds, r); if (!base.length) return []
  const [X, a] = s, out = base.map(t => ({ kind: '軸', t }))
  const hole = s[4] ?? s[5]; if (hole) out.push({ kind: '穴', t: [X, a, hole] })
  const ls = s.slice((r.trio5?.longshotRankGe ?? 7) - 1)[0]; if (ls) out.push({ kind: '大穴', t: [X, a, ls] })
  return out
}
