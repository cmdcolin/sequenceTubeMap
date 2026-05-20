/// <reference types="vitest" />
import { defineConfig, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

export default defineConfig({
  // Bare `import url from 'foo.wasm'` is a webpack asset-module pattern that
  // vitest's resolver can't satisfy. Tests don't exercise sql.js, so stub the
  // import to a tiny module that exports an empty string URL.
  resolve: {
    alias: [
      // sql.js asks `locateFile()` for the .wasm; in tests we return its
      // absolute path on disk so sql.js can load it via node's fs.
      {
        find: 'sql.js/dist/sql-wasm.wasm',
        replacement: fileURLToPath(
          new URL('./src/api/wasm/sql-wasm-url.node.ts', import.meta.url),
        ),
      },
      // query.wasm / gbz2db.wasm are loaded directly by the app code, not
      // via locateFile — the loaders in node tests use fs.readFile against
      // a hard-coded path, so tests don't need this URL. Stub it.
      {
        find: /\.wasm$/,
        replacement: fileURLToPath(
          new URL('./src/api/wasm/wasm-url-stub.ts', import.meta.url),
        ),
      },
    ],
  },
  plugins: [
    // Vite's oxc only processes .jsx/.tsx for JSX by default.
    // This pre-plugin makes .js source files go through the JSX transform.
    {
      name: 'treat-js-files-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.js') || id.includes('node_modules')) return null
        return transformWithOxc(code, id, { lang: 'jsx' })
      },
    },
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    transformIgnorePatterns: [
      'node_modules/(?!(@streamparser/json|@bjorn3/browser_wasi_shim)/)',
    ],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    teardownTimeout: 10000,
  },
})
