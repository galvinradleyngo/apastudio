// Cloudflare Worker: fetches a web page server-side so the browser app can read its metadata
// without depending on public CORS proxies.
// Usage from the app: https://<your-worker>.workers.dev/?url=https%3A%2F%2Fexample.com%2Farticle
const MAX_BYTES = 1_500_000;

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    let url;
    try {
      url = new URL(target);
    } catch (e) {
      return new Response('Missing or invalid url parameter', { status: 400, headers: cors });
    }
    if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(url.hostname)) {
      return new Response('Blocked address', { status: 400, headers: cors });
    }

    try {
      const upstream = await fetch(url.href, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; APAStudioBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      const type = upstream.headers.get('content-type') || '';
      if (!/html|xml/i.test(type)) {
        return new Response(`Unsupported content type: ${type}`, { status: 415, headers: cors });
      }
      const reader = upstream.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      const body = new Blob(chunks);
      return new Response(body, {
        status: 200,
        headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'X-Final-Url': upstream.url },
      });
    } catch (e) {
      return new Response('Fetch failed', { status: 502, headers: cors });
    }
  },
};
