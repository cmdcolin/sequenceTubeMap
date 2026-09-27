// @vitest-environment node

import { curvePaths, nodeOutlinePath } from './geometry.ts'
import { getXCoordinateOfBaseWithinNode, layoutTubeMap } from './layout.ts'

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

  it('draws each track in the colour the caller gives it', () => {
    const layout = layoutTubeMap(nodes, tracks, [], {
      trackColor: track => (track.id === 0 ? 'red' : 'blue'),
    })!
    const colors = new Set(
      layout.shapes.rectangles.map(r => `${r.name}:${r.color}`),
    )
    expect(colors).toEqual(new Set(['ref:red', 'alt:blue']))
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
      color: 'black',
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
        coarsened: layout.coarsened,
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
      expect(layout.coarsened?.reverse).toBe(true)
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
})
