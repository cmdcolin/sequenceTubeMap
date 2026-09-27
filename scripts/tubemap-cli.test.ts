// @vitest-environment node

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES = path.join(SCRIPTS, '..', 'doc', 'tubemap-cli-samples')

// The renders scripts/make-cli-samples.sh makes, by output name.
const SAMPLE_ARGS: Record<string, string[]> = {
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [
      `demo-example-${n}`,
      ['--example', String(n)],
    ]),
  ),
  'demo-example-6-compressed': ['--example', '6', '--compressed'],
  'snp1kg-BRCA1': ['--source', 'snp1kg-BRCA1 (gbz-base)', '--legend'],
}

let outDir = ''

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), 'tubemap-cli-'))
})

afterAll(async () => {
  await rm(outDir, { force: true, recursive: true })
})

describe('tubemap-cli', () => {
  it('has a case for every checked-in sample', async () => {
    const samples = (await readdir(SAMPLES))
      .filter(name => name.endsWith('.svg'))
      .map(name => name.replace(/\.svg$/, ''))
    expect(samples.sort()).toEqual(Object.keys(SAMPLE_ARGS).sort())
  })

  it.concurrent.each(Object.entries(SAMPLE_ARGS))(
    'reproduces %s',
    async (name, args) => {
      const out = path.join(outDir, `${name}.svg`)
      await run(process.execPath, [
        '--experimental-strip-types',
        path.join(SCRIPTS, 'tubemap-cli.ts'),
        ...args,
        '--out',
        out,
      ])
      const [rendered, sample] = await Promise.all([
        readFile(out, 'utf8'),
        readFile(path.join(SAMPLES, `${name}.svg`), 'utf8'),
      ])
      // toBe would print two 60 KB strings on a mismatch.
      expect(
        rendered === sample,
        `${name}.svg changed; if that is intended, rerun scripts/make-cli-samples.sh`,
      ).toBe(true)
    },
    60_000,
  )
})
