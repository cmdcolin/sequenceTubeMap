#!/usr/bin/env node
// Convert a .gbz pangenome file to the .gbz.db SQLite-backed format that the
// in-browser LocalAPI consumes. Runs the same gbz2db.wasm that ships in
// node_modules/gbz-base — so versions can never drift from the query.wasm
// the app loads at runtime, unlike `cargo install gbz-base` (which tracks
// HEAD on crates.io and may produce a newer database version that the
// bundled query.wasm rejects).
//
// Usage: node scripts/gbz2db.mjs <input.gbz> <output.gbz.db>

import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createRequire } from 'node:module'
import {
  WASI,
  File as WasiFile,
  OpenFile,
  PreopenDirectory,
} from '@bjorn3/browser_wasi_shim'

const [inputArg, outputArg] = process.argv.slice(2)
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/gbz2db.mjs <input.gbz> <output.gbz.db>')
  process.exit(2)
}

const wasmPath = createRequire(import.meta.url).resolve('gbz-base/gbz2db.wasm')
const wasm = await WebAssembly.compile(await readFile(wasmPath))

const inputName = basename(inputArg)
const outputName = basename(outputArg)
const gbzBytes = await readFile(inputArg)
const gbzWasiFile = new WasiFile([])
gbzWasiFile.data = new Uint8Array(gbzBytes)

// Empty file to receive the output. gbz2db's `--output` writes here.
const outputWasiFile = new WasiFile([])

const stdin = new WasiFile([])
const stdout = new WasiFile([])
const stderr = new WasiFile([])

const wasi = new WASI(
  ['gbz2db', '--overwrite', '--output', outputName, inputName],
  ['RUST_BACKTRACE=full'],
  [
    new OpenFile(stdin),
    new OpenFile(stdout),
    new OpenFile(stderr),
    new PreopenDirectory(
      '.',
      new Map([
        [inputName, gbzWasiFile],
        [outputName, outputWasiFile],
      ]),
    ),
  ],
)

const instance = await WebAssembly.instantiate(wasm, {
  wasi_snapshot_preview1: wasi.wasiImport,
})

let code
try {
  code = wasi.start(instance)
} finally {
  const out = new TextDecoder().decode(stdout.data)
  const err = new TextDecoder().decode(stderr.data)
  if (out) process.stdout.write(out)
  if (err) process.stderr.write(err)
}

if (code !== undefined && code !== 0) {
  process.exit(code)
}

await writeFile(outputArg, outputWasiFile.data)
process.stderr.write(`Wrote ${outputArg} (${outputWasiFile.data.length} bytes)\n`)
