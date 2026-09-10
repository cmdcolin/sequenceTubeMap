import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelpButton } from './HelpButton.tsx'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('HelpButton', () => {
  it('opens popup with help instructions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Instructions'))
    render(<HelpButton file="./help/help.md" />)

    await act(async () => {
      await userEvent.click(screen.getByRole('button'))
    })

    await waitFor(() => { expect(screen.getByText('Instructions')).toBeTruthy(); })
    await waitFor(() => { expect(screen.queryByText('#')).toBeFalsy(); })
  })
})
