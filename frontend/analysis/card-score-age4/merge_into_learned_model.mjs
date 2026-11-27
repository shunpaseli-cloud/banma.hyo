// Adds/replaces ONLY the `card_score_age4` section of src/data/learned_model.json (textual append,
// existing 29-feature payload bytes untouched). Verifies every pre-existing field is unchanged.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
const sha=s=>createHash('sha256').update(s).digest('hex')
const file=new URL('../../src/data/learned_model.json',import.meta.url)
let raw=fs.readFileSync(file,'utf8')
const KEY=',"card_score_age4":'
if(raw.includes(KEY))raw=raw.slice(0,raw.indexOf(KEY))+'}'
const before=JSON.parse(raw),section=JSON.parse(fs.readFileSync(new URL('./card_score_age4_model.json',import.meta.url),'utf8'))
const out=raw.slice(0,-1)+KEY+JSON.stringify(section)+'}'
const check=JSON.parse(out);delete check.card_score_age4
if(JSON.stringify(check)!==JSON.stringify(before))throw new Error('existing payload changed')
fs.writeFileSync(file,out)
console.log(JSON.stringify({base_sha256:sha(raw),new_sha256:sha(out)}))
