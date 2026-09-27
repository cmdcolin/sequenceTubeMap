// @vitest-environment node

import { curvePaths, nodeOutlinePath } from './geometry.ts'
import { layoutTubeMap } from './layout.ts'

import type { InputNode, InputTrack } from './types.ts'

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
})
