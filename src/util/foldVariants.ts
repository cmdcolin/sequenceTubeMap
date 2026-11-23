import type { Branch, FoldedNode, FoldedTrackFields } from '@jbrowse/graph-fold'

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

// What a folded drawing needs beside its nodes and tracks: the kept branches
// to label, and what each merged node and tube stands for
export interface FoldView {
  threshold: number
  haplotypes: number
  unfoldedNodes: number
  nodes: FoldedNode[]
  tracks: FoldedTrackFields[]
  members: Record<string, string[]>
  branches: Branch[]
}

const NAMES_SHOWN = 5

// The walks a tube stands for, by name, the first few of many
export function memberNames({ names }: Pick<FoldedTrackFields, 'names'>) {
  return names.length > NAMES_SHOWN
    ? `${names.slice(0, NAMES_SHOWN).join(', ')} and ${(names.length - NAMES_SHOWN).toLocaleString()} more`
    : names.join(', ')
}
