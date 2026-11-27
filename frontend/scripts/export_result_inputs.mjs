// Result-input export only: never call predict, updateWithResult or training routines.
import { createServer } from 'vite'
import { writeFile } from 'node:fs/promises'
const server = await createServer({ server: { middlewareMode: true } })
try {
  const { DATES, dayInfo } = await server.ssrLoadModule('/src/lib/paginate.js')
  const { resultForRace, learningInput } = await server.ssrLoadModule('/src/raceResults.js')
  const inputs = DATES.flatMap(date => dayInfo(date).races).map(r => learningInput(r, resultForRace(r))).filter(Boolean)
  const output = { schema_version: 1, adapter: 'feedback.updateWithResult(race, input.results)',
    note: '入力データのみ・学習未実行。中止等は数値着順から除外。', inputs }
  await writeFile(new URL('../public/feedback-inputs.json', import.meta.url), JSON.stringify(output, null, 2) + '\n')
  console.log(`Exported ${inputs.length} race inputs; no training performed`)
} finally { await server.close() }
