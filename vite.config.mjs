/// <reference types="vitest" />
import { defineConfig, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import { readFileSync } from 'fs'

const appConfig = JSON.parse(readFileSync('./src/config.json', 'utf-8'))
const serverPort = appConfig.serverPort || 3000
const serverTarget = `http://localhost:${serverPort}`

export default defineConfig({
  plugins: [
    // Vite's esbuild only processes .jsx/.tsx for JSX by default.
    // This pre-plugin makes .js files go through the JSX loader first.
    {
      name: 'treat-js-files-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.js') || id.includes('node_modules')) return null
        return transformWithOxc(code, id, { lang: 'jsx' })
      },
    },
    react(),
    wasm(),
  ],
  optimizeDeps: {
    extensions: ['.js'],
  },
  server: {
    host: process.env.HOST || '127.0.0.1',
    port: parseInt(process.env.PORT || '3001'),
    proxy: {
      '/api': {
        target: serverTarget,
        ws: true,
      }
    }
  },
  worker: {
    format: 'es',
    plugins: () => [wasm()],
    rollupOptions: {
      // wasi_snapshot_preview1 is a WASM runtime import, not a JS module
      external: ['wasi_snapshot_preview1'],
    },
  },
  build: {
    outDir: 'build',
    target: 'esnext',
    rollupOptions: {
      external: ['wasi_snapshot_preview1'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    transformIgnorePatterns: [
      'node_modules/(?!(@streamparser/json|@bjorn3/browser_wasi_shim)/)'
    ]
  }
})
