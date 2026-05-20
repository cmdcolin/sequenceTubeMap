// CLI-side replacement for src/api/wasm/loader.node.ts. The original uses
// `import.meta.dirname` to find vendor/gbz-base/query.wasm relative to its
// source location; after esbuild bundles it into build/, that math is wrong.
// Resolve from process.cwd() instead — pnpm scripts run from the repo root.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let cached: Promise<WebAssembly.Module> | undefined

export function getCompiledWasm(): Promise<WebAssembly.Module> {
  cached ??= readFile(resolve(process.cwd(), 'vendor/gbz-base/query.wasm'))
    .then(bytes => WebAssembly.compile(bytes))
  return cached
}
