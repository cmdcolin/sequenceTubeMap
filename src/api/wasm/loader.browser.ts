/**
 * Browser-side WASM loader. Selected via the "browser" condition of the
 * `#wasm-loader` import map in package.json.
 *
 * The bare `.wasm` import is handled by webpack's `asset/resource` rule, which
 * emits a URL string we can fetch and compile-stream.
 */

// @ts-expect-error -- webpack returns a URL via asset/resource
import wasmUrl from 'gbz-base/query.wasm'

let cached: Promise<WebAssembly.Module> | undefined

export function getCompiledWasm(): Promise<WebAssembly.Module> {
  cached ??= WebAssembly.compileStreaming(fetch(wasmUrl))
  return cached
}
