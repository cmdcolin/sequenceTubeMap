// config-server.mjs: Must be run on the server before config-global.mjs will work.

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

// In a jsdom test environment, import.meta.url is http://, not file://.
// Fall back to resolving config.json from the process working directory.
const configUrl = new URL('config.json', import.meta.url)
const configPath =
  configUrl.protocol === 'file:'
    ? fileURLToPath(configUrl)
    : join(process.cwd(), 'src', 'config.json')
const config = JSON.parse(readFileSync(configPath))

const GLOBAL_NAME = '__sequence_tube_map_config'
const GLOBAL_HOME = globalThis

// Hide the config in the globals object when we run.
GLOBAL_HOME[GLOBAL_NAME] = config
