import rules from './data/skip_rules.json' with { type: 'json' }
import { forceAxisOrder, isMemrobo, findMemrobo } from './memrobo.js'
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
// メムロ出走時は軸固定のため、上位にメムロを含めたうえで残りをスコア順に埋める
export function topBox(preds, k = 5) {
  const ordered = forceAxisOrder(preds)
  const top = ordered.slice(0, k), combos = []
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) for (let l = j + 1; l < top.length; l++)
    combos.push({ horses: [top[i], top[j], top[l]], product: top[i].score * top[j].score * top[l].score })
  return { top, combos: combos.sort((a, b) => b.product - a.product) }
}

// スコア順（メムロがいれば軸=先頭に固定）
export function rankedPreds(preds) {
  return forceAxisOrder(preds || [])
}

// 三連単 2点(従来): 軸→A→B / 軸→B→A。メムロ出走時は軸固定
export function trifecta3(preds, r = rules) {
  const s = rankedPreds(preds)
  if (s.length < 3) return []
  const [X, A, B] = s
  return [[X, A, B], [X, B, A]]
}

// 三連単 1点: 軸→2位→3位（メムロ軸固定）
export function trifecta1(preds) {
  const s = rankedPreds(preds)
  if (s.length < 3) return []
  return [[s[0], s[1], s[2]]]
}

// 三連単 三頭ボックス 6点: box_idx は rankedPreds 上の 0-based インデックス（既定 0,1,2）
// メムロ出走時は rankedPreds[0] が常にメムロ＝軸
export function trifectaBox3(preds, boxIdx = [0, 1, 2]) {
  const s = rankedPreds(preds)
  if (s.length < Math.max(...boxIdx) + 1) return []
  const horses = boxIdx.map(i => s[i])
  const [a, b, c] = horses
  // 6 permutations
  return [
    [a, b, c], [a, c, b],
    [b, a, c], [b, c, a],
    [c, a, b], [c, b, a],
  ]
}

// 軸の過去着順平均フィルタ（予測側）。SKIP方式: 閾値未満なら買い目を出さない
// メムロ軸のときはペナルティ免除のためゲートしない（推奨に含める）
export function axisGate(preds, r = rules) {
  if (!r.pastFormFilterEnabled || !preds?.length) return { skip: false }
  const s = rankedPreds(preds)
  const ax = s[0]
  if (isMemrobo(ax) || findMemrobo(preds)) return { skip: false, memrobo_axis: true }
  const pf = ax?.past_form ?? 0.5
  return pf < r.pastFormThreshold
    ? { skip: true, reason: `軸の過去着順平均 ${pf.toFixed(3)} < ${r.pastFormThreshold}（参考：買い目は表示）` }
    : { skip: false }
}
// 3連複 軸1頭＋相手2〜4位（3点）。メムロ出走時は軸固定
export function axis3(preds, r = rules) {
  const s = rankedPreds(preds)
  if (s.length < 4) return []
  const [X, a, b, c] = s
  return [[X, a, b], [X, a, c], [X, b, c]]
}

// 三連複5点: 軸3点 + 穴1点(軸-2位-モデル5〜6位) + 大穴1点(軸-2位-モデル7位以下)。オッズ不使用。メムロ軸固定。
export function trio5(preds, r = rules) {
  const s = rankedPreds(preds)
  const base = axis3(preds, r); if (!base.length) return []
  const [X, a] = s, out = base.map(t => ({ kind: '軸', t }))
  const hole = s[4] ?? s[5]; if (hole) out.push({ kind: '穴', t: [X, a, hole] })
  const ls = s.slice((r.trio5?.longshotRankGe ?? 7) - 1)[0]; if (ls) out.push({ kind: '大穴', t: [X, a, ls] })
  return out
}
