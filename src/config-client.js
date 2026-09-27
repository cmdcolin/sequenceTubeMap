// config-client.js: Must be run on the client before config-global.mjs will work.

import config from './config.json' with { type: 'json' }

const GLOBAL_NAME = '__sequence_tube_map_config'
const GLOBAL_HOME = globalThis

// In dev, talk to the express backend at the same origin, where the Vite dev
// server proxies /api. Production builds keep whatever config.json says —
// typically BACKEND_URL=false on gh-pages, which selects the in-browser
// LocalAPI.
//
// Append `#local` to the dev URL to skip this override and run LocalAPI in dev
// without the express backend; `pnpm start:local` starts Vite alone and opens
// that URL. The flag lives in the hash so a view's query string never collides
// with it, and reads as one `&`-separated flag among the fragment's params, so
// `#local&region=...` works alongside a fragment-encoded view.
const forceLocal =
  typeof window !== 'undefined' &&
  window.location.hash.replace(/^#\??/, '').split('&').includes('local')
if (
  process.env.NODE_ENV !== 'production' &&
  !forceLocal &&
  config.BACKEND_URL === false
) {
  config.BACKEND_URL = ''
}

// Hide the config in the globals object when we run.
GLOBAL_HOME[GLOBAL_NAME] = config
