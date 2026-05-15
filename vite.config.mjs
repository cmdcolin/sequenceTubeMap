/// <reference types="vitest" />
import { defineConfig, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
    setupFiles: './src/setupTests.js',
    transformIgnorePatterns: [
      'node_modules/(?!(@streamparser/json|@bjorn3/browser_wasi_shim)/)'
    ],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/'
      }
    }
  }
})
