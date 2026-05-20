// config-client.js: Must be run on the client before config-global.mjs will work.

import config from './config.json'

const GLOBAL_NAME = '__sequence_tube_map_config'
const GLOBAL_HOME = globalThis

// In dev, default to talking to the express backend at the same origin
// (webpack-dev-server proxies /api there). Production builds keep whatever
// config.json says — typically BACKEND_URL=false on gh-pages, which selects
// the WASM LocalAPI.
if (process.env.NODE_ENV !== 'production' && config.BACKEND_URL === false) {
  config.BACKEND_URL = ''
}

// Hide the config in the globals object when we run.
GLOBAL_HOME[GLOBAL_NAME] = config
