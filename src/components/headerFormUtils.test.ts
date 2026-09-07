import '../config-client.js'
import {
  determineRegionIndex,
  makeViewTarget,
  regionStringFromRegionIndex,
} from './headerFormUtils.ts'
import type { Tracks } from '../Types.ts'

// test for determineRegionIndex and regionStringFromRegionIndex
describe('determine regionIndex and corresponding region strings for various region inputs', () => {
  // TEST #1
  it('determine regionIndex and regionString for smaller regionInfo lists', async () => {
    const regionInfo = {
      chr: ['ref', 'ref'],
      start: ['1000', '2000'],
      end: ['2000', '3000'],
      desc: ['17_1_100', 'ref_2000_3000'],
      chunk: ['', ''],
      tracks: [null, null],
    }
    const regionString = 'ref:2000-3000'
    const regionIndex = determineRegionIndex(regionString, regionInfo)
    expect(regionIndex).toBe(1)
    expect(regionStringFromRegionIndex(regionIndex!, regionInfo)).toBe(
      'ref:2000-3000',
    )
  })
  // TEST #2
  it('determine regionIndex and regionString for larger regionInfo lists', async () => {
    const regionInfo = {
      chr: ['17', 'ref', '17', 'ref', '17', 'ref'],
      start: ['100', '200', '2000', '3000', '4000', '5000'],
      end: ['200', '300', '3000', '4000', '5000', '6000'],
      desc: [
        '17_100_200',
        '17_200_300',
        'ref_2000_3000',
        'ref_3000_4000',
        'ref_4000_5000',
        'ref_5000_6000',
      ],
      chunk: ['', '', '', '', '', '', ''],
      tracks: [null, null, null, null, null, null],
    }
    const regionString = '17:4000-5000'
    const regionIndex = determineRegionIndex(regionString, regionInfo)
    expect(regionIndex).toBe(4)
    expect(regionStringFromRegionIndex(regionIndex!, regionInfo)).toBe(
      '17:4000-5000',
    )
  })
  // TEST #3
  it('determine regionIndex to be null for input of region not found in regionInfo', async () => {
    const regionInfo = {
      chr: ['17', 'ref', '17', 'ref', '17', 'ref'],
      start: ['100', '200', '2000', '3000', '4000', '5000'],
      end: ['200', '300', '3000', '4000', '5000', '6000'],
      desc: [
        '17_100_200',
        '17_200_300',
        'ref_2000_3000',
        'ref_3000_4000',
        'ref_4000_5000',
        'ref_5000_6000',
      ],
      chunk: ['', '', '', '', '', '', ''],
      tracks: [null, null, null, null, null, null],
    }
    const regionString = '17:5000-7000'
    const regionIndex = determineRegionIndex(regionString, regionInfo)
    expect(regionIndex).toBe(null)
  })
  // TEST #4
  it('determine regionIndex and regionString to be null given empty regionInfo', async () => {
    const regionInfo = {
      chr: [],
      start: [],
      end: [],
      desc: [],
      chunk: [],
      tracks: [],
    }
    const regionString = '17:5000-7000'
    const regionIndex = determineRegionIndex(regionString, regionInfo)
    expect(regionIndex).toBe(null)
  })
})

// Reproduces the "Missing region" bug: when a discovered dataset has no preset
// region (e.g. a dataset with no manifest.json), clicking "Load" on a path in
// PathsPanel must build the view target with the freshly-supplied region —
// reading region from React state would still see the empty initial value
// because setRegion's update hasn't applied yet.
describe('makeViewTarget — fresh values are honored', () => {
  const graphTracks: Tracks = [
    { trackType: 'graph', trackFile: 'x.vg.xg' },
  ]

  it('emits the explicit region even when prior state had none', () => {
    const vt = makeViewTarget({
      tracks: graphTracks,
      bedFile: undefined,
      name: 'x',
      region: 'x:0-1000',
      dataType: 'built-in',
      simplify: false,
      removeSequences: false,
    })
    expect(vt.region).toBe('x:0-1000')
    expect(vt.tracks).toEqual(graphTracks)
  })

  it('disables simplify when reads are present', () => {
    const tracksWithReads: Tracks = [
      ...graphTracks,
      { trackType: 'read', trackFile: 'reads.gam' },
    ]
    const vt = makeViewTarget({
      tracks: tracksWithReads,
      bedFile: undefined,
      name: 'x',
      region: 'x:0-1000',
      dataType: 'built-in',
      simplify: true,
      removeSequences: false,
    })
    expect(vt.simplify).toBe(false)
  })

  it('keeps simplify on for graph-only track sets', () => {
    const vt = makeViewTarget({
      tracks: graphTracks,
      bedFile: undefined,
      name: 'x',
      region: 'x:0-1000',
      dataType: 'built-in',
      simplify: true,
      removeSequences: false,
    })
    expect(vt.simplify).toBe(true)
  })
})
