// ばん馬表 CORS プロキシ (Cloudflare Workers)
// GET /?url=<encoded URL> → サーバー側で fetch して本文を返す。CORS: *
const CACHE_TTL = 300 // 5分（古いレース結果を長く保持しない）
const ALLOWED_HOSTS = ['obikan.net', 'www.obikan.net', 'keiba.go.jp', 'www.keiba.go.jp']
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}
const err = (status, msg) => new Response(JSON.stringify({ error: msg }), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
})

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'GET') return err(405, 'GET only')
    const raw = new URL(request.url).searchParams.get('url')
    if (!raw) return err(400, 'url パラメータが必要です')
    let target
    try { target = new URL(raw) } catch { return err(400, 'url が不正です') }
    if (!/^https?:$/.test(target.protocol)) return err(400, 'http(s) のみ対応')
    // 悪用防止: 競馬サイトのみ許可（必要なら ALLOWED_HOSTS に追加）
    if (!ALLOWED_HOSTS.some(h => target.hostname === h || target.hostname.endsWith('.' + h)))
      return err(403, `許可されていないホスト: ${target.hostname}`)

    const cache = caches.default
    const key = new Request(target.toString(), { method: 'GET' })
    const hit = await cache.match(key)
    if (hit) { const r = new Response(hit.body, hit); r.headers.set('X-Proxy-Cache', 'HIT'); return r }

    let upstream
    try {
      upstream = await fetch(target.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (banma-hyo proxy)', 'Accept': 'text/html,*/*' },
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
      })
    } catch (e) { return err(502, `upstream fetch 失敗: ${e.message}`) }

    const headers = new Headers(CORS)
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/html; charset=utf-8')
    headers.set('Cache-Control', `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`)
    headers.set('X-Proxy-Cache', 'MISS')
    const res = new Response(upstream.body, { status: upstream.status, headers })
    if (upstream.ok) ctx.waitUntil(cache.put(key, res.clone()))
    return res
  },
}
