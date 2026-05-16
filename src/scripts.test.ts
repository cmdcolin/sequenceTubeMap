// @vitest-environment node
// Tests for data import scripts, to make sure vg still supports them.

import './config-server.mjs'

import { find_vg } from './vg.mjs'

import { mkdtemp, rm, cp, open, access } from 'node:fs/promises'
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

let workDir = ''

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'test-'))
})

afterEach(async () => {
  if (workDir) {
    await rm(workDir, { force: true, recursive: true })
  }
})

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
  console.log('Save graph to ' + graphPath)
  const file = await open(graphPath, 'w')
  await file.writeFile(vgBuffer)
  await file.close()

  // We can't use expect here because await expect(...).resolves doesn't actually detect rejections.
  console.log('Call script')
  const { stdout, stderr } = await execFile(
    join(SCRIPTS, 'prepare_vg.sh'),
    [join(workDir, 'x.vg')],
  )
  console.log('stdout:', stdout)
  console.log('stderr:', stderr)
  await access(join(workDir, 'x.vg.xg'))
  await access(join(workDir, 'x.vg.gbwt'))
}, 30000)
