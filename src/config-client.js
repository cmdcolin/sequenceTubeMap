// config-client.js: Must be run on the client before config-global.mjs will work.

import config from './config.json'

const GLOBAL_NAME = '__sequence_tube_map_config'
const GLOBAL_HOME = globalThis

// In dev, default to talking to the express backend at the same origin
// (webpack-dev-server proxies /api there). Production builds keep whatever
// config.json says — typically BACKEND_URL=false on gh-pages, which selects
// the WASM LocalAPI.
//
// Append `#local` to the dev URL to skip this override and run LocalAPI mode
// in dev without needing the express backend up. Paired with
// `pnpm start:local`, which launches only webpack-dev-server. We use the URL
// hash so saved view-target query strings never collide with the mode flag.
const forceLocal =
  typeof window !== 'undefined' && window.location.hash === '#local'
if (
  process.env.NODE_ENV !== 'production' &&
  !forceLocal &&
  config.BACKEND_URL === false
) {
  config.BACKEND_URL = ''
}

// Hide the config in the globals object when we run.
GLOBAL_HOME[GLOBAL_NAME] = config
