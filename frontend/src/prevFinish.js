import R from './data/results_from_pdf.json'
// name -> [{date, raceNo, finish, field}] sorted desc by race_id
const idx = {}
for (const [rid, rows] of Object.entries(R.races || {})) {
  for (const r of rows || []) {
    if (!r.name) continue
    ;(idx[r.name] ||= []).push({ rid, date: `${rid.slice(0,4)}-${rid.slice(4,6)}-${rid.slice(6,8)}`, raceNo: +rid.split('-R')[1], finish: r.finish, field: rows.length })
  }
}
for (const k in idx) idx[k].sort((a, b) => (a.rid < b.rid ? 1 : -1))
export function prevFinish(name, raceId) {
  const l = idx[name]; if (!l) return null
  return l.find(x => x.rid < raceId) || null
}
