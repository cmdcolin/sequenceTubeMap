import { useEffect } from 'react'

// Keys are named as they arrive from KeyboardEvent.key, and named keys (the
// multi-character ones like ArrowLeft) may carry a "Shift+" prefix. Printable
// characters don't, because the shift state is already part of the character
// they produce — "+" is Shift and "=" on a US keyboard.
export type ShortcutTable = Record<string, (() => void) | undefined>

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  )
}

function chordFor(event: KeyboardEvent) {
  const shifted = event.shiftKey && event.key.length > 1
  return `${shifted ? 'Shift+' : ''}${event.key}`
}

// Installs one window keydown listener for the given shortcuts. A window
// listener is an external system, so synchronizing it in an effect is what
// effects are for. Keystrokes aimed at a text field are left alone.
export function useKeyboardShortcuts(shortcuts: ShortcutTable) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        const handler = shortcuts[chordFor(event)]
        if (handler) {
          event.preventDefault()
          handler()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [shortcuts])
}
