/**
 * WASI-compatible read-only file objects backed by a Blob.
 *
 * In a Worker we can use FileReaderSync to satisfy the synchronous
 * FileSystemSyncAccessHandle contract that browser_wasi_shim expects. In the
 * main thread (or jsdom) FileReaderSync is unavailable, so we materialize the
 * Blob bytes into an in-memory File ahead of time.
 */

import { File as WasiFile, SyncOPFSFile } from '@bjorn3/browser_wasi_shim'

// FileReaderSync only exists in worker scope; the worker lib isn't loaded in
// the project's tsconfig, so declare just the slice we need here.
declare class FileReaderSync {
  readAsArrayBuffer(blob: Blob): ArrayBuffer
}

// Slice of FileSystemSyncAccessHandle that browser_wasi_shim actually calls.
// The shim's typing for SyncOPFSFile.handle is internal to the package and
// not re-exported, so we describe the contract locally.
interface FileSystemSyncAccessHandleLike {
  close(): void
  flush(): void
  getSize(): number
  read(buffer: ArrayBuffer | ArrayBufferView, options?: { at: number }): number
  truncate(to: number): void
  write(buffer: ArrayBuffer | ArrayBufferView, options?: { at: number }): number
}

/**
 * Synchronous Blob-backed file. We extend SyncOPFSFile so it can be used the
 * same way as an OPFS-backed file inside the WASI shim; we just swap in our
 * own synchronous access handle.
 */
class SyncWorkerBlobFile extends SyncOPFSFile {
  constructor(blob: Blob) {
    super(
      new FileSystemSyncAccessHandlePolyfill(
        blob,
      ),
      { readonly: true },
    )
  }
}

/**
 * Polyfill of FileSystemSyncAccessHandle (the slice used by browser_wasi_shim)
 * implemented on top of a Blob via FileReaderSync. Read-only.
 *
 * Refs:
 *   https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle
 *   https://github.com/bjorn3/browser_wasi_shim/blob/527f4dfee4a0568a7f42e9c0e940aaad7b79d23c/src/fs_core.ts#L460-L470
 */
class FileSystemSyncAccessHandlePolyfill
  implements FileSystemSyncAccessHandleLike
{
  private closed = false
  private blob: Blob
  private reader: FileReaderSync

  constructor(blob: Blob) {
    this.blob = blob
    // Construct now so we fail fast if FileReaderSync is unavailable.
    this.reader = new FileReaderSync()
  }

  close(): void {
    this.closed = true
  }

  flush(): void {
    throw new Error('Flush not implemented; blobs are read only')
  }

  getSize(): number {
    if (this.closed) {
      throw new Error("Can't get size of closed file")
    }
    return this.blob.size
  }

  read(
    buffer: ArrayBuffer | ArrayBufferView,
    options?: { at: number },
  ): number {
    if (this.closed) {
      throw new Error("Can't read closed file")
    }

    const view = ArrayBuffer.isView(buffer)
      ? buffer
      : new Uint8Array(buffer)
    const destinationBuffer = view.buffer as ArrayBuffer
    const destinationOffset = view.byteOffset
    const startByte = options?.at ?? 0
    const length = Math.min(view.byteLength, this.blob.size - startByte)

    const partBlob = this.blob.slice(startByte, startByte + length)
    const partBuffer = this.reader.readAsArrayBuffer(partBlob)

    const destinationArray = new Uint8Array(
      destinationBuffer,
      destinationOffset,
      length,
    )
    const sourceArray = new Uint8Array(partBuffer, 0, length)
    destinationArray.set(sourceArray)

    return length
  }

  truncate(_to: number): void {
    throw new Error('Truncate not implemented; blobs are read only')
  }

  write(
    _buffer: ArrayBuffer | ArrayBufferView,
    _options?: { at: number },
  ): number {
    throw new Error('Write not implemented; blobs are read only')
  }
}

/**
 * Build a WASI file from a Blob, picking the right strategy for the
 * environment. In a Worker we get a true synchronous file; elsewhere we read
 * the bytes into memory up front.
 */
export async function makeWasiFile(
  blob: Blob,
): Promise<SyncWorkerBlobFile | WasiFile> {
  if (typeof FileReaderSync !== 'undefined') {
    return new SyncWorkerBlobFile(blob)
  }
  console.warn(
    `Sync blob read is not available. Reading ${blob.size} byte blob into memory asynchronously to consult synchronously later!`,
  )
  return new WasiFile(new Uint8Array(await blob.arrayBuffer()))
}
