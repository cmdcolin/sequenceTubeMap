/// <reference types="vitest" />
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { defineConfig, transformWithOxc } from 'vite'
import { configDefaults } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.resolve(__dirname, 'src')
const appConfig = JSON.parse(readFileSync('./src/config.json', 'utf-8'))
const serverPort = process.env.SERVER_PORT
  ? parseInt(process.env.SERVER_PORT, 10)
  : (appConfig.serverPort ?? 3000)
const backendTarget = `http://localhost:${serverPort}`

// `pnpm start` is the dev server plus the express backend; `start:local` and
// vitest run under other modes and leave it out. One backend outlives config
// reloads, and the IPC channel lets it exit whenever vite does.
function startBackend() {
  return {
    name: 'start-backend',
    apply: (_config, { command, mode }) =>
      command === 'serve' && mode === 'development',
    configureServer() {
      globalThis.tubemapBackend ??= spawn(
        process.execPath,
        ['--experimental-strip-types', './src/server.mjs'],
        { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] },
      )
    },
  }
}

// exampleData is the mounted data directory the express backend serves from,
// and the built-in data sources reference it by relative path, so the built
// site needs its own copy alongside the bundle.
function copyExampleData() {
  return {
    name: 'copy-example-data',
    apply: 'build',
    async closeBundle() {
      const from = path.resolve(__dirname, 'exampleData')
      if (fs.existsSync(from)) {
        await fs.promises.cp(
          from,
          path.resolve(__dirname, 'build', 'exampleData'),
          {
            recursive: true,
          },
        )
      }
    },
  }
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'build',
  },
  plugins: [
    // Vite's oxc only processes .jsx/.tsx for JSX by default, and
    // src/end-to-end.test.js is a .js file full of JSX. This pre-plugin sends
    // our own .js sources through the JSX transform.
    {
      name: 'treat-js-files-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.js') || !id.startsWith(SRC_DIR)) return null
        return transformWithOxc(code, id, { lang: 'jsx' })
      },
    },
    react(),
    // @vitejs/plugin-react 6 transforms JSX with oxc and has no babel option,
    // so the React Compiler has to be run as its own Babel pass.
    await babel({ presets: [reactCompilerPreset()] }),
    copyExampleData(),
    startBackend(),
  ],
  server: {
    proxy: {
      '/api': { target: backendTarget, ws: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    // jsdom + MUI + the React Compiler make component tests genuinely slow;
    // under parallel load several cross vitest's 5s default and fail as
    // timeouts rather than on their assertions.
    testTimeout: 20000,
    // The express backend's own close() stops the cleanup interval, the file
    // watcher and the websocket server, so teardown doesn't need vitest's 10s
    // default to finish.
    teardownTimeout: 5000,
    fsModuleCache: true,
    // Agent worktrees are whole checkouts of their own branches
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
