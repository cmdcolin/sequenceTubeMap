/**
 * Node-side WASM loader. Selected via the "node" condition of the
 * `#wasm-loader` import map in package.json — used by vitest and any direct
 * Node consumers. The browser bundle never sees this file, so it can pull in
 * Node built-ins freely.
 */

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

let cached: Promise<WebAssembly.Module> | undefined

export function getCompiledWasm(): Promise<WebAssembly.Module> {
  cached ??= readFile(
    createRequire(import.meta.url).resolve('gbz-base/query.wasm'),
  ).then(bytes => WebAssembly.compile(bytes))
  return cached
}
