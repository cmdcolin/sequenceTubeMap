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
      // WorkerImplementation imports loader.browser.ts (for the browser), but
      // tests run in Node. Redirect the full-string regex match to the node
      // loader so vitest never processes the bare `import wasmUrl from '*.wasm'`
      // that webpack handles but vite cannot.
      {
        find: /^.*\/loader\.browser\.ts$/,
        replacement: fileURLToPath(
          new URL('./src/api/wasm/loader.node.ts', import.meta.url),
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
