// Tracks uploaded files inside the LocalAPI worker, indexed by both numeric
// id and original filename so we can find a `.gam` upload's sibling `.gam.gai`
// after the fact.
//
// Kept separate from GBZBaseAPI so the pairing logic is exercisable in tests
// without spinning up the WASM backend.

// Suffixes of files that ride alongside another file as its index. They are
// stored by the registry but never registered as their own track.
const SIBLING_INDEX_SUFFIXES = ['.gai', '.tbi', '.csi']

export function isSiblingIndex(name: string): boolean {
  const lower = name.toLowerCase()
  return SIBLING_INDEX_SUFFIXES.some(s => lower.endsWith(s))
}

export interface AddResult {
  // The id assigned to this upload — `String(index)` matching the existing
  // GBZBaseAPI scheme so external consumers see no behavior change.
  id: string
  // True when the file is a sibling index file and should not be surfaced as
  // its own track.
  isSibling: boolean
}

export class UploadRegistry {
  private files: Blob[] = []
  // Parallel to `files`: original filename for each upload (or null when
  // unknown, e.g. anonymous Blob).
  private fileNames: (string | null)[] = []
  // Original-name -> id, so sibling resolution is a single lookup.
  private filesByName = new Map<string, string>()

  add(file: { name: string; blob: Blob }): AddResult {
    const id = this.files.length.toString()
    this.files.push(file.blob)
    this.fileNames.push(file.name || null)
    if (file.name) {
      this.filesByName.set(file.name, id)
    }
    return { id, isSibling: isSiblingIndex(file.name) }
  }

  get(id: string): Blob | null {
    const idx = parseInt(id, 10)
    if (Number.isNaN(idx)) {
      return null
    }
    return this.files[idx] ?? null
  }

  // Look up an upload's sibling at `originalName + suffix`. Returns null when
  // either the original upload has no recorded name or no sibling was added.
  sibling(id: string, suffix: string): Blob | null {
    const idx = parseInt(id, 10)
    if (Number.isNaN(idx)) {
      return null
    }
    const origName = this.fileNames[idx]
    if (!origName) {
      return null
    }
    const siblingId = this.filesByName.get(origName + suffix)
    if (siblingId === undefined) {
      return null
    }
    return this.get(siblingId)
  }
}
