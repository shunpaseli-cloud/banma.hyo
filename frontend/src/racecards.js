// 出走表ページの日付索引（ファイル名 racecard_YYYY-MM-DD.json から。データ本体は出走表ページ側で遅延読込）。
// 予想・学習データ(past/, races_from_pdf.json)とは独立。
import { todayJST } from './upcoming.js'
const KEYS = Object.keys(import.meta.glob('./data/racecards/racecard_*.json'))
export const RACECARD_DATES = KEYS.map(k => k.match(/racecard_(\d{4}-\d\d-\d\d)\.json$/)?.[1]).filter(Boolean).sort()
export const RACECARD_DEFAULT_DATE = RACECARD_DATES.find(d => d >= todayJST()) || RACECARD_DATES[RACECARD_DATES.length - 1] || null
