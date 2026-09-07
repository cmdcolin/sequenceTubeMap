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
    setupFiles: './src/setupTests.ts',
    transformIgnorePatterns: [
      'node_modules/(?!(@streamparser/json)/)',
    ],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    // jsdom + MUI + the React Compiler make component tests genuinely slow;
    // under parallel load several cross vitest's 5s default and fail as
    // timeouts rather than on their assertions.
    testTimeout: 20000,
    teardownTimeout: 10000,
  },
})
