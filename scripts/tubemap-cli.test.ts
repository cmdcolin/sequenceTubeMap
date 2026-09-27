// @vitest-environment node

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAMPLES = path.join(REPO, 'doc', 'tubemap-cli-samples')

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

async function render(name: string, args: string[], cwd = REPO) {
  const out = path.join(outDir, `${name}.svg`)
  await run(
    process.execPath,
    [
      '--experimental-strip-types',
      path.join(REPO, 'scripts', 'tubemap-cli.ts'),
      ...args,
      '--out',
      out,
    ],
    { cwd },
  )
  return readFile(out, 'utf8')
}

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
      const [rendered, sample] = await Promise.all([
        render(name, args),
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

  it.concurrent('draws --graph and --reads, relative to the working directory, as a link to the same files draws them', async () => {
    const graph = 'exampleData/internal/snp1kg-BRCA1.gbz.db'
    const reads = 'exampleData/internal/NA12878-BRCA1.sorted.gam'
    const fromOutDir = (file: string) =>
      path.relative(outDir, path.join(REPO, file))
    const [flags, link] = await Promise.all([
      render(
        'graph-flags',
        [
          '--graph',
          fromOutDir(graph),
          '--reads',
          fromOutDir(reads),
          '--region',
          '17:1-100',
          '--legend',
        ],
        outDir,
      ),
      render('graph-link', [
        '--url',
        `?region=17:1-100&tracks=graph:${graph},read:${reads}`,
        '--legend',
      ]),
    ])
    expect(flags === link).toBe(true)
  }, 60_000)

  it.concurrent('names haplotypes from --haplotype-index as the configured source does', async () => {
    const graph = [
      '--graph',
      'exampleData/hprc-chrM.gbz.db',
      '--region',
      'GRCh38#chrM:1-200',
    ]
    const [indexed, unindexed, source] = await Promise.all([
      render('chrM-indexed', [
        ...graph,
        '--haplotype-index',
        'exampleData/hprc-chrM.haplotype-index.db',
      ]),
      render('chrM-unindexed', graph),
      render('chrM-source', [
        '--source',
        'HPRC chrM (gbz-base, companion index)',
      ]),
    ])
    expect(indexed === source).toBe(true)
    expect(unindexed === source).toBe(false)
  }, 60_000)
})
