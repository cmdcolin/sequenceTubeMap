// config-global.mjs: Provide access to the config, assuming config-client.js or config-server.mjs has been imported already.
// Import this instead of config.json! This is the One True Way to get the config!

const GLOBAL_NAME = '__sequence_tube_map_config'
const GLOBAL_HOME = globalThis

if (!GLOBAL_HOME[GLOBAL_NAME]) {
  throw new Error(
    'config-global.mjs loaded before either config-client.js or config-server.mjs',
  )
}

// Read keys lazily through a proxy. Tests load both config-server.mjs (via
// the express server) and config-client.js (via the App), and they each set
// globalThis at different points. A direct `export const config = global` would
// snapshot whichever module ran first; the proxy always sees the latest.
/** @type {any} */
export const config = new Proxy(
  {},
  {
    get(_, prop) {
      return GLOBAL_HOME[GLOBAL_NAME][prop]
    },
    has(_, prop) {
      return prop in GLOBAL_HOME[GLOBAL_NAME]
    },
    ownKeys() {
      return Reflect.ownKeys(GLOBAL_HOME[GLOBAL_NAME])
    },
    getOwnPropertyDescriptor(_, prop) {
      return Reflect.getOwnPropertyDescriptor(GLOBAL_HOME[GLOBAL_NAME], prop)
    },
  },
)

export default config
