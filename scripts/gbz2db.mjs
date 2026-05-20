#!/usr/bin/env node
// Convert a .gbz pangenome file to the .gbz.db SQLite-backed format that the
// in-browser LocalAPI consumes. Runs the gbz2db.wasm built by
// scripts/build-gbz-base-wasm.sh (vendored under vendor/gbz-base/) so the
// database version always matches the query.wasm the app loads at runtime.
//
// Usage: node scripts/gbz2db.mjs <input.gbz> <output.gbz.db>

import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WASI,
  File as WasiFile,
  OpenFile,
  PreopenDirectory,
  strace,
} from '@bjorn3/browser_wasi_shim'

const [inputArg, outputArg] = process.argv.slice(2)
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/gbz2db.mjs <input.gbz> <output.gbz.db>')
  process.exit(2)
}

const wasmPath = fileURLToPath(
  new URL('../vendor/gbz-base/gbz2db.wasm', import.meta.url),
)
const wasm = await WebAssembly.compile(await readFile(wasmPath))

const inputName = basename(inputArg)
const outputName = basename(outputArg)
const gbzBytes = await readFile(inputArg)
const gbzWasiFile = new WasiFile([])
gbzWasiFile.data = new Uint8Array(gbzBytes)

// gbz2db opens the output via SQLite, which calls unlink() + open(O_CREAT) —
// so any File we pre-place at outputName gets replaced. Read the directory's
// final contents map after the run instead of holding onto a reference.
const stdin = new WasiFile([])
const stdout = new WasiFile([])
const stderr = new WasiFile([])

const preopen = new PreopenDirectory(
  '.',
  new Map([[inputName, gbzWasiFile]]),
)

const wasi = new WASI(
  ['gbz2db', '--overwrite', '--output', outputName, inputName],
  ['RUST_BACKTRACE=full'],
  [
    new OpenFile(stdin),
    new OpenFile(stdout),
    new OpenFile(stderr),
    preopen,
  ],
)

const wasiImport = process.env.GBZ2DB_STRACE
  ? strace(wasi.wasiImport, ['fd_prestat_get', 'fd_prestat_dir_name'])
  : wasi.wasiImport
const instance = await WebAssembly.instantiate(wasm, {
  wasi_snapshot_preview1: wasiImport,
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

const outputFile = preopen.dir.contents.get(outputName)
if (!outputFile || !outputFile.data) {
  console.error(`gbz2db did not produce ${outputName}`)
  console.error(`Directory contents: ${[...preopen.dir.contents.keys()].join(', ')}`)
  process.exit(1)
}
await writeFile(outputArg, outputFile.data)
process.stderr.write(`Wrote ${outputArg} (${outputFile.data.length} bytes)\n`)
