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
// assigns ids via `uploads.length.toString()`). Anything else is treated as a
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

interface Upload {
  blob: Blob
  // Null when unknown, e.g. an anonymous Blob.
  name: string | null
  batch: string | undefined
}

export class UploadRegistry {
  private uploads: Upload[] = []

  add(file: {
    name: string
    blob: Blob
    batch?: string | undefined
  }): AddResult {
    const id = this.uploads.length.toString()
    this.uploads.push({
      blob: file.blob,
      name: file.name || null,
      batch: file.batch,
    })
    return { id, isSibling: isSiblingIndex(file.name) }
  }

  get(id: string): Blob | null {
    return this.uploads[parseInt(id, 10)]?.blob ?? null
  }

  // Original filename for an upload id, or null if the id is unknown / had no
  // name. Callers use this for UI labels and for extension-based dispatch
  // (e.g. is this .gbz.db?) since `id` is a registry index, not a path.
  getName(id: string): string | null {
    return this.uploads[parseInt(id, 10)]?.name ?? null
  }

  // Look up an upload's sibling at `originalName + suffix`. A file dropped
  // again repeats its name, so the latest index by name can belong to an older
  // copy of the file. An upload that came in a batch pairs only with an index
  // from the same batch. Without one, as from `pnpm tubemap-cli`, which sends
  // a file and then its index, an index goes with an upload of its file only
  // when no other batch-less upload of either name lies between them, and
  // each upload takes the first such index after it before one before it.
  sibling(id: string, suffix: string): Blob | null {
    const upload = this.uploads[parseInt(id, 10)]
    if (!upload?.name) {
      return null
    }
    const peers = this.uploads.filter(u => u.batch === upload.batch)
    const at = peers.indexOf(upload)
    const name = upload.name
    const siblingName = name + suffix
    for (let i = at + 1; i < peers.length; i++) {
      if (peers[i]!.name === name) {
        break
      }
      if (peers[i]!.name === siblingName) {
        return peers[i]!.blob
      }
    }
    for (let i = at - 1; i >= 0; i--) {
      if (peers[i]!.name === name) {
        return null
      }
      if (peers[i]!.name === siblingName) {
        return claimedBefore(peers, i, name, siblingName)
          ? null
          : peers[i]!.blob
      }
    }
    return null
  }
}

// Whether the index at `at` belongs to an earlier upload of its file, which
// takes the first index after it.
function claimedBefore(
  uploads: Upload[],
  at: number,
  name: string,
  siblingName: string,
): boolean {
  for (let i = at - 1; i >= 0; i--) {
    if (uploads[i]!.name === siblingName) {
      return false
    }
    if (uploads[i]!.name === name) {
      return true
    }
  }
  return false
}
