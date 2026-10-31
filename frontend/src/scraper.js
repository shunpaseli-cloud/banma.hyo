// ばんえい競馬 結果スクレイパー（ブラウザ fetch のみ・バックエンドなし）
// 注: obikan.net は 2026-10 調査時点で接続不可（DNS は引けるが応答なし）。
// 結果ページは帯広競馬場の公式レース情報と同じ地方競馬全国協会(keiba.go.jp)の
// 「レース成績表」(RaceMarkTable, 帯広 babaCode=3) を使う。
import races from './data/races.json'
import { updateWithResult } from './feedback.js'

export const BABA_CODE = 3 // 帯広
const RESULT_BASE = 'https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable'
// Cloudflare Workers プロキシURL。frontend/.env に
//   VITE_PROXY_URL=https://your-worker.workers.dev
// と書いて再ビルド。未設定なら corsproxy.io → allorigins.win を順に試す。
export const WORKER_PROXY_URL = (import.meta.env.VITE_PROXY_URL || '').replace(/\/+$/, '')
const enc = encodeURIComponent
const FETCH_CHAIN = [
  ['direct', (u) => u],
  ...(WORKER_PROXY_URL ? [['worker', (u) => `${WORKER_PROXY_URL}/?url=${enc(u)}`]] : []),
  ['corsproxy.io', (u) => `https://corsproxy.io/?url=${enc(u)}`],
  ['allorigins', (u) => `https://api.allorigins.win/raw?url=${enc(u)}`],
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

// 成績表パーサー: section.gradeTable の各 tr → td.a=着順, td.horseName=馬名
export function parseResults(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows = doc.querySelectorAll('section.gradeTable table tr')
  const out = []
  rows.forEach(tr => {
    const fin = parseInt(tr.querySelector('td.a')?.textContent.trim(), 10)
    const name = normalizeName(tr.querySelector('td.horseName')?.textContent)
    if (name && fin > 0) out.push({ name, finish: fin }) // 取消・除外(数字以外)は除く
  })
  return out
}

export async function getResults(raceId) {
  const html = await fetchHtml(buildResultUrl(raceId))
  const rows = parseResults(html)
  if (!rows.length) throw new Error('着順が見つかりません（未確定 or HTML構造変更）')
  return rows
}

// 馬名→horse_id のあいまい照合（完全一致→部分一致）
function matchToEntries(race, rows) {
  const results = {}, unmatched = []
  for (const row of rows) {
    const e = race.entries.find(x => normalizeName(x.name) === row.name)
      || race.entries.find(x => { const n = normalizeName(x.name); return n.includes(row.name) || row.name.includes(n) })
    if (e) results[e.horse_id] = row.finish; else unmatched.push(row.name)
  }
  if (unmatched.length) console.warn(`[scraper] ${race.race_id} 未一致の馬名:`, unmatched)
  return results
}

export async function fetchAndUpdate(race) {
  try {
    const rows = await getResults(race.race_id)
    const results = matchToEntries(race, rows)
    if (!Object.keys(results).length) throw new Error('出走馬と一致する馬名なし')
    return { ok: true, ...updateWithResult(race, results) }
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
