import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useKeyboardShortcuts, type ShortcutTable } from './useKeyboardShortcuts.ts'

function Harness({ shortcuts }: { shortcuts: ShortcutTable }) {
  useKeyboardShortcuts(shortcuts)
  return (
    <div>
      <input aria-label="text field" />
      <textarea aria-label="notes" />
    </div>
  )
}

it('runs the handler for a plain key', async () => {
  const slash = vi.fn()
  render(<Harness shortcuts={{ '/': slash }} />)

  await userEvent.keyboard('/')

  expect(slash).toHaveBeenCalledTimes(1)
})

it('names shifted arrows with a Shift prefix and shifted characters without', async () => {
  const shiftLeft = vi.fn()
  const plus = vi.fn()
  render(<Harness shortcuts={{ 'Shift+ArrowLeft': shiftLeft, '+': plus }} />)

  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  expect(shiftLeft).toHaveBeenCalledTimes(1)

  await userEvent.keyboard('+')
  expect(plus).toHaveBeenCalledTimes(1)
})

it('ignores keys typed into a field', async () => {
  const handler = vi.fn()
  render(<Harness shortcuts={{ '/': handler, a: handler }} />)

  await userEvent.click(screen.getByLabelText('text field'))
  await userEvent.keyboard('/a')
  await userEvent.click(screen.getByLabelText('notes'))
  await userEvent.keyboard('/a')

  expect(handler).not.toHaveBeenCalled()
})

it('leaves shortcuts with a modifier to the browser', async () => {
  const handler = vi.fn()
  render(<Harness shortcuts={{ s: handler }} />)

  await userEvent.keyboard('{Control>}s{/Control}')
  await userEvent.keyboard('{Meta>}s{/Meta}')

  expect(handler).not.toHaveBeenCalled()
})

it('does nothing for a key with no handler', async () => {
  const handler = vi.fn()
  render(<Harness shortcuts={{ '/': handler, q: undefined }} />)

  await userEvent.keyboard('q')

  expect(handler).not.toHaveBeenCalled()
})
