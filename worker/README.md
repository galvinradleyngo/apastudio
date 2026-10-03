# Metadata proxy (optional)

The citation generator reads page metadata in the browser, which many sites block. This tiny
Cloudflare Worker fetches the page for it. Without it the app falls back to public proxies and
the Wayback Machine, which are less reliable.

## Deploy
1. Create a free Cloudflare account and a new Worker (Workers & Pages > Create > Hello World).
2. Replace the code with `metadata-proxy.js` and deploy.
3. In `index.html`, set the proxy before the main script runs, e.g. add
   `<script>window.APA_METADATA_PROXY = 'https://YOUR-WORKER.workers.dev/';</script>`
   just above the main `<script>` block.

The Worker only returns HTML pages (max ~1.5 MB), refuses private/local addresses, and only allows browser requests from the origins listed in `ALLOWED_ORIGINS` at the top of `metadata-proxy.js`.
