/**
 * Node-side WASM loader. Selected via the "node" condition of the
 * `#wasm-loader` import map in package.json — used by vitest and any direct
 * Node consumers. Reads our locally built query.wasm from vendor/gbz-base/.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

let cached: Promise<WebAssembly.Module> | undefined

// Resolve via `import.meta.dirname` (Node 21+) when available — that's the only
// reliable way to find a sibling file from inside vitest's jsdom env, which
// overrides `import.meta.url` to a non-file URL.
export function getCompiledWasm(): Promise<WebAssembly.Module> {
  cached ??= readFile(
    join(import.meta.dirname, '..', '..', '..', 'vendor', 'gbz-base', 'query.wasm'),
  ).then(bytes => WebAssembly.compile(bytes))
  return cached
}
