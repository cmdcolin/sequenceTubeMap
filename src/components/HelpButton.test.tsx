import createFetchMock from 'vitest-fetch-mock'
import { vi } from 'vitest'
const fetchMocker = createFetchMock(vi)
fetchMocker.enableMocks()

import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelpButton } from './HelpButton'

describe('HelpButton', () => {
  it('opens popup with help instructions', async () => {
    fetchMocker.mockResponseOnce('Instructions')
    render(<HelpButton file="./help/help.md" />)

    await act(async () => {
      await userEvent.click(screen.getByRole('button'))
    })

    await waitFor(() => { expect(screen.getByText('Instructions')).toBeTruthy(); })
    await waitFor(() => { expect(screen.queryByText('#')).toBeFalsy(); })
  })
})
