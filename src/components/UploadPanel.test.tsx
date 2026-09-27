import '../config-client.js'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadPanel from './UploadPanel.tsx'
import type { FileType } from '../Types.ts'

function fakeFile(name: string, content = 'data') {
  return new File([content], name, { type: 'application/octet-stream' })
}

describe('UploadPanel mode toggle', () => {
  it('highlights the active mode', () => {
    render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="upstream"
        selfHostedServer={false}
        onDestChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('mode-upstream')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('mode-local')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('switches to the mode clicked', async () => {
    const onDestChange = vi.fn()
    render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="upstream"
        selfHostedServer={false}
        onDestChange={onDestChange}
      />,
    )

    await userEvent.click(screen.getByTestId('mode-local'))
    expect(onDestChange).toHaveBeenCalledWith('local')
  })

  it('offers the self-hosted server only when one is configured', async () => {
    const onDestChange = vi.fn()
    const { rerender } = render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="local"
        selfHostedServer={false}
        onDestChange={onDestChange}
      />,
    )
    expect(screen.queryByTestId('mode-server')).toBeNull()

    rerender(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="local"
        selfHostedServer
        onDestChange={onDestChange}
      />,
    )
    await userEvent.click(screen.getByTestId('mode-server'))
    expect(onDestChange).toHaveBeenCalledWith('server')
  })

  it('holds the mode still while an upload runs', async () => {
    const onDestChange = vi.fn()
    render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={() => new Promise(() => {})}
        apiMode="upstream"
        selfHostedServer={false}
        onDestChange={onDestChange}
      />,
    )
    const input = screen
      .getByTestId('UploadPanel')
      .querySelector<HTMLInputElement>('input[type="file"]')!
    await userEvent.upload(input, [fakeFile('graph.xg')])

    fireEvent.click(screen.getByRole('button', { name: /upload & use/i }))

    expect(await screen.findByTestId('mode-local')).toBeDisabled()
    expect(onDestChange).not.toHaveBeenCalled()
  })

  it('omits the toggle when no onDestChange is provided', () => {
    render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="upstream"
      />,
    )
    expect(screen.queryByTestId('mode-upstream')).toBeNull()
    expect(screen.queryByTestId('mode-local')).toBeNull()
  })
})

describe('UploadPanel server-mode .gam.gai handling', () => {
  it('uploads .gam but silently skips its sibling .gam.gai in server mode', async () => {
    const uploaded: { type: FileType; name: string }[] = []
    const handleFileUpload = vi.fn(async (type: FileType, file: File) => {
      uploaded.push({ type, name: file.name })
      return file.name
    })
    const onUploaded = vi.fn()

    render(
      <UploadPanel
        onUploaded={onUploaded}
        handleFileUpload={handleFileUpload}
        apiMode="upstream"
        selfHostedServer={false}
        onDestChange={vi.fn()}
      />,
    )

    const input = screen
      .getByTestId('UploadPanel')
      .querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input).not.toBeNull()

    const gam = fakeFile('reads.sorted.gam')
    const gai = fakeFile('reads.sorted.gam.gai')

    await userEvent.upload(input, [gam, gai])

    // Both files appear in the staged list — the .gai is shown but marked.
    expect(screen.getByText('reads.sorted.gam')).toBeTruthy()
    expect(screen.getByText('reads.sorted.gam.gai')).toBeTruthy()
    expect(screen.getByText(/skipped on server/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /upload & use/i }))

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalled()
    })

    expect(handleFileUpload).toHaveBeenCalledTimes(1)
    expect(uploaded).toEqual([{ type: 'read', name: 'reads.sorted.gam' }])

    const tracks = onUploaded.mock.calls[0]![0] as { trackFile: string }[]
    expect(tracks).toHaveLength(1)
    expect(tracks[0]!.trackFile).toBe('reads.sorted.gam')
  })

  it('uploads .gam.gai alongside .gam in local mode (sibling lookup)', async () => {
    const uploaded: { type: FileType; name: string }[] = []
    const handleFileUpload = vi.fn(
      async (type: FileType, file: File, _batch?: string) => {
        uploaded.push({ type, name: file.name })
        return file.name
      },
    )
    const onUploaded = vi.fn()

    render(
      <UploadPanel
        onUploaded={onUploaded}
        handleFileUpload={handleFileUpload}
        apiMode="local"
        selfHostedServer={false}
        onDestChange={vi.fn()}
      />,
    )

    const input = screen
      .getByTestId('UploadPanel')
      .querySelector<HTMLInputElement>('input[type="file"]')!

    await userEvent.upload(input, [
      fakeFile('reads.sorted.gam'),
      fakeFile('reads.sorted.gam.gai'),
    ])

    expect(screen.getByText(/paired with \.gam/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /load files/i }))

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalled()
    })

    expect(handleFileUpload).toHaveBeenCalledTimes(2)
    expect(uploaded.map(u => u.name).sort()).toEqual([
      'reads.sorted.gam',
      'reads.sorted.gam.gai',
    ])
    // One click is one batch, which is what pairs the index with this copy of
    // the file rather than another dropped under the same name.
    const [first, second] = handleFileUpload.mock.calls.map(call => call[2])
    expect(first).toBeDefined()
    expect(second).toBe(first)

    // Only the .gam becomes a track; the .gai is registered as a sibling.
    const tracks = onUploaded.mock.calls[0]![0] as { trackFile: string }[]
    expect(tracks).toHaveLength(1)
    expect(tracks[0]!.trackFile).toBe('reads.sorted.gam')
  })

  it('accepts .xg / .vg / .gbz graphs in server mode', async () => {
    const handleFileUpload = vi.fn(
      async (_type: FileType, file: File) => file.name,
    )
    const onUploaded = vi.fn()

    render(
      <UploadPanel
        onUploaded={onUploaded}
        handleFileUpload={handleFileUpload}
        apiMode="server"
        selfHostedServer
        onDestChange={vi.fn()}
      />,
    )

    const input = screen
      .getByTestId('UploadPanel')
      .querySelector<HTMLInputElement>('input[type="file"]')!

    await userEvent.upload(input, [
      fakeFile('graph.xg'),
      fakeFile('alt.vg'),
      fakeFile('big.gbz'),
    ])

    fireEvent.click(screen.getByRole('button', { name: /upload & use/i }))

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalled()
    })

    expect(handleFileUpload).toHaveBeenCalledTimes(3)
    const tracks = onUploaded.mock.calls[0]![0] as {
      trackFile: string
      trackType: FileType
    }[]
    expect(tracks.map(t => t.trackFile).sort()).toEqual([
      'alt.vg',
      'big.gbz',
      'graph.xg',
    ])
    expect(tracks.every(t => t.trackType === 'graph')).toBe(true)
  })

  it('rejects non-WASM-supported files in local mode with an error', async () => {
    render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="local"
        selfHostedServer={false}
        onDestChange={vi.fn()}
      />,
    )

    const input = screen
      .getByTestId('UploadPanel')
      .querySelector<HTMLInputElement>('input[type="file"]')!

    // bypass the input's `accept` filter (which userEvent normally applies)
    // so we can verify the panel's own runtime filter rejects the .xg.
    await userEvent.upload(input, [fakeFile('graph.xg')], {
      applyAccept: false,
    })

    expect(screen.getByText(/browser mode only accepts/)).toBeTruthy()
    expect(screen.queryByText('graph.xg')).toBeNull()
  })

  it('rejects oversized files at stage time in server mode', async () => {
    const handleFileUpload = vi.fn()
    render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={handleFileUpload}
        apiMode="upstream"
        selfHostedServer={false}
        onDestChange={vi.fn()}
      />,
    )

    const input = screen
      .getByTestId('UploadPanel')
      .querySelector<HTMLInputElement>('input[type="file"]')!

    // Build a "file" that reports a huge size without allocating bytes.
    const big = new File(['x'], 'big.gam', { type: 'application/octet-stream' })
    Object.defineProperty(big, 'size', { value: 50 * 1024 * 1024 })

    await userEvent.upload(input, [big])

    expect(screen.getByText(/exceeds .* MB server limit/)).toBeTruthy()
    expect(screen.queryByText('big.gam')).toBeNull()
    expect(handleFileUpload).not.toHaveBeenCalled()
  })
})

describe('UploadPanel mode flip', () => {
  it('drops the staged files the new mode cannot take and keeps the rest', async () => {
    const { rerender } = render(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="upstream"
        selfHostedServer={false}
        onDestChange={vi.fn()}
      />,
    )

    const input = screen
      .getByTestId('UploadPanel')
      .querySelector<HTMLInputElement>('input[type="file"]')!

    await userEvent.upload(input, [
      fakeFile('graph.xg'),
      fakeFile('graph.gbz.db'),
    ])
    expect(screen.getByText('graph.xg')).toBeTruthy()

    rerender(
      <UploadPanel
        onUploaded={vi.fn()}
        handleFileUpload={vi.fn()}
        apiMode="local"
        selfHostedServer={false}
        onDestChange={vi.fn()}
      />,
    )

    expect(screen.queryByText('graph.xg')).toBeNull()
    expect(screen.getByText('graph.gbz.db')).toBeTruthy()
    expect(
      screen.getByText(/1 skipped — browser mode only accepts/),
    ).toBeTruthy()
  })
})
