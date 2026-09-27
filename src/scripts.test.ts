// @vitest-environment node

// @vitest-environment node
// Tests for data import scripts, to make sure vg still supports them.

import './config-server.mjs'

import { find_vg, vg_available } from './vg.mjs'

import {
  mkdtemp,
  rm,
  cp,
  open,
  access,
  readdir,
  readFile,
} from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import child_process from 'node:child_process'
import { promisify } from 'node:util'

// Takes a command file and an array of arguments and returns a promise
// for {stdout, stderr} that rejects if the command fails.
const execFile = promisify(child_process.execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXAMPLE_DATA = join(__dirname, '..', 'exampleData')
const SCRIPTS = join(__dirname, '..', 'scripts')

// Everything here shells out to vg, so the whole file skips when it isn't
// installed, the same way the network tests in src/api/GBZBaseAPI.test.ts opt
// in.
const HAS_VG = vg_available()
const HAS_JQ = child_process.spawnSync('jq', ['--version']).status === 0

let workDir = ''

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'test-'))
})

afterEach(async () => {
  if (workDir) {
    await rm(workDir, { force: true, recursive: true })
  }
})

describe.skipIf(!HAS_VG)('data import scripts', () => {
  it('can run prepare_vg.sh', async () => {
    for (const filename of ['x.fa', 'x.vcf.gz', 'x.vcf.gz.tbi']) {
      await cp(join(EXAMPLE_DATA, filename), join(workDir, filename))
    }

    const vgBuffer = (
      await execFile(
        find_vg(),
        [
          'construct',
          '-r',
          join(workDir, 'x.fa'),
          '-v',
          join(workDir, 'x.vcf.gz'),
          '-a',
        ],
        { encoding: 'buffer' },
      )
    ).stdout
    const graphPath = join(workDir, 'x.vg')
    const file = await open(graphPath, 'w')
    await file.writeFile(vgBuffer)
    await file.close()

    // We can't use expect here because await expect(...).resolves doesn't actually detect rejections.
    await execFile(join(SCRIPTS, 'prepare_vg.sh'), [join(workDir, 'x.vg')])
    await access(join(workDir, 'x.vg.xg'))
    await access(join(workDir, 'x.vg.gbwt'))
  }, 30000)

  it.skipIf(!HAS_JQ)(
    'can run prepare_chunks.sh with a haplotype file',
    async () => {
      for (const filename of ['x.vg.xg', 'x.vg.gbwt']) {
        await cp(join(EXAMPLE_DATA, filename), join(workDir, filename))
      }

      const { stdout } = await execFile(
        join(SCRIPTS, 'prepare_chunks.sh'),
        ['-x', 'x.vg.xg', '-h', 'x.vg.gbwt', '-r', 'x:1-100', '-o', 'chunk'],
        { cwd: workDir },
      )
      expect(stdout).toBe('x\t1\t100\tRegion x:1-100\tchunk\n')
      const chunkDir = join(workDir, 'chunk')
      const annotations = (await readdir(chunkDir)).filter(name =>
        name.endsWith('.annotate.txt'),
      )
      expect(annotations).toHaveLength(1)
      const haplotypes = await readFile(
        join(chunkDir, annotations[0] ?? ''),
        'utf-8',
      )
      expect(haplotypes).toMatch(/^thread_0\t/m)
    },
    30000,
  )
})
