import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RootErrorBoundary } from './RootErrorBoundary.tsx'

function Throws(): never {
  throw new Error('config lookup failed')
}

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children when nothing throws', () => {
    render(
      <RootErrorBoundary>
        <p>fine</p>
      </RootErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('shows the error and a way out instead of a blank page', () => {
    render(
      <RootErrorBoundary>
        <Throws />
      </RootErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('config lookup failed')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  // jsdom cannot reload, so this checks the address it would reload
  it('drops the view from the address on Start over, keeping the backend', async () => {
    window.history.replaceState(null, '', '/?tracks=node:x.tsv#local')
    render(
      <RootErrorBoundary>
        <Throws />
      </RootErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#local')
  })
})
