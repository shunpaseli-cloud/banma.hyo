export const STATUS_LABELS = {
  missing: '未取得', provisional: '未確定・未公表', final: '確定',
  cancelled: '競走取止', not_held: '非開催',
}
const positiveInt=n=>Number.isInteger(n)&&n>0
const validCombo=c=>Array.isArray(c)&&c.length===3&&c.every(positiveInt)&&new Set(c).size===3
export function reconcileBox(result, prediction) {
  const unknown = reason => ({ status: 'unavailable', reason, returnYen: null, profitYen: null })
  if (result.status !== 'final') return unknown(STATUS_LABELS[result.status] || '未取得')
  if (!prediction) return unknown('当時の保存予想なし')
  if (!prediction.recommended) return unknown('保存予想は見送り（購入想定なし）')
  if (result.refunds?.length || result.finishes?.some(f => !['finished', 'dnf'].includes(f.status || (f.finish ? 'finished' : 'unknown')))) {
    return unknown('取消・除外・返還等あり（通常の的中／外れと分けて精算確認）')
  }
  // Official payout combinations also handle dead heats. Missing dividends are not zero.
  const payouts = result.payouts?.trifecta
  if (!Array.isArray(payouts) || !payouts.length || payouts.some(p => !validCombo(p.combo) || !positiveInt(p.yen))) {
    return unknown('三連単払戻未取得・要確認')
  }
  const winners = payouts.filter(p => prediction.tickets.some(t => t.join('-') === p.combo.join('-')))
  const returnYen = winners.reduce((sum, p) => sum + p.yen, 0)
  return { status: winners.length ? 'hit' : 'miss', returnYen, profitYen: returnYen - prediction.stakeYen }
}
