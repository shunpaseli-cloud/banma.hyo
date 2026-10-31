// ばんえい競馬 結果スクレイパー（ブラウザ fetch のみ・バックエンドなし）
// 注: obikan.net は 2026-10 調査時点で接続不可（DNS は引けるが応答なし）。
// 結果ページは帯広競馬場の公式レース情報と同じ地方競馬全国協会(keiba.go.jp)の
// 「レース成績表」(RaceMarkTable, 帯広 babaCode=3) を使う。
import races from './data/races.json'
import { predict, updateWithResult } from './feedback.js'
import { analyzeMisses } from './missAnalysis.js'
import BUNDLED_PDF_RESULTS from './data/results_from_pdf.json'

export const BABA_CODE = 3 // 帯広
const RESULT_BASE = 'https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable'
// Cloudflare Workers プロキシURL。frontend/.env に
//   VITE_PROXY_URL=https://your-worker.workers.dev
// と書いて再ビルド。順序: direct → Workers → allorigins.win → corsproxy.io。
export const WORKER_PROXY_URL = (import.meta.env.VITE_PROXY_URL || '').replace(/\/+$/, '')
const enc = encodeURIComponent
const FETCH_CHAIN = [
  ['direct', (u) => u],
  ...(WORKER_PROXY_URL ? [['worker', (u) => `${WORKER_PROXY_URL}/?url=${enc(u)}`]] : []),
  ['allorigins', (u) => `https://api.allorigins.win/raw?url=${enc(u)}`],
  ['corsproxy.io', (u) => `https://corsproxy.io/?url=${enc(u)}`], // 任意の最終手段
]
export const MIN_INTERVAL_MS = 60_000
const LAST_KEY = 'banma.lastAutoFetch'

// raceId(例 "20261031-R01") または race オブジェクト → 結果URL
// race.resultUrl があればそれを優先
export function buildResultUrl(raceOrId) {
  const race = typeof raceOrId === 'string' ? races.find(r => r.race_id === raceOrId) : raceOrId
  if (race?.resultUrl) return race.resultUrl
  const id = race?.race_id ?? raceOrId
  const m = /^(\d{4})(\d{2})(\d{2})-R(\d+)$/.exec(id)
  if (!m) throw new Error(`raceId の形式が不正: ${id}`)
  const date = `${m[1]}/${m[2]}/${m[3]}`
  return `${RESULT_BASE}?k_raceDate=${encodeURIComponent(date)}&k_raceNo=${+m[4]}&k_babaCode=${BABA_CODE}`
}

async function fetchHtml(url) {
  const errors = []
  for (const [name, wrap] of FETCH_CHAIN) {
    try {
      const r = await fetch(wrap(url), name === 'direct' ? { mode: 'cors' } : undefined)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const text = await r.text()
      if (!text) throw new Error('空のレスポンス')
      return text
    } catch (e) {
      console.warn(`[scraper] ${name} で取得失敗 → 次へ`, e.message)
      errors.push(`${name}: ${e.message}`)
    }
  }
  throw new Error(`全経路で取得失敗 (${errors.join(' / ')})`)
}

export const normalizeName = (s) => (s || '').normalize('NFKC').replace(/[\s\u3000]+/g, '').trim()

// 成績表(HTML)パーサー: keiba.go.jp RaceMarkTable の section.gradeTable
// 列: td.a=着順, td.b=枠, td.c=馬番, td.d=馬名(horseName), td.h=騎手 （枠≠馬番、調教師≠騎手に注意）
export function parseResults(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out = []
  doc.querySelectorAll('section.gradeTable table tr').forEach(tr => {
    const t = (sel) => tr.querySelector(sel)?.textContent.normalize('NFKC').trim() ?? ''
    const fin = parseInt(t('td.a'), 10)
    const name = normalizeName(tr.querySelector('td.d, td.horseName')?.textContent)
    const umaban = parseInt(t('td.c'), 10)
    const gate = parseInt(t('td.b'), 10)
    if (name && fin > 0) out.push({ name, finish: fin, umaban: umaban || null, gate: gate || null, jockey: normalizeName(t('td.h')) })
  })
  return out
}

// ① PDF成績表（scripts/fetch_pdf_results.py が生成）: まず同一オリジンの /results.json を最新取得、
//    だめなら同梱版。② HTML (keiba.go.jp) をプロキシ連鎖で取得。
let pdfCache = null
async function loadPdfResults() {
  if (pdfCache) return pdfCache
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}results.json`, { cache: 'no-store' })
    if (r.ok) { pdfCache = await r.json(); return pdfCache }
  } catch (e) { console.warn('[scraper] results.json 取得失敗 → 同梱版', e.message) }
  pdfCache = BUNDLED_PDF_RESULTS
  return pdfCache
}
export async function getPdfResults(raceId) {
  const rows = (await loadPdfResults())?.races?.[raceId]
  return rows?.length ? rows.map(r => ({ ...r, name: normalizeName(r.name) })) : null
}

export async function getResults(raceId) {
  const errs = []
  try {
    const pdf = await getPdfResults(raceId)
    if (pdf) return { source: 'pdf', rows: pdf }
    errs.push('PDF: 該当レースなし')
  } catch (e) { errs.push(`PDF: ${e.message}`) }
  try {
    const rows = parseResults(await fetchHtml(buildResultUrl(raceId)))
    if (rows.length) return { source: 'html', rows }
    errs.push('HTML: 着順なし（未確定 or 構造変更）')
  } catch (e) { errs.push(`HTML: ${e.message}`) }
  throw new Error(errs.join(' / '))
}

// 馬名→horse_id のあいまい照合（完全一致→部分一致）
function matchToEntries(race, rows) {
  const results = {}, unmatched = []
  for (const row of rows) {
    const e = race.entries.find(x => normalizeName(x.name) === row.name)
      || (row.umaban != null && race.entries.find(x => x.umaban === row.umaban && !x.name))
      || race.entries.find(x => { const n = normalizeName(x.name); return n.includes(row.name) || row.name.includes(n) })
    if (e) results[e.horse_id] = row.finish; else unmatched.push(row.name)
  }
  if (unmatched.length) console.warn(`[scraper] ${race.race_id} 未一致の馬名:`, unmatched)
  return results
}

export async function fetchAndUpdate(race) {
  try {
    const { source, rows } = await getResults(race.race_id)
    const results = matchToEntries(race, rows)
    if (!Object.keys(results).length) throw new Error('出走馬と一致する馬名なし')
    predict(race, true) // 予想を保存してから結果で学習
    const _pr = predict(race); const _u = updateWithResult(race, results)
    return { ok: true, source, ..._u, misses: analyzeMisses(race, _pr, results) }
  } catch (e) {
    console.error(`[scraper] ${race.race_id} 取得失敗:`, e)
    return { ok: false, race_id: race.race_id, error: e.message }
  }
}

// 60秒ガード付き一括更新
export function secondsUntilNextFetch() {
  const last = +localStorage.getItem(LAST_KEY) || 0
  return Math.max(0, Math.ceil((last + MIN_INTERVAL_MS - Date.now()) / 1000))
}
export async function autoFetchAll(raceList) {
  const wait = secondsUntilNextFetch()
  if (wait > 0) return { skipped: true, wait }
  localStorage.setItem(LAST_KEY, String(Date.now()))
  const res = []
  for (const r of raceList) res.push(await fetchAndUpdate(r))
  return { skipped: false, results: res }
}
