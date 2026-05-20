// Tests don't fetch sql.js / query.wasm at runtime; vitest's resolver can't
// handle bare `.wasm` imports (webpack's asset/resource rule does that in the
// app build), so vite.config.mjs aliases all .wasm imports to this stub.
export default ''
