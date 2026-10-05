// Golden layouts: every shape and node position layoutTubeMap produces for the
// demo examples and a BRCA1 window, under each option that picks a different
// layout path. tubemap.render.test.ts checks what a render must never do; this
// pins what it does, so a refactor of the layout shows up as a diff here.
// `pnpm vitest run -u src/util/layout.golden.test.ts` rewrites the files after
// an intended change.

import { readFileSync } from 'node:fs'
import {
  curvePaths,
  layoutTopology,
  layoutTubeMap,
  placeFacets,
  type FacetOptions,
  type InputNode,
  type InputTrack,
  type LayoutOptions,
  type TubeMapLayout,
} from '@jbrowse/tubemap-core'
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

// A stack is pinned as one file for the panels' facets, counts and offsets,
// and one per panel in `pinned` (every panel unless given) for its layout.
async function expectFacetGoldens(
  name: string,
  data: Dataset,
  options: LayoutOptions & FacetOptions,
  pinned?: readonly number[],
) {
  const topology = layoutTopology(data.nodes, data.tracks, data.reads, options)!
  const { panels, bounds } = placeFacets(topology, options)
  await expectGolden(
    name,
    goldenText({
      bounds,
      panels: panels.map(({ facet, readCount, haplotypeCount, offsetY }) => ({
        facet,
        readCount,
        ...(facet?.by === 'haplotype_sample' && { haplotypeCount }),
        offsetY,
      })),
    }),
  )
  for (const [i, { layout }] of panels.entries()) {
    if (pinned === undefined || pinned.includes(i)) {
      await expectGolden(
        `${name}.panel-${i}`,
        goldenText(describeLayout(layout)),
      )
    }
  }
}

// A bundled HPRC graph through its companion index, every haplotype under its
// own name, and optionally reads
async function hprcDataset(
  graph: string,
  region: string,
  gam?: string,
): Promise<Dataset> {
  const api = new GBZBaseAPI()
  const graphId = await upload(api, 'graph', `exampleData/${graph}.gbz.db`)
  const indexId = await upload(
    api,
    'graph',
    `exampleData/${graph}.haplotype-index.db`,
  )
  const tracks: Tracks = [
    { trackFile: graphId, trackType: 'graph', haplotypeIndexFile: indexId },
  ]
  if (gam !== undefined) {
    const readId = await upload(api, 'read', gam)
    await upload(api, 'read', `${gam}.gai`)
    tracks.push({ trackFile: readId, trackType: 'read' })
  }
  const data = parseChunkedData(
    await api.getChunkedData(
      { dataType: 'mounted files', tracks, region, allHaplotypes: true },
      null,
    ),
    tracks,
  )
  return { nodes: data.nodes, tracks: data.tracks, reads: data.reads }
}

describe('placeFacets golden output', () => {
  // Example 6's five reads under made-up read groups and samples, since no
  // bundled dataset small enough to pin carries more than one of either
  const data = exampleDataset(6)
  const reads = data.reads.map((read, i) => ({
    ...read,
    read_group: [`RG1`, `RG2`, `RG1`, `RG2`, null][i] ?? null,
    sample_name: i < 3 ? 'S1' : 'S2',
  }))
  const variants: Record<string, LayoutOptions & FacetOptions> = {
    'facet-read-group': { facetBy: 'read_group' },
    'facet-sample': { facetBy: 'sample_name' },
    'facet-read-group-coarsened': {
      facetBy: 'read_group',
      coarsenedReadView: true,
    },
    // No demo haplotype has a PanSN name, so they share one panel and the
    // reads take another
    'facet-haplotype-sample': { facetBy: 'haplotype_sample' },
  }
  for (const [variant, options] of Object.entries(variants)) {
    it(`example 6, ${variant}`, async () => {
      await expectFacetGoldens(
        `example-6.${variant}`,
        { ...data, reads },
        options,
      )
    })
  }

  // 42 samples with one haplotype each, and reads simulated from three of
  // them in a last panel. The first two sample panels and the reads panel are
  // pinned whole.
  describe('hprc-chrM GRCh38#chrM:245-255', () => {
    let chrM: Dataset
    beforeAll(async () => {
      chrM = await hprcDataset(
        'hprc-chrM',
        'GRCh38#chrM:245-255',
        'exampleData/hprc-chrM-3samples.sorted.gam',
      )
    })

    it('carries a PanSN name on every haplotype and a sample on every read', () => {
      expect(chrM.tracks.length).toBeGreaterThan(30)
      expect(
        chrM.tracks.every(t => /^[A-Za-z]+[0-9]+#\d+#/.test(t.name ?? '')),
      ).toBe(true)
      expect(new Set(chrM.reads.map(r => r.sample_name))).toEqual(
        new Set(['HG00438', 'HG00735', 'HG02886']),
      )
    })

    it('facet-haplotype-sample', async () => {
      const options: FacetOptions = { facetBy: 'haplotype_sample' }
      const topology = layoutTopology(chrM.nodes, chrM.tracks, chrM.reads)!
      const last = placeFacets(topology, options).panels.length - 1
      await expectFacetGoldens(
        'hprc-chrM.facet-haplotype-sample',
        chrM,
        options,
        [0, 1, last],
      )
    })
  })

  // Diploid samples, banded: a band's share of its panel's two haplotypes
  // reads as zygosity. CHM13's panel comes first; HG00438 (heterozygous at
  // the first bubble only) and HG00673 (heterozygous at most) are pinned.
  describe('micb-kir3dl1 GRCh38#chr6:31500700-31500949', () => {
    it('facet-haplotype-sample-banded', async () => {
      const micb = await hprcDataset(
        'micb-kir3dl1',
        'GRCh38#chr6:31500700-31500949',
      )
      expect(new Set(micb.tracks.map(t => t.name)).size).toBe(
        micb.tracks.length,
      )
      await expectFacetGoldens(
        'micb-kir3dl1.facet-haplotype-sample-banded',
        micb,
        {
          facetBy: 'haplotype_sample',
          nodeWidthOption: 'compressed',
          layers: [{ data: 'haplotypes', stat: 'coarsen' }, { data: 'reads' }],
        },
        [1, 3],
      )
    })
  })
})
