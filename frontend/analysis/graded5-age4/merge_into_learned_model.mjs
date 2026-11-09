// Adds/replaces ONLY the `graded5_age4` section. Existing 29-feature + card_score_age4 bytes stay identical.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
const sha = s => createHash('sha256').update(s).digest('hex')
const file = new URL('../../src/data/learned_model.json', import.meta.url)
let raw = fs.readFileSync(file, 'utf8')
const KEY = ',"graded5_age4":'
if (raw.includes(KEY)) raw = raw.slice(0, raw.indexOf(KEY)) + '}'
const before = JSON.parse(raw)
const section = JSON.parse(fs.readFileSync(new URL('./graded5_age4_model.json', import.meta.url), 'utf8'))
const out = raw.slice(0, -1) + KEY + JSON.stringify(section) + '}'
const check = JSON.parse(out)
delete check.graded5_age4
if (JSON.stringify(check) !== JSON.stringify(before)) throw new Error('existing payload (incl card_score_age4) changed')
// also verify 29-feature numeric hash excluding sidecar sections
const { comment_style, confidence_method, card_score_age4, graded5_age4, ...predictive } = JSON.parse(out)
const numeric = (v, p = '') => typeof v === 'number' ? [[p, v]] : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => numeric(x, p + '/' + k)) : []
const nsha = sha(JSON.stringify(numeric(predictive)))
if (nsha !== '3b20528d5641cf6e96eeac8df244afee7411c2c408ce873c55af409040b5f3b8') throw new Error('13911 numeric hash changed: ' + nsha)
fs.writeFileSync(file, out)
console.log(JSON.stringify({ base_sha256: sha(raw), new_sha256: sha(out), numeric_13911: nsha, graded_version: section.version }))
