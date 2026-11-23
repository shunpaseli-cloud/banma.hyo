// 事後生成予想（当日保存予想が無い日だけ結果ページで参照）。保存予想 prediction_snapshot とは別系統で、成績に合算しない。
import { validRow } from './snapshotPolicy.js'
const FILES = import.meta.glob('./data/posthoc/posthoc_*.json', { eager: true, import: 'default' })
const BY_DATE = {}
for (const f of Object.values(FILES)) if (f?.schema === 'banma-posthoc-prediction-v1' && f.meta?.kind === 'posthoc') BY_DATE[f.meta.date] = f
export function posthocDay(date) { return BY_DATE[date] || null }
export function posthocRows(date) { const f = BY_DATE[date]; return f ? f.races.filter(r => r.snapshot_timing === 'posthoc' && validRow(r, f.meta.version)) : [] }
