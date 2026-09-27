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

  it('drops the query string before reloading on Start over', async () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      pathname: '/',
      hash: '#local',
      reload,
    })
    const replaceState = vi
      .spyOn(window.history, 'replaceState')
      .mockImplementation(() => {})
    render(
      <RootErrorBoundary>
        <Throws />
      </RootErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#local')
    expect(reload).toHaveBeenCalled()
  })
})
