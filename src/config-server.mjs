// config-server.mjs: Must be run on the server before config-global.mjs will work.

import rawConfig from './config.json' with { type: 'json' }

globalThis.sequenceTubeMapConfig = structuredClone(rawConfig)
