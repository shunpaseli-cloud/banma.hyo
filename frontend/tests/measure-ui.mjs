import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
try{
 const {dayInfo}=await server.ssrLoadModule('/src/lib/paginate.js')
 const {predict}=await server.ssrLoadModule('/src/feedback.js')
 const names={confidenceResults:'/src/components/ConfidenceResults.jsx',confidence:'/src/components/ConfidenceRank.jsx',races:'/src/components/RaceList.jsx',detail:'/src/components/RaceDetail.jsx'}
 const report={dom:{},assets:[]}
 for(const [key,file] of Object.entries(names)){
  const {default:Component}=await server.ssrLoadModule(file)
  const race=dayInfo('2026-11-07').races[0]
  const html=renderToStaticMarkup(createElement(Component,key==='detail'?{race,preds:predict(race)}:{date:'2026-11-07'}))
  report.dom[key]={elements:(html.match(/<[A-Za-z][^>]*>/g)||[]).length,htmlBytes:Buffer.byteLength(html)}
 }
 const dir=process.argv[2]
 for(const file of await readdir(path.join(dir,'assets'))){
  if(!/\.(js|css)$/.test(file))continue
  const bytes=await readFile(path.join(dir,'assets',file))
  report.assets.push({file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length})
 }
 report.totalJsBytes=report.assets.filter(a=>a.file.endsWith('.js')).reduce((s,a)=>s+a.bytes,0)
 report.totalJsGzipBytes=report.assets.filter(a=>a.file.endsWith('.js')).reduce((s,a)=>s+a.gzipBytes,0)
 try {
  const manifest=JSON.parse(await readFile(path.join(dir,'.vite/manifest.json'),'utf8'))
  const entry=Object.keys(manifest).find(k=>manifest[k].isEntry)
  const routes={shell:[],confidenceResults:['src/components/ConfidenceResults.jsx'],confidence:['src/components/ConfidenceRank.jsx','src/moisture.js'],races:['src/components/RaceList.jsx','src/moisture.js']}
  report.routeJs={}
  for(const [route,keys] of Object.entries(routes)){
   const included=new Set()
   const visit=key=>{if(included.has(key))return;included.add(key);for(const dep of manifest[key].imports||[])visit(dep)}
   visit(entry);for(const key of keys)visit(key)
   const files=[...included].map(key=>manifest[key].file).filter(file=>file.endsWith('.js'))
   const assets=files.map(file=>report.assets.find(a=>a.file===path.basename(file)))
   report.routeJs[route]={files,requests:files.length,bytes:assets.reduce((s,a)=>s+a.bytes,0),gzipBytes:assets.reduce((s,a)=>s+a.gzipBytes,0)}
  }
 } catch(error) {if(error.code!=='ENOENT')throw error}
 await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report))
}finally{await server.close()}
