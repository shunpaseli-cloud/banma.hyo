// メムロボブサップ特例: 全ペナルティ免除 + 出走時は軸固定。
// 名前は空白除去＋NFKCで正規化し完全一致。別名表記とローカル horse_id も許容。
// 注意: 評価（剪定・特徴量・構成のヒット率/回収率）からは出走レースを除外すること（呼び出し側）。

export const MEMROBO_CANON = 'メムロボブサップ'
export const MEMROBO_HORSE_IDS = new Set(['H004']) // races.json ローカルID
const ALIAS_RE = [/memrobo\s*bussa?p/i, /memuro\s*bobusapu?/i]

export function normalizeHorseName(n) {
  return String(n ?? '').normalize('NFKC').replace(/[\s\u3000]/g, '')
}

export function isMemrobo(x) {
  if (x == null) return false
  if (typeof x === 'string') {
    const n = normalizeHorseName(x)
    if (n === MEMROBO_CANON) return true
    return ALIAS_RE.some(r => r.test(x))
  }
  if (typeof x === 'object') {
    if (x.horse_id != null && MEMROBO_HORSE_IDS.has(String(x.horse_id))) return true
    if (x.id != null && MEMROBO_HORSE_IDS.has(String(x.id))) return true
    if (isMemrobo(x.name)) return true
  }
  return false
}

export function findMemrobo(list) {
  return (list || []).find(isMemrobo) || null
}

export function raceHasMemrobo(raceOrEntries) {
  const ents = Array.isArray(raceOrEntries) ? raceOrEntries : raceOrEntries?.entries
  return !!(ents && findMemrobo(ents))
}

/** スコア降順。メムロがいれば先頭（軸）に固定。他馬の相対順は維持。 */
export function forceAxisOrder(preds, scoreKey = 'score') {
  const sorted = [...(preds || [])].sort((a, b) => (b[scoreKey] ?? -1e9) - (a[scoreKey] ?? -1e9))
  const i = sorted.findIndex(isMemrobo)
  if (i <= 0) return sorted
  const [m] = sorted.splice(i, 1)
  return [m, ...sorted]
}

/**
 * 連勝などスコア補正。メムロはペナルティ項を常に0。
 * k: 連勝ペナルティ係数, w: past_form ボーナス
 */
export function adjustedScore(p, { k = 0, w = 0, scoreKey = 'score' } = {}) {
  const base = p?.[scoreKey] ?? p?.finish_score ?? 0
  const streak = p?.horse_streak ?? p?.hs ?? 0
  const pf = p?.past_form ?? 0.5
  const pen = isMemrobo(p) ? 0 : k * Math.min(Number(streak) || 0, 3)
  return base - pen + w * pf
}

export function rankByAdjusted(preds, opts = {}) {
  const scored = (preds || []).map(p => ({ p, s: adjustedScore(p, opts) }))
  scored.sort((a, b) => b.s - a.s)
  const ordered = scored.map(x => x.p)
  return forceAxisOrder(ordered.map((p, i) => {
    // forceAxisOrder sorts by scoreKey; stamp temporary score for reorder
    return { ...p, __adj: adjustedScore(p, opts) }
  }), '__adj').map(({ __adj, ...rest }) => rest)
}
