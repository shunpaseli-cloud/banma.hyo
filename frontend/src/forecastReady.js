let ready
export function forecastReady() {
  if (import.meta.env.SSR) return Promise.resolve()
  // Preserve the prediction views' existing forecast-before-predict timing.
  ready ||= import('./moisture.js').then(({loadForecast})=>Promise.race([
    loadForecast(),new Promise(resolve=>setTimeout(resolve,4000)),
  ])).catch(()=>undefined)
  return ready
}
