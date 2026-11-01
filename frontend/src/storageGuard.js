// localStorage 安全弁: 全レース保持が原則。banma.* 合計が SOFT_BYTES 超 or レース数 MAX_RACES 超のときだけ古いレースから間引く
export const SOFT_BYTES = 4.5 * 1024 * 1024, MAX_RACES = 5000
export const totalBytes = () => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('banma.')) n += (k.length + (localStorage.getItem(k) || '').length) * 2 } return n }
// items: 配列, ridOf: race_id 取得。超過時のみ最古レースを1割ずつ削る
export function guardList(items, ridOf = x => x.race_id, extraBytes = 0) {
  let ids = [...new Set(items.map(ridOf))].sort()
  if (ids.length > MAX_RACES) ids = ids.slice(-MAX_RACES)
  let keep = new Set(ids), out = items.filter(x => keep.has(ridOf(x)))
  while (ids.length > 1 && totalBytes() - extraBytes + JSON.stringify(out).length * 2 > SOFT_BYTES) {
    ids = ids.slice(Math.ceil(ids.length * 0.1)); keep = new Set(ids); out = out.filter(x => keep.has(ridOf(x)))
  }
  return out
}
export const safeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch (e) { console.warn('localStorage 容量超過', k, e); return false } }
