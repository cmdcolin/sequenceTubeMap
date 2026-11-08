// config-global.mjs: Provide access to the config, assuming config-client.js or config-server.mjs has been imported already.
// Import this instead of config.json! This is the One True Way to get the config!

const initialConfig = globalThis.sequenceTubeMapConfig

if (!initialConfig) {
  throw new Error(
    'config-global.mjs loaded before either config-client.js or config-server.mjs',
  )
}

const currentConfig = () => globalThis.sequenceTubeMapConfig ?? initialConfig

// Read keys lazily through a proxy. Tests load both config-server.mjs (via
// the express server) and config-client.js (via the App), and they each set
// globalThis at different points. A direct `export const config = global` would
// snapshot whichever module ran first; the proxy always sees the latest.
export const config = new Proxy(initialConfig, {
  get(_, prop) {
    return Reflect.get(currentConfig(), prop)
  },
  has(_, prop) {
    return Reflect.has(currentConfig(), prop)
  },
  ownKeys() {
    return Reflect.ownKeys(currentConfig())
  },
  getOwnPropertyDescriptor(_, prop) {
    return Reflect.getOwnPropertyDescriptor(currentConfig(), prop)
  },
})

export default config
