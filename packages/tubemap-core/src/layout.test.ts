// @vitest-environment node

import { curvePaths, nodeOutlinePath } from './geometry.ts'
import {
  FACET_GAP,
  FACET_LABEL_HEIGHT,
  facetReads,
  getXCoordinateOfBaseWithinNode,
  layoutTopology,
  layoutTubeMap,
  placeFacets,
  placeTubeMap,
} from './layout.ts'

import type { TubeMapLayout } from './layout.ts'
import type { InputNode, InputTrack, TrackCurve } from './types.ts'

// A SNP bubble: the reference walks 1 2 4, the alternate 1 3 4.
const nodes: InputNode[] = [
  { name: '1', seq: 'ACGT' },
  { name: '2', seq: 'A' },
  { name: '3', seq: 'G' },
  { name: '4', seq: 'TTGCA' },
]
const tracks: InputTrack[] = [
  { id: 0, name: 'ref', sequence: ['1', '2', '4'], sourceTrackID: 0 },
  { id: 1, name: 'alt', sequence: ['1', '3', '4'], sourceTrackID: 0 },
]

// The same bubble behind an unbranched run a b 1, which merging makes one node
const run: InputNode[] = [
  { name: 'a', seq: 'AC' },
  { name: 'b', seq: 'GT' },
  ...nodes,
]
const runTracks: InputTrack[] = [
  { id: 0, sequence: ['a', 'b', '1', '2', '4'], sourceTrackID: 0 },
  { id: 1, sequence: ['a', 'b', '1', '3', '4'], sourceTrackID: 0 },
]

function expectFiniteGeometry(layout: TubeMapLayout) {
  const { rectangles, curves, verticalRectangles, corners } = layout.shapes
  for (const shape of [...rectangles, ...curves, ...verticalRectangles]) {
    const { xStart, xEnd, yStart, yEnd } = shape
    expect([xStart, xEnd, yStart, yEnd].every(Number.isFinite)).toBe(true)
  }
  for (const { path } of corners) {
    expect(path).not.toMatch(/NaN|Infinity/)
  }
  expect(Object.values(layout.bounds).every(Number.isFinite)).toBe(true)
  layout.nodes.forEach(node => {
    if (node.order >= 0) {
      expect(nodeOutlinePath(node)).not.toMatch(/NaN|Infinity/)
    }
  })
}

describe('layoutTubeMap', () => {
  it('puts the two alleles in one column and the flanks either side', () => {
    const layout = layoutTubeMap(nodes, tracks, [], { mergeNodes: false })!
    // flatMap skips the hole at index 0, where map would keep it
    const byName = new Map(layout.nodes.flatMap(n => [[n.name, n] as const]))
    const order = (name: string) => byName.get(name)!.order
    expect(order('1')).toBeLessThan(order('2'))
    expect(order('2')).toBe(order('3'))
    expect(order('3')).toBeLessThan(order('4'))
    expect(byName.get('2')!.y).not.toBe(byName.get('3')!.y)
  })

  it('leaves its inputs untouched and repeats itself exactly', () => {
    const before = structuredClone({ nodes, tracks })
    const a = layoutTubeMap(nodes, tracks)
    const b = layoutTubeMap(nodes, tracks)
    expect({ nodes, tracks }).toEqual(before)
    expect(b).toEqual(a)
  })

  it('does not let a later call change an earlier result', () => {
    const first = layoutTubeMap(nodes, tracks)!
    const snapshot = structuredClone(first.shapes)
    layoutTubeMap(nodes, [tracks[1]!])
    expect(first.shapes).toEqual(snapshot)
  })

  it('keys each shape by the id of the track it draws, leaving color out', () => {
    const { rectangles, curves, corners, verticalRectangles } = layoutTubeMap(
      nodes,
      tracks,
    )!.shapes
    expect(new Set(rectangles.map(r => `${r.name}:${r.id}`))).toEqual(
      new Set(['ref:0', 'alt:1']),
    )
    for (const shape of [
      ...rectangles,
      ...curves,
      ...corners,
      ...verticalRectangles,
    ]) {
      expect(shape).not.toHaveProperty('color')
    }
  })

  it('places reads under the haplotypes that carry them', () => {
    const reads: InputTrack[] = [
      {
        id: 0,
        name: 'r1',
        type: 'read',
        sequence: ['1', '3'],
        sourceTrackID: 1,
        firstNodeOffset: 1,
        finalNodeCoverLength: 1,
        sequenceNew: [
          { nodeName: '1', mismatches: [] },
          { nodeName: '3', mismatches: [] },
        ],
      },
    ]
    const layout = layoutTubeMap(nodes, tracks, reads, { mergeNodes: false })!
    expect(layout.reads).toHaveLength(1)
    const start = layout.reads[0]!.path[0]!
    const haplotypesThere = layout.tracks
      .filter(t => t.type === 'haplotype')
      .flatMap(t => t.path.filter(s => s.node === start.node).map(s => s.y!))
    expect(haplotypesThere).toHaveLength(2)
    expect(start.y).toBeGreaterThan(Math.max(...haplotypesThere))
  })

  it('draws tubes as wide as asked', () => {
    const layout = layoutTubeMap(nodes, tracks, [], { trackWidth: 6 })!
    expect(layout.tracks.map(t => t.width)).toEqual([6, 6])
    const heights = layout.shapes.rectangles.map(r => r.yEnd - r.yStart + 1)
    expect(new Set(heights)).toEqual(new Set([6]))
  })

  it('merges an unbranched run into one node and keeps the hole at index 0', () => {
    const layout = layoutTubeMap(run, runTracks)!
    expect(0 in layout.nodes).toBe(false)
    expect(layout.nodes.flatMap(n => [`${n.name}:${n.seq}`])).toEqual([
      'a:ACGTACGT',
      '2:A',
      '3:G',
      '4:TTGCA',
    ])
    expect(layout.tracks.map(t => t.sequence)).toContainEqual(['a', '2', '4'])
  })

  it('lays out a graph fetched without sequences, switching and merging nodes', () => {
    const bare = run.map(({ name, seq }) => ({
      name,
      sequenceLength: seq!.length,
    }))
    const walks: InputTrack[] = [
      runTracks[0]!,
      { id: 1, sequence: ['a', 'b', '1', '-3', '4'], sourceTrackID: 0 },
    ]
    for (const nodeWidthOption of [
      'normal',
      'compressed',
      'small',
      'fixed',
    ] as const) {
      const layout = layoutTubeMap(bare, walks, [], { nodeWidthOption })!
      const byName = new Map(layout.nodes.flatMap(n => [[n.name, n] as const]))
      expect(byName.get('3')!.switched).toBe(true)
      expect(byName.get('a')!.sequenceLength).toBe(8)
      layout.nodes.forEach(node => {
        expect(node.seq).toBe('')
      })
    }
  })

  it('merges nodes under a read that has no sequenceNew', () => {
    const layout = layoutTubeMap(run, runTracks, [
      { id: 0, type: 'read', sequence: ['a', 'b', '1'], sourceTrackID: 1 },
    ])!
    expect(layout.reads.map(r => r.sequence)).toEqual([['a']])
  })

  it('returns no reads when told not to show them', () => {
    const layout = layoutTubeMap(
      nodes,
      tracks,
      [{ id: 0, type: 'read', sequence: ['1', '3'], sourceTrackID: 1 }],
      { showReads: false },
    )!
    expect(layout.reads).toEqual([])
    expect(layout.tracks.map(t => t.type)).toEqual(['haplotype', 'haplotype'])
  })

  it('keeps every read when a track typed read shares no node with the others', () => {
    const layout = layoutTubeMap(
      [...nodes, { name: 'apart', seq: 'TTTT' }],
      [
        tracks[0]!,
        { id: 1, type: 'read', sequence: ['apart'], sourceTrackID: 0 },
      ],
      [
        {
          id: 2,
          name: 'r2',
          type: 'read',
          sequence: ['1', '2'],
          sourceTrackID: 1,
        },
        { id: 3, name: 'r3', type: 'read', sequence: ['4'], sourceTrackID: 1 },
      ],
      { mergeNodes: false },
    )!
    expect(layout.reads.map(r => r.name)).toEqual(['r2', 'r3'])
    expectFiniteGeometry(layout)
  })

  it('names the track and node when a track visits a node it was not given', () => {
    expect(() =>
      layoutTubeMap(nodes, [
        tracks[0]!,
        { id: 1, name: 'alt', sequence: ['1', '-9', '4'], sourceTrackID: 0 },
      ]),
    ).toThrow('Track alt visits unknown node -9')
  })

  it('keeps widths from going negative for short or empty nodes and rare haplotypes', () => {
    const withEmpty = [...nodes, { name: 'empty', seq: '' }]
    const throughEmpty: InputTrack[] = [
      { ...tracks[0]!, sequence: ['1', 'empty', '2', '4'] },
      tracks[1]!,
    ]
    for (const nodeWidthOption of ['small', 'compressed'] as const) {
      const layout = layoutTubeMap(withEmpty, throughEmpty, [], {
        nodeWidthOption,
        mergeNodes: false,
      })!
      layout.nodes.forEach(node => {
        expect(node.pixelWidth).toBeGreaterThanOrEqual(0)
      })
      expectFiniteGeometry(layout)
    }
    const rare = layoutTubeMap(nodes, [
      { ...tracks[0]!, freq: 0 },
      { ...tracks[1]!, freq: 0.2 },
    ])!
    expect(rare.tracks.map(t => t.width)).toEqual([15, 15])
    expectFiniteGeometry(rare)
  })

  it('leaves a node no track reaches unsized when placing reads', () => {
    const layout = layoutTubeMap(
      [...nodes, { name: 'apart', seq: 'TTTT' }],
      tracks,
      [{ id: 2, type: 'read', sequence: ['1', '3'], sourceTrackID: 1 }],
      { mergeNodes: false },
    )!
    // filter, not find: find visits the hole at index 0
    const [apart] = layout.nodes.filter(n => n.name === 'apart')
    expect(apart).toBeDefined()
    expect(apart!.order).toBe(-1)
    expect(apart!.contentHeight).toBeUndefined()
  })

  it('turns a node the reference walks backwards around, reads and all', () => {
    const line: InputNode[] = [
      { name: '1', seq: 'AAAA' },
      { name: '2', seq: 'ACGG' },
      { name: '3', seq: 'TTTT' },
    ]
    const layout = layoutTubeMap(
      line,
      [{ id: 0, sequence: ['1', '-2', '3'], sourceTrackID: 0 }],
      [
        {
          id: 1,
          type: 'read',
          sequence: ['1', '-2', '3'],
          sourceTrackID: 1,
          sequenceNew: [
            { nodeName: '1', mismatches: [] },
            {
              nodeName: '-2',
              mismatches: [{ type: 'substitution', pos: 1, seq: 'A' }],
            },
            { nodeName: '3', mismatches: [] },
          ],
        },
      ],
      { mergeNodes: false },
    )!
    const [two] = layout.nodes.filter(n => n.name === '2')
    expect(two!.seq).toBe('CCGT')
    const [read] = layout.reads
    expect(read!.sequence).toEqual(['1', '2', '3'])
    expect(read!.path.every(s => s.isForward)).toBe(true)
    expect(layout.shapes.corners).toEqual([])
    expect(two!.seq[read!.sequenceNew![1]!.mismatches[0]!.pos]).toBe('C')
  })

  describe('merging nodes under a read that crosses an inversion', () => {
    // A merges B; the reads walk the merged run backwards
    const line: InputNode[] = [
      { name: 'X', seq: 'CC' },
      { name: 'A', seq: 'AC' },
      { name: 'B', seq: 'GT' },
    ]
    const ref: InputTrack = {
      id: 0,
      sequence: ['X', 'A', 'B'],
      sourceTrackID: 0,
    }
    const layoutRead = (read: Partial<InputTrack>) =>
      layoutTubeMap(
        line,
        [ref],
        [{ id: 1, type: 'read', sourceTrackID: 1, sequence: [], ...read }],
      )!.reads[0]!

    it('folds a reverse visit into the visit after it', () => {
      const read = layoutRead({
        sequence: ['-B', '-A', 'X'],
        firstNodeOffset: 1,
        finalNodeCoverLength: 1,
        sequenceNew: [
          {
            nodeName: '-B',
            mismatches: [{ type: 'substitution', pos: 0, seq: 'G' }],
          },
          {
            nodeName: '-A',
            mismatches: [{ type: 'substitution', pos: 1, seq: 'G' }],
          },
          { nodeName: 'X', mismatches: [] },
        ],
      })
      expect(read.sequence).toEqual(['-A', 'X'])
      expect(read.firstNodeOffset).toBe(1)
      expect(read.sequenceNew![0]!.mismatches.map(m => m.pos)).toEqual([0, 3])
    })

    it('counts a reverse visit from the merged node’s right end', () => {
      const read = layoutRead({
        sequence: ['X', '-B', '-A'],
        firstNodeOffset: 1,
        finalNodeCoverLength: 2,
        sequenceNew: [
          { nodeName: 'X', mismatches: [] },
          {
            nodeName: '-B',
            mismatches: [{ type: 'substitution', pos: 1, seq: 'G' }],
          },
          { nodeName: '-A', mismatches: [] },
        ],
      })
      expect(read.sequence).toEqual(['X', '-A'])
      expect(read.sequenceNew!.map(e => e.mismatches.map(m => m.pos))).toEqual([
        [],
        [1],
      ])
      expect(read.finalNodeCoverLength).toBe(4)
    })
  })

  it('returns undefined when every track is hidden', () => {
    const hidden = tracks.map(t => ({ ...t, hidden: true }))
    expect(layoutTubeMap(nodes, hidden)).toBeUndefined()
  })

  it('gives every curve and node a path', () => {
    const layout = layoutTubeMap(nodes, tracks, [], { mergeNodes: false })!
    const curves = curvePaths(layout.shapes.curves, 'haplotype')
    expect(curves.length).toBeGreaterThan(0)
    for (const curve of curves) {
      expect(curve.path).toMatch(/^M [\d.-]+ [\d.-]+ C /)
    }
    // forEach, not for...of: it skips the hole at index 0
    layout.nodes.forEach(node => {
      expect(nodeOutlinePath(node)).not.toContain('NaN')
    })
  })

  it('puts each base under its letter, and a read ending on a 1 bp node inside it', () => {
    const charWidth = 8.401
    const long: InputNode = { name: '5', seq: 'ACGT'.repeat(25) }
    const layout = layoutTubeMap(
      [...nodes, long],
      [{ ...tracks[0]!, sequence: ['1', '2', '4', '5'] }, tracks[1]!],
      [
        {
          id: 2,
          type: 'read',
          sequence: ['1', '2'],
          sourceTrackID: 1,
          firstNodeOffset: 0,
          finalNodeCoverLength: 1,
        },
      ],
      { mergeNodes: false, charWidth },
    )!
    layout.nodes.forEach(node => {
      // the label draws letter i from node.x - 4 + i * charWidth
      for (let base = 0; base <= node.sequenceLength; base += 1) {
        const x = getXCoordinateOfBaseWithinNode(node, base)!
        expect(Math.abs(x - (node.x - 4 + base * charWidth))).toBeLessThan(1)
      }
    })
    const [one, snp] = layout.nodes.filter(
      n => n.name === '1' || n.name === '2',
    )
    const read = layout.shapes.rectangles.filter(r => r.type === 'read')
    expect(Math.min(...read.map(r => r.xStart))).toBeGreaterThan(one!.x - 9)
    expect(Math.max(...read.map(r => r.xEnd))).toBeLessThan(snp!.x + 9)
  })

  it('fans out only the curves that share both ends', () => {
    // six tracks leaving a gap for another gap, each in its own order slot
    const gapToGap = (order: number): TrackCurve => ({
      xStart: order * 100,
      yStart: 0,
      xEnd: order * 100 + 40,
      yEnd: 20,
      width: 4,
      id: order,
      type: 'haplotype',
      nodeStart: null,
      nodeEnd: null,
      orderStart: order,
      orderEnd: order + 1,
    })
    const curves = curvePaths([5, 4, 3, 2, 1, 0].map(gapToGap), 'haplotype')
    expect(curves.map(c => c.orderStart)).toEqual([0, 1, 2, 3, 4, 5])
    for (const { xStart, path } of curves) {
      expect(path).toContain(`C ${xStart + 20} 0 ${xStart + 20} 20`)
    }
  })

  describe('coarsened haplotype bands', () => {
    const bandLabels = (
      alts: InputTrack[],
      options: { ignoreStrand?: boolean } = {},
    ) => {
      const layout = layoutTubeMap(nodes, [tracks[0]!, ...alts], [], {
        mergeNodes: false,
        coarsenedReadView: true,
        ...options,
      })!
      return {
        labels: [...layout.coarsenedEdgeMeta.values()]
          .map(meta => meta.label)
          .sort(),
        coarsened: layout.coarsened.haplotypes,
      }
    }

    it('counts a haplotype once on an edge it loops back over, and sizes the band by its crossings', () => {
      const looping: InputTrack = {
        id: 1,
        name: 'loop',
        sequence: ['1', '2', '4', '2', '4', '2', '4'],
        sourceTrackID: 0,
      }
      const { labels, coarsened } = bandLabels([looping])
      expect(labels).toContain(
        '1 haplotype (100%), 3 crossings: Node 2 → Node 4',
      )
      expect(coarsened).toEqual({ unit: 'haplotype', total: 1, reverse: false })
    })

    it('counts a haplotype once on an edge it crosses both ways under ignoreStrand', () => {
      const turnaround: InputTrack = {
        id: 1,
        name: 'turn',
        sequence: ['1', '2', '-2', '-1'],
        sourceTrackID: 0,
      }
      const other: InputTrack = {
        id: 2,
        name: 'other',
        sequence: ['1', '3', '4'],
        sourceTrackID: 0,
      }
      const { labels } = bandLabels([turnaround, other], {
        ignoreStrand: true,
      })
      expect(labels.filter(l => l.endsWith('Node 1 → Node 2'))).toEqual([
        '1 haplotype (50%), 2 crossings: Node 1 → Node 2',
      ])
    })

    it('turns a haplotype stored back to front around to join its allele', () => {
      const { labels, coarsened } = bandLabels([
        { id: 1, sequence: ['-4', '-3', '-1'], sourceTrackID: 0 },
        { id: 2, sequence: ['1', '3', '4'], sourceTrackID: 0 },
      ])
      expect(labels).toEqual([
        '2 haplotypes (100%): Node 1 → Node 3',
        '2 haplotypes (100%): Node 3 → Node 4',
      ])
      expect(coarsened?.reverse).toBe(false)
    })

    it('keeps a band reverse where a haplotype runs through an inversion', () => {
      const line: InputNode[] = ['1', '2', '3', '4'].map(name => ({
        name,
        seq: 'ACGT',
      }))
      const layout = layoutTubeMap(
        line,
        [
          {
            id: 0,
            name: 'ref',
            sequence: ['1', '2', '3', '4'],
            sourceTrackID: 0,
          },
          { id: 1, sequence: ['1', '-3', '-2', '4'], sourceTrackID: 0 },
        ],
        [],
        { mergeNodes: false, coarsenedReadView: true },
      )!
      expect(
        [...layout.coarsenedEdgeMeta.values()].map(m => m.label),
      ).toContain('1 haplotype (100%): Node -3 → Node -2')
      expect(layout.coarsened.haplotypes?.reverse).toBe(true)
    })

    it('never rounds a share to 0% or 100% that is neither', () => {
      const { labels } = bandLabels([
        { id: 1, sequence: ['1', '2', '4'], sourceTrackID: 0, freq: 199 },
        { id: 2, sequence: ['1', '3', '4'], sourceTrackID: 0 },
      ])
      expect(labels).toEqual([
        '1 haplotype (<1%): Node 1 → Node 3',
        '1 haplotype (<1%): Node 3 → Node 4',
        '199 haplotypes (>99%): Node 1 → Node 2',
        '199 haplotypes (>99%): Node 2 → Node 4',
      ])
    })
  })

  describe('topology and placement', () => {
    // r1 leaves b for 2, an edge no haplotype takes, so 1 stays its own node
    const reads: InputTrack[] = [
      {
        id: 2,
        name: 'r1',
        type: 'read',
        sequence: ['b', '2'],
        sourceTrackID: 1,
        mapping_quality: 10,
      },
      {
        id: 3,
        name: 'r2',
        type: 'read',
        sequence: ['1', '3', '4', 'tail'],
        sourceTrackID: 1,
        mapping_quality: 60,
      },
    ]
    const withTail = [...run, { name: 'tail', seq: 'GGGG' }]
    const placed = (layout: TubeMapLayout) =>
      layout.nodes.flatMap(({ name, order, x }) => [{ name, order, x }])

    it('keeps node order and x across placements of one topology', () => {
      const topology = layoutTopology(withTail, runTracks, reads)!
      const snapshot = structuredClone(topology)
      const all = placeTubeMap(topology)
      const confident = placeTubeMap(topology, { mappingQualityCutoff: 30 })
      const focused = placeTubeMap(topology, { focusReadNames: ['r1'] })
      expect(confident.reads.map(r => r.name)).toEqual(['r2'])
      expect(focused.reads.map(r => r.name)).toEqual(['r1'])
      expect(placed(confident)).toEqual(placed(all))
      expect(placed(focused)).toEqual(placed(all))
      expect(topology).toEqual(snapshot)
    })

    it('lays out as placing the composed phases would', () => {
      for (const cutoff of [0, 30]) {
        const options = { mergeNodes: true, mappingQualityCutoff: cutoff }
        expect(layoutTubeMap(withTail, runTracks, reads, options)).toEqual(
          placeTubeMap(
            layoutTopology(withTail, runTracks, reads, options)!,
            options,
          ),
        )
      }
    })

    it('leaves nodes merged and ordered as the unfiltered reads have them', () => {
      const names = (layout: TubeMapLayout) => placed(layout).map(n => n.name)
      const filtered = layoutTubeMap(withTail, runTracks, reads, {
        mappingQualityCutoff: 30,
      })!
      expect(names(filtered)).toEqual(
        names(layoutTubeMap(withTail, runTracks, reads)!),
      )
      expect(names(filtered)).toContain('1')
    })

    it('still places a node only a filtered-out read visits', () => {
      const layout = layoutTubeMap(withTail, runTracks, reads, {
        focusReadNames: ['r1'],
      })!
      const [tail] = layout.nodes.filter(n => n.name === 'tail')
      expect(tail!.order).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(tail!.y)).toBe(true)
      expectFiniteGeometry(layout)
    })
  })

  describe('facets', () => {
    // Two read groups on opposite alleles, one read in no group
    const reads: InputTrack[] = [
      { id: 10, name: 'a1', sequence: ['1', '2', '4'], read_group: 'A' },
      { id: 11, name: 'a2', sequence: ['1', '2'], read_group: 'A' },
      { id: 12, name: 'b1', sequence: ['1', '3', '4'], read_group: 'B' },
      { id: 13, name: 'b2', sequence: ['-4', '-3'], read_group: 'B' },
      { id: 14, name: 'n1', sequence: ['3', '4'] },
    ].map((read, i) => ({
      ...read,
      type: 'read' as const,
      sourceTrackID: 1,
      sample_name: i < 2 ? 'S1' : 'S2',
      mapping_quality: read.name === 'b2' ? 5 : 60,
      finalNodeCoverLength: 1,
    }))
    const topology = layoutTopology(nodes, tracks, reads, {
      mergeNodes: false,
    })!
    const placed = (layout: TubeMapLayout) =>
      layout.nodes.flatMap(({ name, order, x }) => [{ name, order, x }])
    const names = (layout: TubeMapLayout) =>
      layout.reads.map(r => r.name).sort()

    it('splits the filtered reads into one subset per value, the unset last', () => {
      const subsets = facetReads(topology, 'read_group', {
        mappingQualityCutoff: 10,
      })
      expect(subsets.map(s => s.facet.key)).toEqual(['A', 'B', null])
      expect(subsets.map(s => s.reads.map(r => r.name))).toEqual([
        ['a1', 'a2'],
        ['b1'],
        ['n1'],
      ])
      expect(
        facetReads(topology, 'sample_name', {
          focusReadNames: ['a1', 'n1'],
        }).map(s => [s.facet.key, s.reads.map(r => r.name)]),
      ).toEqual([
        ['S1', ['a1']],
        ['S2', ['n1']],
      ])
    })

    it('stacks panels that partition the reads and share node order and x', () => {
      const options = { mappingQualityCutoff: 10 }
      const { panels, bounds } = placeFacets(topology, {
        ...options,
        facetReadsBy: 'read_group',
      })
      const all = placeTubeMap(topology, options)
      expect(panels.flatMap(p => names(p.layout)).sort()).toEqual(names(all))
      for (const panel of panels) {
        expect(placed(panel.layout)).toEqual(placed(all))
        expect(panel.layout.reads.map(r => r.id)).toEqual(
          placeTubeMap(topology, { ...options, facet: panel.facet }).reads.map(
            r => r.id,
          ),
        )
        expect(
          panel.layout.tracks
            .filter(t => t.type === 'haplotype')
            .map(t => t.id)
            .sort(),
        ).toEqual([0, 1])
        expectFiniteGeometry(panel.layout)
      }
      expect(panels.map(p => p.readCount)).toEqual([2, 1, 1])
      expect(panels[0]!.offsetY).toBe(0)
      for (const [above, below] of [
        [panels[0]!, panels[1]!],
        [panels[1]!, panels[2]!],
      ] as const) {
        expect(
          below.offsetY + below.layout.bounds.minY - FACET_LABEL_HEIGHT,
        ).toBe(above.offsetY + above.layout.bounds.maxY + FACET_GAP)
      }
      const last = panels[2]!
      expect(bounds.minY).toBe(
        panels[0]!.layout.bounds.minY - FACET_LABEL_HEIGHT,
      )
      expect(bounds.maxY).toBe(last.offsetY + last.layout.bounds.maxY)
    })

    it('is one panel of placeTubeMap unfaceted, or with no reads to split', () => {
      for (const options of [
        {},
        { facetReadsBy: null },
        { facetReadsBy: 'read_group' as const, focusReadNames: ['none'] },
      ]) {
        const { panels, bounds } = placeFacets(topology, options)
        expect(panels).toHaveLength(1)
        expect(panels[0]!.facet).toBeUndefined()
        expect(panels[0]!.offsetY).toBe(0)
        expect(bounds).toEqual(panels[0]!.layout.bounds)
      }
      expect(placeFacets(topology).panels[0]!.layout).toBe(
        placeTubeMap(topology),
      )
    })

    it('keeps read band ids unique across panels, and haplotype bands shared', () => {
      const banded = layoutTopology(nodes, tracks, reads, {
        mergeNodes: false,
        layers: [
          { data: 'haplotypes', stat: 'coarsen' },
          { data: 'reads', stat: 'coarsen' },
        ],
      })!
      const { panels } = placeFacets(banded, { facetReadsBy: 'sample_name' })
      expect(panels).toHaveLength(2)
      const ofKind = (haplotype: boolean) =>
        panels.map(p =>
          p.layout.reads
            .filter(r => (r.haplotypeShare !== undefined) === haplotype)
            .map(r => r.id),
        )
      const readBands = ofKind(false).flat()
      expect(readBands.length).toBeGreaterThan(2)
      expect(new Set(readBands).size).toBe(readBands.length)
      const [first, second] = ofKind(true)
      expect(first!.length).toBeGreaterThan(0)
      expect(second).toEqual(first)
    })
  })

  it('coarsens haplotypes by edge when there are no reads, keeping track 0 as the reference', () => {
    const fourWay: InputTrack[] = [
      { id: 0, name: 'ref', sequence: ['1', '2', '4'], sourceTrackID: 0 },
      // No `name`: with no track carrying a ruler coordinate,
      // trackForRuler is undefined too, so a naive
      // `findIndex(t => t.name === trackForRuler)` would match this track
      // by coincidence instead of falling back to track 0.
      { id: 1, sequence: ['1', '2', '4'], sourceTrackID: 0 },
      { id: 2, name: 'alt2', sequence: ['1', '2', '4'], sourceTrackID: 0 },
      { id: 3, name: 'alt3', sequence: ['1', '3', '4'], sourceTrackID: 0 },
    ]
    const layout = layoutTubeMap(nodes, fourWay, [], {
      mergeNodes: false,
      coarsenedReadView: true,
    })!
    const haplotypes = layout.tracks.filter(t => t.type === 'haplotype')
    expect(haplotypes.map(t => t.id)).toEqual([0])
    expect(layout.coarsenedEdgeMeta.size).toBeGreaterThan(0)
    layout.nodes.forEach(node => {
      expect(nodeOutlinePath(node)).not.toContain('NaN')
    })
  })

  describe('layers', () => {
    // Three haplotypes over the bubble and reads on both alleles
    const threeWay: InputTrack[] = [
      ...tracks,
      { id: 2, name: 'alt2', sequence: ['1', '3', '4'], sourceTrackID: 0 },
    ]
    const reads: InputTrack[] = [
      { id: 10, name: 'r1', sequence: ['1', '2', '4'] },
      { id: 11, name: 'r2', sequence: ['1', '3'] },
      { id: 12, name: 'r3', sequence: ['-4', '-3'] },
      { id: 13, name: 'r4', sequence: ['2', '4'] },
    ].map(read => ({
      ...read,
      type: 'read' as const,
      sourceTrackID: 1,
      finalNodeCoverLength: 1,
    }))
    const layered = (readStat?: 'coarsen') =>
      layoutTubeMap(nodes, threeWay, reads, {
        mergeNodes: false,
        layers: [
          { data: 'haplotypes', stat: 'coarsen' },
          { data: 'reads', ...(readStat ? { stat: readStat } : {}) },
        ],
      })!
    const bands = (layout: TubeMapLayout) =>
      layout.reads.filter(r => r.haplotypeShare !== undefined)

    it('bands the haplotypes with the reads on screen', () => {
      const layout = layered()
      expect(layout.coarsened.haplotypes).toEqual({
        unit: 'haplotype',
        total: 2,
        reverse: false,
      })
      expect(layout.coarsened.reads).toBeUndefined()
      expect(
        layout.tracks.filter(t => t.type === 'haplotype').map(t => t.id),
      ).toEqual([0])
      expect(bands(layout).length).toBeGreaterThan(0)
      expect(
        layout.reads
          .filter(r => r.haplotypeShare === undefined)
          .map(r => r.name)
          .sort(),
      ).toEqual(['r1', 'r2', 'r3', 'r4'])
    })

    it('keeps band ids and labels apart when both layers band', () => {
      const layout = layered('coarsen')
      expect(layout.coarsened.haplotypes?.total).toBe(2)
      expect(layout.coarsened.reads).toEqual({
        unit: 'read',
        total: 4,
        reverse: false,
      })
      const ids = layout.reads.map(r => r.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect([...layout.coarsenedEdgeMeta.keys()].sort()).toEqual(
        [...ids].sort(),
      )
      const labelOf = (id: number) => layout.coarsenedEdgeMeta.get(id)!.label
      for (const band of layout.reads) {
        expect(labelOf(band.id)).toMatch(
          band.haplotypeShare === undefined ? / reads?: / : / haplotypes? \(/,
        )
      }
    })

    it('stacks the reads under the banded haplotypes without overlapping a node', () => {
      for (const layout of [layered(), layered('coarsen')]) {
        const placedNodes = layout.nodes.filter(n => n.order >= 0)
        for (const a of placedNodes) {
          for (const b of placedNodes) {
            if (a !== b && a.order === b.order) {
              const [top, bottom] = a.y < b.y ? [a, b] : [b, a]
              expect(top.y + top.contentHeight).toBeLessThanOrEqual(bottom.y)
            }
          }
        }
        // in each node, every band sits above every read
        placedNodes.forEach(node => {
          const index = layout.nodes.indexOf(node)
          const inNode = layout.reads.flatMap(read =>
            read.path
              .filter(segment => segment.node === index)
              .map(segment => ({ read, y: segment.y! })),
          )
          for (const { read, y } of inNode) {
            expect(y).toBeGreaterThanOrEqual(node.y)
            expect(y + read.width).toBeLessThanOrEqual(
              node.y + node.contentHeight,
            )
          }
          const bandsEnd = Math.max(
            ...inNode
              .filter(s => s.read.haplotypeShare)
              .map(s => s.y + s.read.width),
          )
          const readsStart = Math.min(
            ...inNode.filter(s => !s.read.haplotypeShare).map(s => s.y),
          )
          expect(bandsEnd).toBeLessThanOrEqual(readsStart)
        })
        expectFiniteGeometry(layout)
      }
    })

    it('reads coarsenedReadView as the layers it stands for', () => {
      const shorthand = layoutTubeMap(nodes, threeWay, reads, {
        mergeNodes: false,
        coarsenedReadView: true,
      })!
      expect(shorthand).toEqual(
        layoutTubeMap(nodes, threeWay, reads, {
          mergeNodes: false,
          layers: [{ data: 'haplotypes' }, { data: 'reads', stat: 'coarsen' }],
        }),
      )
      expect(shorthand.coarsened.haplotypes).toBeUndefined()
    })
  })
})
