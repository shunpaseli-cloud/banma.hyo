// Display-only official recent form (近走). Do not import this from the prediction engine.
import DATA from './data/official_recent_form.json'

export const STATUS_LABEL = {
  withdrawn: '取消',
  excluded: '除外',
  dnf: '中止',
  disqualified: '失格',
}

export function normalizeRaceId(id) {
  const m = String(id || '').match(/(\d{4})-?(\d{2})-?(\d{2})[-_]?R(\d{1,2})/i)
  if (!m) return id || ''
  return `${m[1]}${m[2]}${m[3]}-R${String(m[4]).padStart(2, '0')}`
}

function parseCompactDate(ymd) {
  const s = String(ymd)
  if (s.length === 6) return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s
}

const idx = {}
for (const [rid, rec] of Object.entries(DATA.races || {})) {
  const [ymd, raceNo, cls, field, runners] = rec
  const date = parseCompactDate(ymd)
  for (const item of runners || []) {
    const name = item[0]
    if (!name) continue
    const finish = item[1]
    const status = item.length > 2 ? item[2] : 'finished'
    ;(idx[name] ||= []).push({
      rid, date, raceNo, class: cls || null, finish: finish ?? null, field: field ?? null, status,
    })
  }
}
for (const name of Object.keys(idx)) idx[name].sort((a, b) => (a.rid < b.rid ? 1 : -1))

export function officialRecentForm(name, raceId, n = 5) {
  const list = idx[name]
  if (!list) return []
  const rid = normalizeRaceId(raceId)
  return list.filter(run => run.rid < rid).slice(0, n)
}

export function formatRunDate(date, refDate) {
  if (!date) return '—'
  const y = date.slice(0, 4), m = String(Number(date.slice(5, 7))), d = String(Number(date.slice(8, 10)))
  const refYear = refDate ? String(refDate).slice(0, 4) : y
  return y === refYear ? `${m}/${d}` : `${y.slice(2)}/${m}/${d}`
}

export function formatRunResult(run) {
  if (run.status && run.status !== 'finished' && STATUS_LABEL[run.status] && run.finish == null) {
    return STATUS_LABEL[run.status]
  }
  if (run.finish >= 1 && run.field >= 1) return `${run.finish}/${run.field}`
  if (run.finish >= 1) return `${run.finish}着`
  return '未確定'
}

export function formatRunClass(run) {
  return run?.class || '—'
}

export function formatRun(run, refDate) {
  return {
    date: formatRunDate(run.date, refDate),
    class: formatRunClass(run),
    result: formatRunResult(run),
    isWin: run.status === 'finished' && run.finish === 1,
  }
}

export const OFFICIAL_FORM_META = DATA.meta
