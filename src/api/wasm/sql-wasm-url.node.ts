// Vitest alias target for `sql.js/dist/sql-wasm.wasm` — returns the absolute
// filesystem path so sql.js's `locateFile()` resolves the wasm via node's
// fs in tests. In the browser, webpack handles this import directly.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
export default require.resolve('sql.js/dist/sql-wasm.wasm')
