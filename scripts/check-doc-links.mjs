#!/usr/bin/env node
// Fails when a markdown file cites a repo path that no longer exists. Docs
// drift silently when files are renamed; this catches it in CI.
import { execFileSync, execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'

const ROOTS = 'src|scripts|doc|agent-docs|exampleData|docker|public'
const CITATION = new RegExp(
  '`((?:' + ROOTS + ')/[A-Za-z0-9/_.-]+?)(?::\\d+)?`',
  'g',
)

const docs = execSync('git ls-files "*.md"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const cited = new Map()
for (const doc of docs) {
  for (const [, path] of readFileSync(doc, 'utf8').matchAll(CITATION)) {
    if (!existsSync(path)) {
      cited.set(doc + ' ' + path, { doc, path })
    }
  }
}

// A gitignored path (local sample data, build output) is legitimately absent
// from a fresh checkout, so it is not a stale citation.
const candidates = [...cited.values()]
const ignored = new Set()
if (candidates.length > 0) {
  const paths = [...new Set(candidates.map(c => c.path))]
  const matched = execFileSync('git', ['check-ignore', '--stdin'], {
    input: paths.join('\n'),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  for (const p of matched.split('\n').filter(Boolean)) {
    ignored.add(p)
  }
}

const stale = candidates.filter(c => !ignored.has(c.path))
if (stale.length > 0) {
  console.error(stale.length + ' stale path citation(s) in docs:\n')
  for (const { doc, path } of stale) {
    console.error('  ' + doc + ' cites ' + path + ' — no such file')
  }
  console.error('\nUpdate the doc, or point the citation at the file that replaced it.')
  process.exit(1)
}
console.log('checked ' + docs.length + ' markdown files, all cited repo paths exist')
