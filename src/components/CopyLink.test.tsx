import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyLink } from './CopyLink.tsx'

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
  render(<CopyLink />)

  await userEvent.click(screen.getByRole('button', { name: /Copy link/ }))

  expect(writeText).toHaveBeenCalledWith(window.location.href)
  expect(window.location.search).toEqual('?region=x%3A1-100')
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Copied link!/ })).toBeInTheDocument()
  })
})

it('falls back to a dialog when the clipboard is unavailable', async () => {
  stubClipboard(() => Promise.reject(new Error('no clipboard for you')))
  render(<CopyLink />)

  await userEvent.click(screen.getByRole('button', { name: /Copy link/ }))

  await waitFor(() => {
    expect(screen.getByText('Link to Data')).toBeInTheDocument()
  })
  expect(screen.getByRole('link', { name: 'Data' })).toHaveAttribute(
    'href',
    window.location.href,
  )
})
