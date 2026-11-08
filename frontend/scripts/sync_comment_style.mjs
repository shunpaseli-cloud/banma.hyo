// Build-time projection only: keep the large learned model out of the comment UI chunk.
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const root=new URL('../',import.meta.url),sha=v=>createHash('sha256').update(v).digest('hex')
const raw=await fs.readFile(new URL('src/data/learned_model.json',root)),model=JSON.parse(raw)
if(model.comment_style?.version!=='newspaper-short-v1')throw new Error('Missing supported learned_model.comment_style; refusing silent style fallback')
const {comment_style,confidence_method,...predictionPayload}=model
const projection={source:'learned_model.json#comment_style',model_file_sha256:sha(raw),predictive_payload_sha256:sha(JSON.stringify(predictionPayload)),comment_style_sha256:sha(JSON.stringify(comment_style)),comment_style}
const bytes=JSON.stringify(projection,null,2)+'\n'
for(const relative of ['src/data/comment_style.json','public/comment-style.json']){
 const target=new URL(relative,root);let old;try{old=await fs.readFile(target,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 if(old!==bytes){const tmp=fileURLToPath(target)+'.tmp';await fs.writeFile(tmp,bytes);await fs.rename(tmp,target)}
}
console.log('Comment metadata synced; predictive payload unchanged:',projection.predictive_payload_sha256)

if(confidence_method){
 const text=JSON.stringify(confidence_method,null,2)+'\n';for(const relative of ['src/data/confidence_policy.json','public/confidence-policy.json']){const target=new URL(relative,root);let old;try{old=await fs.readFile(target,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}if(old!==text)await fs.writeFile(target,text)}
}
