import rules from './data/skip_rules.json' with { type: 'json' }
// 表示のみの見送り警告。買い目は隠さない。
export function skipWarnings(race, preds, r = rules) {
  const out = []
  const n = race.entries?.length || 0
  if (r.warnEnabled && n >= r.warnFieldGe) out.push(`見送り推奨（${n}頭立て）`)
  if (r.scoreSpreadWarnEnabled) {
    const s = preds.map(p => p.finish_score ?? p.score).filter(v => v != null).sort((a, b) => b - a)
    if (s.length >= 5 && s[0] - s[4] < r.warnScoreSpread) out.push(`見送り推奨（スコア差小 ${(s[0] - s[4]).toFixed(3)}）`)
  }
  if (r.pastFormWarnEnabled && preds.length) {
    const ax = [...preds].sort((a, b) => (b.finish_score ?? b.score ?? -1e9) - (a.finish_score ?? a.score ?? -1e9))[0]
    const pf = ax?.past_form ?? 0.5 // 過去走なし=学習時の補完値0.5
    if (pf < r.pastFormThreshold) out.push('軸の過去着順平均が弱い（見送り推奨）')
  }
  return out
}
