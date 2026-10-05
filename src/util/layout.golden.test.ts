// Golden layouts: every shape and node position layoutTubeMap produces for the
// demo examples and a BRCA1 window, under each option that picks a different
// layout path. tubemap.render.test.ts checks what a render must never do; this
// pins what it does, so a refactor of the layout shows up as a diff here.
// `pnpm vitest run -u src/util/layout.golden.test.ts` rewrites the files after
// an intended change.

import { readFileSync } from 'node:fs'
import {
  curvePaths,
  layoutTubeMap,
  type InputNode,
  type InputTrack,
  type LayoutOptions,
  type TubeMapLayout,
} from '@gmod/tubemap-core'
import '../config-client.js'
import { GBZBaseAPI } from '../api/GBZBaseAPI.ts'
import {
  computeExampleData,
  parseChunkedData,
} from '../components/tubeMapData.ts'
import { dataOriginTypes } from '../enums.ts'
import type { Tracks } from '../Types.ts'
import * as demo from './demo-data.js'

interface Dataset {
  nodes: InputNode[]
  tracks: InputTrack[]
  reads: InputTrack[]
}

const VARIANTS: Record<string, LayoutOptions> = {
  default: {},
  compressed: { nodeWidthOption: 'compressed' },
  fixed: { nodeWidthOption: 'fixed' },
  unmerged: { mergeNodes: false },
  coarsened: { coarsenedReadView: true },
  'coarsened-ignore-strand': { coarsenedReadView: true, ignoreStrand: true },
}

const READ_VARIANTS: Record<string, LayoutOptions> = {
  'no-reads': { showReads: false },
  'banded-haplotypes': {
    layers: [{ data: 'haplotypes', stat: 'coarsen' }, { data: 'reads' }],
  },
  'banded-haplotypes-and-reads': {
    layers: [
      { data: 'haplotypes', stat: 'coarsen' },
      { data: 'reads', stat: 'coarsen' },
    ],
  },
}

function exampleDataset(n: number): Dataset {
  const key = `EXAMPLE_${n}` as keyof typeof dataOriginTypes
  return computeExampleData(dataOriginTypes[key], demo)
}

function upload(api: GBZBaseAPI, type: 'graph' | 'read', path: string) {
  const name = path.split('/').pop()!
  const file = new window.File([readFileSync(path)], name)
  return api.putFile(type, file, null)
}

// A window of NA12878 reads with reverse-strand alignments, which none of the
// demo examples have.
async function brca1Dataset(): Promise<Dataset> {
  const api = new GBZBaseAPI()
  const gam = 'exampleData/internal/NA12878-BRCA1.sorted.gam'
  const graphId = await upload(
    api,
    'graph',
    'exampleData/internal/snp1kg-BRCA1.gbz.db',
  )
  const readId = await upload(api, 'read', gam)
  await upload(api, 'read', `${gam}.gai`)
  const tracks: Tracks = [
    { trackFile: graphId, trackType: 'graph' },
    { trackFile: readId, trackType: 'read' },
  ]
  const data = parseChunkedData(
    await api.getChunkedData(
      { dataType: 'mounted files', tracks, region: '17:1-100' },
      null,
    ),
    tracks,
  )
  return { nodes: data.nodes, tracks: data.tracks, reads: data.reads }
}

function describeLayout(layout: TubeMapLayout | undefined) {
  if (layout === undefined) {
    return { layout: 'none' }
  }
  const nodes: object[] = []
  layout.nodes.forEach(({ name, order, x, y, pixelWidth, contentHeight }) => {
    nodes.push({ name, order, x, y, pixelWidth, contentHeight })
  })
  const { rectangles, curves, corners, verticalRectangles } = layout.shapes
  const withoutName = <T extends { name?: string }>({ name: _, ...rest }: T) =>
    rest
  // One banded layer as itself, so a single-layer golden reads as it did
  // before layers
  const coarsenings = Object.values(layout.coarsened)
  return {
    bounds: layout.bounds,
    maxOrder: layout.maxOrder,
    trackForRuler: layout.trackForRuler ?? null,
    coarsened: coarsenings.length > 1 ? coarsenings : (coarsenings[0] ?? null),
    nodes,
    tracks: layout.tracks.map(t => ({
      id: t.id,
      type: t.type,
      width: t.width,
      reverse: t.is_reverse === true,
    })),
    rectangles: rectangles.map(withoutName),
    curves: [
      ...curvePaths(curves, 'haplotype'),
      ...curvePaths(curves, 'read'),
    ].map(withoutName),
    corners: corners.map(withoutName),
    verticalRectangles: verticalRectangles.map(withoutName),
    bands: [...layout.coarsenedEdgeMeta].map(([id, meta]) => ({ id, ...meta })),
  }
}

// One array element per line, so a diff names the shapes that moved.
function goldenText(value: Record<string, unknown>): string {
  const entries = Object.entries(value).map(([key, v]) =>
    Array.isArray(v) && v.length > 0
      ? `  ${JSON.stringify(key)}: [\n${v.map(item => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]`
      : `  ${JSON.stringify(key)}: ${JSON.stringify(v)}`,
  )
  return `{\n${entries.join(',\n')}\n}\n`
}

// A variant that lays out the same as an earlier one is pinned as a pointer to
// it, so the files stay one per layout path rather than one per option.
function goldens(data: Dataset, variants: Record<string, LayoutOptions>) {
  const seen = new Map<string, string>()
  return new Map(
    Object.entries(variants).map(([variant, options]) => {
      const text = goldenText(
        describeLayout(
          layoutTubeMap(data.nodes, data.tracks, data.reads, options),
        ),
      )
      const earlier = seen.get(text)
      if (earlier === undefined) {
        seen.set(text, variant)
      }
      return [
        variant,
        earlier === undefined
          ? text
          : `{ "sameAs": ${JSON.stringify(earlier)} }\n`,
      ]
    }),
  )
}

function expectGolden(name: string, text: string | undefined) {
  return expect(text).toMatchFileSnapshot(`layout-golden/${name}.json`)
}

describe('layoutTubeMap golden output', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const data = exampleDataset(n)
    const texts = goldens(
      data,
      data.reads.length > 0 ? { ...VARIANTS, ...READ_VARIANTS } : VARIANTS,
    )
    for (const [variant, text] of texts) {
      it(`example ${n}, ${variant}`, async () => {
        await expectGolden(`example-${n}.${variant}`, text)
      })
    }
  }

  describe('snp1kg-BRCA1 17:1-100', () => {
    const variants: Record<string, LayoutOptions> = {
      ...VARIANTS,
      ...READ_VARIANTS,
      // This GAM's mapping qualities run to 1199, so 500 splits its reads
      'mapq-500': { mappingQualityCutoff: 500 },
    }
    let data: Dataset
    let texts: Map<string, string>

    beforeAll(async () => {
      data = await brca1Dataset()
      texts = goldens(data, variants)
    })

    it('has reverse-strand reads for the strand paths to act on', () => {
      const layout = layoutTubeMap(data.nodes, data.tracks, data.reads)
      expect(layout?.reads.some(r => r.is_reverse === true)).toBe(true)
    })

    for (const variant of Object.keys(variants)) {
      it(variant, async () => {
        await expectGolden(`brca1.${variant}`, texts.get(variant))
      })
    }
  })
})
