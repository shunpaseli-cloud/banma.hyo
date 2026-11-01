// 馬場水分。実測値(race.track_moisture, %)を優先し、無ければ帯広の気象から推定(あくまで推定)。
import W from './data/weather_obihiro.json' with { type: 'json' }
const live = {} // クライアントで取得した予報 { 'YYYY-MM-DD': {precip, rh} }
const day = (d, k) => new Date(new Date(d + 'T00:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10)
const wx = d => live[d] || W.days?.[d] || null
// 正規化: 同梱 races.json の実測値は 0.8〜3.5%。ばんえいの水分は概ね 0.5〜6% 程度として
//   norm = clamp((m - 0.5) / 5.5, 0, 1)
export const normMoisture = m => m == null ? null : Math.max(0, Math.min(1, (m - 0.5) / 5.5))
// 推定式: keiba.go.jp 実測(88日・1056R)で拡張窓OLSを当てた最終係数(検証 /tmp/moisture_learn_loop.py)
//   est% = 2.330 + 0.036*当日降水mm + 0.038*前日降水mm + 0.002*当日平均湿度% - 0.132*et0(当日+前日+前々日, mm)
//   0.5〜8 にclamp、0.1刻み。当日の気象が無ければ null。et0欠損日は 0 扱い
export const MOISTURE_COEF = { intercept: 2.330, rain0: 0.036, rain1: 0.038, hum: 0.002, et0_3day: -0.132 }
export function estimateMoisture(date) {
  const a = wx(date); if (!a || a.precip == null) return null
  const b = wx(day(date, -1)), c = wx(day(date, -2)), C = MOISTURE_COEF
  const et3 = (a.et0 ?? 0) + (b?.et0 ?? 0) + (c?.et0 ?? 0)
  const v = C.intercept + C.rain0 * a.precip + C.rain1 * (b?.precip ?? 0) + C.hum * (a.rh ?? 70) + C.et0_3day * et3
  return Math.round(Math.max(0.5, Math.min(8, v)) * 10) / 10
}
export const dateOfRid = rid => `${rid.slice(0, 4)}-${rid.slice(4, 6)}-${rid.slice(6, 8)}`
// race に track_moisture_est / track_moisture_source を付与し、スコア用の値(%)を返す
export function resolveMoisture(race) {
  const date = race.race_date || dateOfRid(race.race_id)
  if (race.track_moisture != null) { race.track_moisture_source = 'measured'; return { pct: +race.track_moisture, source: 'measured' } }
  const est = estimateMoisture(date)
  race.track_moisture_est = est; race.track_moisture_source = est != null ? 'weather' : 'default'
  return { pct: est, source: race.track_moisture_source }
}
// 当日・直近の予報をブラウザで取得(失敗しても同梱データで動く)
export async function loadForecast() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=42.92&longitude=143.20&daily=precipitation_sum,relative_humidity_2m_mean,et0_fao_evapotranspiration&past_days=2&forecast_days=3&timezone=Asia%2FTokyo')
    const d = (await r.json()).daily
    d.time.forEach((t, i) => { live[t] = { precip: d.precipitation_sum[i], rh: d.relative_humidity_2m_mean[i], et0: d.et0_fao_evapotranspiration[i] } })
    return true
  } catch { return false }
}
