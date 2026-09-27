// Tracks uploaded files inside the LocalAPI worker by numeric id, keeping each
// one's original filename so a `.gam` upload's sibling `.gam.gai` can be found
// after the fact.
//
// Kept separate from GBZBaseAPI so the pairing logic is exercisable in tests
// without opening a database.

// Suffixes of files that ride alongside another file as its index. They are
// stored by the registry but never registered as their own track.
export const SIBLING_INDEX_SUFFIXES = ['.gai', '.tbi', '.csi']

export function isSiblingIndex(name: string): boolean {
  const lower = name.toLowerCase()
  return SIBLING_INDEX_SUFFIXES.some(s => lower.endsWith(s))
}

// A trackFile string is an upload id when it's purely numeric (the registry
// assigns ids via `files.length.toString()`). Anything else is treated as a
// URL/path that goes through the URL fetch path in GBZBaseAPI.
export function isUploadId(trackFile: string): boolean {
  return /^\d+$/.test(trackFile)
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

  add(file: { name: string; blob: Blob }): AddResult {
    const id = this.files.length.toString()
    this.files.push(file.blob)
    this.fileNames.push(file.name || null)
    return { id, isSibling: isSiblingIndex(file.name) }
  }

  get(id: string): Blob | null {
    const idx = parseInt(id, 10)
    if (Number.isNaN(idx)) {
      return null
    }
    return this.files[idx] ?? null
  }

  // Original filename for an upload id, or null if the id is unknown / had no
  // name. Callers use this for UI labels and for extension-based dispatch
  // (e.g. is this .gbz.db?) since `id` is a registry index, not a path.
  getName(id: string): string | null {
    const idx = parseInt(id, 10)
    if (Number.isNaN(idx)) {
      return null
    }
    return this.fileNames[idx] ?? null
  }

  // Look up an upload's sibling at `originalName + suffix`. A file dropped
  // again repeats its name, and the latest index by name paired a regenerated
  // `x.sorted.gam` dropped alone with the old `x.sorted.gam.gai`. A file and
  // its index are dropped together, so an index goes with an upload of its
  // file only when no other upload of either name lies between them, and
  // each upload takes the first such index after it before one before it.
  sibling(id: string, suffix: string): Blob | null {
    const idx = parseInt(id, 10)
    const name = this.fileNames[idx]
    if (!name) {
      return null
    }
    const siblingName = name + suffix
    for (let i = idx + 1; i < this.fileNames.length; i++) {
      if (this.fileNames[i] === name) {
        break
      }
      if (this.fileNames[i] === siblingName) {
        return this.files[i] ?? null
      }
    }
    for (let i = idx - 1; i >= 0; i--) {
      if (this.fileNames[i] === name) {
        return null
      }
      if (this.fileNames[i] === siblingName) {
        return this.claimedBefore(i, name, siblingName) ? null : this.files[i]!
      }
    }
    return null
  }

  // Whether the index at `idx` belongs to an earlier upload of its file,
  // which takes the first index after it.
  private claimedBefore(idx: number, name: string, siblingName: string) {
    for (let i = idx - 1; i >= 0; i--) {
      if (this.fileNames[i] === siblingName) {
        return false
      }
      if (this.fileNames[i] === name) {
        return true
      }
    }
    return false
  }
}
