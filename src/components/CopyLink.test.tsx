import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyLink } from './CopyLink.tsx'
import type { ViewTarget } from '../Types.ts'

const VIEW_TARGET: ViewTarget = {
  region: 'x:1-100',
  tracks: [{ trackType: 'graph', trackFile: 'graph.vg' }],
}

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

it('copies the current address, which describes the current view', async () => {
  window.history.replaceState(null, '', '/?region=x%3A1-100')
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  render(<CopyLink currentViewTarget={VIEW_TARGET} />)

  await userEvent.click(screen.getByRole('button', { name: /Copy link/ }))

  expect(writeText).toHaveBeenCalledWith(window.location.href)
  expect(window.location.search).toEqual('?region=x%3A1-100')
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Copied link!/ })).toBeInTheDocument()
  })
})

it('stops claiming a link was copied once the view moves on', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  const { rerender } = render(<CopyLink currentViewTarget={VIEW_TARGET} />)

  await userEvent.click(screen.getByRole('button', { name: /Copy link/ }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Copied link!/ })).toBeInTheDocument()
  })

  // App hands out a new view target object per commit.
  rerender(<CopyLink currentViewTarget={{ ...VIEW_TARGET, region: 'x:200-300' }} />)

  expect(screen.getByRole('button', { name: /Copy link to data/ })).toBeInTheDocument()
})

it('falls back to a dialog when the clipboard is unavailable', async () => {
  stubClipboard(() => Promise.reject(new Error('no clipboard for you')))
  render(<CopyLink currentViewTarget={VIEW_TARGET} />)

  await userEvent.click(screen.getByRole('button', { name: /Copy link/ }))

  await waitFor(() => {
    expect(screen.getByText('Link to Data')).toBeInTheDocument()
  })
  expect(screen.getByRole('link', { name: 'Data' })).toHaveAttribute(
    'href',
    window.location.href,
  )
})
