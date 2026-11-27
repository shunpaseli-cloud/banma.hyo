import {renderToPipeableStream,renderToStaticMarkup} from 'react-dom/server'
// Resolve lazy route modules with React's server renderer, then compare stable
// static markup (not streaming chunk markers/byte-boundary padding).
export function renderResolved(element) {
  return new Promise((resolve,reject)=>{
    const stream=renderToPipeableStream(element,{
      onAllReady(){try{resolve(renderToStaticMarkup(element))}catch(error){reject(error)}finally{stream.abort()}},
      onError:reject,
    })
  })
}
