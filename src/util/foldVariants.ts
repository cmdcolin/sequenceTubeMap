import type {
  Branch,
  ClusterInfo,
  FoldedNode,
  FoldedWalk,
} from '@jbrowse/graph-fold'

// The View menu's choices in bp, 0 being off
export const FOLD_THRESHOLDS = [0, 50, 1000, 10_000] as const

// A threshold the View menu offers; undefined for anything else, which a
// stored preference or link may hold
export function foldThresholdFrom(value: unknown) {
  const bp = value === 'off' ? 0 : Number(value)
  return value === null || value === undefined || value === ''
    ? undefined
    : FOLD_THRESHOLDS.find(threshold => threshold === bp)
}

// What one folded tube stands for. Its walks all take the tube's route in its
// orientations, and differ by what the fold hid: sequence under the threshold
// a walk has and the tube's nodes lack, or of those nodes that it skips.
export interface FoldedTube {
  haplotypes: number
  walks: number
  minHiddenBp: number
  maxHiddenBp: number
}

// By folded track id. The package is to report this per tube itself, and this
// is the one place that would read it.
export function foldedTubes(walks: FoldedWalk[]) {
  const tubes = new Map<number, FoldedTube>()
  for (const { track, freq, insertedBp, skippedBp } of walks) {
    const hiddenBp = insertedBp + skippedBp
    const tube = tubes.get(track)
    tubes.set(
      track,
      tube === undefined
        ? {
            haplotypes: freq,
            walks: 1,
            minHiddenBp: hiddenBp,
            maxHiddenBp: hiddenBp,
          }
        : {
            haplotypes: tube.haplotypes + freq,
            walks: tube.walks + 1,
            minHiddenBp: Math.min(tube.minHiddenBp, hiddenBp),
            maxHiddenBp: Math.max(tube.maxHiddenBp, hiddenBp),
          },
    )
  }
  return tubes
}

export function tubeText({
  haplotypes,
  walks,
  minHiddenBp,
  maxHiddenBp,
}: FoldedTube) {
  const hidden =
    minHiddenBp === maxHiddenBp
      ? bpText(minHiddenBp)
      : `${bpText(minHiddenBp)} to ${bpText(maxHiddenBp)}`
  return `${haplotypes.toLocaleString()} haplotype${haplotypes === 1 ? '' : 's'} on ${walks.toLocaleString()} distinct walk${walks === 1 ? '' : 's'}, ${hidden} folded away in each`
}

// What a folded drawing needs beside its nodes and tracks: the kept branches
// to label, and what each merged node and tube stands for
export interface FoldView {
  threshold: number
  // Summed over every walk, the reference among them
  haplotypes: number
  unfoldedNodes: number
  nodes: FoldedNode[]
  members: Record<string, string[]>
  branches: Branch[]
  tubes: Map<number, FoldedTube>
}

export function bpText(bp: number) {
  return bp >= 1000
    ? `${(bp / 1000).toFixed(bp >= 100_000 ? 0 : 1)} kb`
    : `${bp.toLocaleString()} bp`
}

export function thresholdText(bp: number) {
  return bp >= 1000 ? `${bp / 1000} kb` : `${bp} bp`
}

export function clusterText({ members, minLength, maxLength }: ClusterInfo) {
  return `cluster of ${members} sizes, ${bpText(minLength)} to ${bpText(maxLength)}`
}

// A clustered branch says so on a line of its own, since its box stands for
// alleles of several lengths
export function branchLabelLines(branch: Branch, haplotypes: number) {
  const size =
    branch.insertedBp > 0 && branch.deletedBp > 0
      ? `${bpText(branch.insertedBp)} for ${bpText(branch.deletedBp)}`
      : bpText(branch.length)
  return [
    `${branch.description} ${size}, ${branch.haplotypes} of ${haplotypes}`,
    ...(branch.cluster ? [clusterText(branch.cluster)] : []),
  ]
}

// A branch with neither a box nor a jump of its own, such as a walk that
// starts inside the window, has nowhere to carry a label
export function isDrawnBranch(branch: Branch) {
  return (
    branch.nodes.length > 0 ||
    (branch.from !== undefined && branch.to !== undefined)
  )
}
