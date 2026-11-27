import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const MODEL = 'e657cd397eccf5ca5b256d5ece69422b7fe0cffd8cb595663e4bf475ee403893'
const sha = buf => createHash('sha256').update(buf).digest('hex')
const memory = new Map()
globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) }

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
try {
  const { officialRecentForm, formatRun, formatRunResult, formatRunClass, normalizeRaceId, OFFICIAL_FORM_META } =
    await server.ssrLoadModule('/src/recentFormDisplay.js')
  const { default: RecentForm } = await server.ssrLoadModule('/src/components/RecentForm.jsx')
  const { default: RecentFormBody } = await server.ssrLoadModule('/src/components/RecentFormBody.jsx')
  const { default: RaceCardsView } = await server.ssrLoadModule('/src/components/RaceCardsView.jsx')
  const { default: RaceCard } = await server.ssrLoadModule('/src/components/RaceCard.jsx')
  const { racecardDay } = await server.ssrLoadModule('/src/racecardData.js')
  const { dayInfo } = await server.ssrLoadModule('/src/lib/paginate.js')

  assert.equal(sha(await readFile('src/data/learned_model.json')), MODEL, 'learned_model.json must stay unchanged')
  assert.equal(OFFICIAL_FORM_META.purpose.includes('display-only'), true)
  assert.equal(normalizeRaceId('2026-11-28-R1'), '20261128-R01')

  const before = JSON.stringify(officialRecentForm('サクセスドリーム', '20261128-R01', 5))
  const runs = officialRecentForm('サクセスドリーム', '20261128-R01', 5)
  assert.equal(JSON.stringify(officialRecentForm('サクセスドリーム', '20261128-R01', 5)), before, 'lookup must not mutate the catalog')
  assert.equal(runs.length, 5)
  assert.equal(runs[0].date, '2026-11-16')
  assert.equal(runs[0].class, 'C2-4')
  assert.equal(formatRunResult(runs[0]), '5/10')
  assert.ok(runs.every(r => r.rid < '20261128-R01'))

  const maker = officialRecentForm('ジェイメーカー', '20261128-R01', 5)
  const dnf = maker.find(r => r.date === '2026-08-16')
  assert.ok(dnf, '8/16 official run must be present')
  assert.equal(dnf.status, 'dnf')
  assert.equal(dnf.class, 'C2-6')
  assert.equal(formatRunResult(dnf), '中止')
  assert.equal(dnf.finish, null)

  const scratch = officialRecentForm('シンエイライデン', '20261128-R01', 5).find(r => r.date === '2026-11-23')
  assert.ok(scratch)
  assert.equal(scratch.status, 'withdrawn')
  assert.equal(formatRunResult(scratch), '取消')
  assert.equal(formatRunClass({ class: null }), '—')
  assert.equal(formatRunResult({ status: 'finished', finish: null, field: 10 }), '未確定')
  assert.deepEqual(officialRecentForm('存在しない馬名xyz', '20261128-R01', 5), [])

  const card = racecardDay('2026-11-28')
  const race = card.races[0]
  const box = [9, 10, 8]
  const body = renderToStaticMarkup(createElement(RecentFormBody, { raceId: race.race_id, raceDate: race.race_date, entries: race.entries, boxUmaban: box }))
  const open = renderToStaticMarkup(createElement(RecentForm, { raceId: race.race_id, raceDate: race.race_date, entries: race.entries, boxUmaban: box, initiallyOpen: true }))
  assert.ok(body.includes('kinso-panel') && body.includes('#16130F') === false)
  assert.ok(body.includes('9番 サクセスドリーム') && body.includes('BOX'))
  assert.ok(body.includes('11/16') && body.includes('C2-4') && body.includes('5/10'))
  assert.ok(body.includes('中止'), 'DNF must display 中止, not a guessed position')
  assert.ok(!body.includes('overflow-x:auto'))
  assert.ok(open.includes('近走（公式・直近5走）'))
  assert.ok(open.includes('近走（公式・直近5走）'))
  for (const e of race.entries) assert.ok(body.includes(e.name))

  const racecardHtml = renderToStaticMarkup(createElement(RaceCardsView, { date: '2026-11-28', onDate: () => {} }))
  assert.ok(racecardHtml.includes('近走（公式・直近5走）'))
  assert.equal((racecardHtml.match(/近走（公式・直近5走）/g) || []).length, 12)

  const predRace = dayInfo('2026-11-28').races[0]
  const pred = renderToStaticMarkup(createElement(RaceCard, { race: predRace }))
  assert.ok(pred.includes('近走（公式・直近5走）'))
  assert.ok(pred.includes('3頭BOX') || pred.includes('軸') || pred.includes('推奨') || pred.includes('見送り'))

  const css = await readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8')
  for (const token of ['#16130F', '#F3EEE4', '#D85A2A', '#221E18', '.kinso-panel', 'flex-wrap', 'overflow-wrap:anywhere']) {
    assert.ok(css.includes(token), `theme must include ${token}`)
  }
  const kinso = css.slice(css.indexOf('/* Display-only official recent form'))
  assert.ok(!/overflow(?:-x)?\s*:\s*(?:auto|scroll)/.test(kinso), '近走 CSS must not introduce horizontal scroll')
  assert.ok(!/min-width\s*:\s*\d{3,}px/.test(kinso))

  if (process.env.BANMA_HEADLESS === '1') {
    const temp = await mkdtemp(path.join(tmpdir(), 'banma-kinso-'))
    try {
      const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      let frames = ''
      for (const width of [320, 375, 880]) {
        const inner = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main class="app" style="max-width:${width}px">${body}</main>`
        frames += `<iframe data-width="${width}" style="width:${width}px;height:2000px;border:0" srcdoc="${escape(inner)}"></iframe>`
      }
      const measure = `window.addEventListener('load',()=>{
        const reports=[...document.querySelectorAll('iframe')].map(frame=>{
          const doc=frame.contentDocument, win=frame.contentWindow;
          const els=[...doc.querySelectorAll('.kinso-panel,.kinso-horse,.kinso-runs,.kinso-run,.kinso-horse-head')];
          return {width:win.innerWidth, noOverflow:els.every(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().right<=win.innerWidth+1),
            bg:win.getComputedStyle(doc.querySelector('.kinso-panel')).backgroundColor};
        });
        const report=document.createElement('pre');report.id='measurements';report.textContent=JSON.stringify(reports);document.body.appendChild(report);
      });`
      const file = path.join(temp, 'render.html')
      await writeFile(file, `<!doctype html><meta charset="utf-8">${frames}<script>${measure}</script>`)
      const output = execFileSync('/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', `--user-data-dir=${path.join(temp, 'profile')}`, '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=5000', '--dump-dom', `file://${file}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
      const match = output.match(/<pre id="measurements">([\s\S]*?)<\/pre>/)
      assert.ok(match, 'headless renderer must report measurements')
      const reports = JSON.parse(match[1])
      for (const r of reports) {
        assert.ok(r.noOverflow, `${r.width}px: 近走 must not overflow horizontally`)
        assert.ok(r.bg.includes('22, 19, 15') || r.bg.includes('#16130F'), 'night-dirt background')
      }
      console.log('PASS headless 320/375/880 no horizontal overflow', JSON.stringify(reports))
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => {})
    }
  }

  console.log('PASS recent-form display: official last-5 date/class/finish, 取消/中止, missing as 未確定/—, no model change, 11/28 all runners, night-dirt CSS, no kinso horizontal scroll rules.')
} finally {
  await server.close()
}
