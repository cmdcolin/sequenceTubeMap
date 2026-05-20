/**
 * Read path metadata out of a gbz-base `.gbz.db` SQLite file using sql.js.
 *
 * The `.gbz.db` schema (from gbz-base v0.5) has a `Paths` table with
 * (sample, contig, haplotype, fragment, is_indexed) and a `ReferenceIndex`
 * table that lets us approximate path length via MAX(path_offset). We pull
 * the reference (indexed) paths and surface them as PathInfo for the
 * "Paths in this graph" panel.
 */

import type { Database, SqlJsStatic } from 'sql.js'
import type { PathInfo } from '../../Types.ts'

// sql.js is ~660KB of WASM/JS that's only needed when the LocalAPI/WASM
// backend has to introspect a `.gbz.db`. Dynamic-import it so the main
// bundle (and server-backend users) don't pay for it on first paint.
let sqlJsPromise: Promise<SqlJsStatic> | undefined

function getSqlJs(): Promise<SqlJsStatic> {
  sqlJsPromise ??= (async () => {
    const [{ default: initSqlJs }, sqlWasmModule] = await Promise.all([
      import('sql.js'),
      // @ts-expect-error -- webpack asset/resource gives us a URL string
      import('sql.js/dist/sql-wasm.wasm') as Promise<{ default: string }>,
    ])
    return initSqlJs({ locateFile: () => sqlWasmModule.default })
  })()
  return sqlJsPromise
}

// gbz-base path names follow the GBWT `sample#haplotype#contig` convention.
// For reference paths the sample is "_gbwt_ref" and we strip it so the
// surfaced name is just the contig — which is what the query CLI accepts
// in `--contig` and what users type into the Region field.
function formatName(sample: string, contig: string, haplotype: number): string {
  if (sample === '_gbwt_ref') return contig
  if (haplotype === 0) return `${sample}#${contig}`
  return `${sample}#${haplotype}#${contig}`
}

export async function readGbzDbPaths(blob: Blob): Promise<PathInfo[]> {
  const SQL = await getSqlJs()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const db: Database = new SQL.Database(bytes)
  try {
    // is_indexed = 1 picks reference paths (those with ReferenceIndex
    // entries). MAX(path_offset) approximates the path length — it is the
    // start offset of the last sampled node, so the true length is up to
    // one node-sequence longer. Good enough for the panel's "click to
    // load" affordance.
    const result = db.exec(`
      SELECT
        p.sample, p.contig, p.haplotype, p.fragment,
        COALESCE(MAX(r.path_offset), 0) AS approx_len
      FROM Paths p
      LEFT JOIN ReferenceIndex r ON p.handle = r.path_handle
      WHERE p.is_indexed = 1
      GROUP BY p.handle
      ORDER BY p.contig, p.haplotype, p.fragment
    `)
    const [firstResult] = result
    if (!firstResult) return []
    return firstResult.values
      .map(row => {
        const sample = (row[0] as string) ?? ''
        const contig = (row[1] as string) ?? ''
        const haplotype = Number(row[2] ?? 0)
        const approxLen = Number(row[4] ?? 0)
        return {
          name: formatName(sample, contig, haplotype),
          // Length is approximate (lower bound) — null would disable the
          // load-this-path button, so surface what we have.
          length: approxLen > 0 ? approxLen : null,
          cyclic: false,
        }
      })
      // Match server-side filtering: skip internal "_…" paths (e.g.
      // a future synthetic sample that bypasses the formatName strip).
      .filter(p => !p.name.startsWith('_'))
  } finally {
    db.close()
  }
}
