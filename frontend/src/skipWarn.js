import rules from './data/skip_rules.json'
// 表示のみの見送り警告。買い目は隠さない。
export function skipWarnings(race, preds, r = rules) {
  const out = []
  const n = race.entries?.length || 0
  if (r.warnEnabled && n >= r.warnFieldGe) out.push(`見送り推奨（${n}頭立て）`)
  if (r.scoreSpreadWarnEnabled) {
    const s = preds.map(p => p.finish_score ?? p.score).filter(v => v != null).sort((a, b) => b - a)
    if (s.length >= 5 && s[0] - s[4] < r.warnScoreSpread) out.push(`見送り推奨（スコア差小 ${(s[0] - s[4]).toFixed(3)}）`)
  }
  return out
}
