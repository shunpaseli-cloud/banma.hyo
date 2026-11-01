// 帯広の日別気象(Open-Meteo, APIキー不要)を src/data/weather_obihiro.json に保存。 node scripts/fetch_weather.mjs [start] [end]
import fs from 'node:fs'
const start = process.argv[2] || '2026-04-01', end = process.argv[3] || new Date(Date.now() - 864e5).toISOString().slice(0, 10)
const u = `https://archive-api.open-meteo.com/v1/archive?latitude=42.92&longitude=143.20&start_date=${start}&end_date=${end}&daily=precipitation_sum,relative_humidity_2m_mean&timezone=Asia%2FTokyo`
const d = (await (await fetch(u)).json()).daily
const out = { source: 'open-meteo archive 42.92,143.20', fetched_at: new Date().toISOString(), days: {} }
d.time.forEach((t, i) => { out.days[t] = { precip: d.precipitation_sum[i], rh: d.relative_humidity_2m_mean[i] } })
fs.writeFileSync(new URL('../src/data/weather_obihiro.json', import.meta.url), JSON.stringify(out))
console.log(Object.keys(out.days).length, 'days')
