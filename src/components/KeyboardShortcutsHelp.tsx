import HelpDialog from './HelpDialog.tsx'

const SHORTCUTS: [string, string][] = [
  ['+ / -', 'Zoom the tube map in and out'],
  ['[ / ]', 'Previous / next region from the loaded BED file'],
  ['Shift + ← / →', 'Shift the region left or right by half a window'],
  ['/', 'Jump to the region input'],
  ['Escape', 'Close the open context menu or the legend'],
]

export function KeyboardShortcutsHelp() {
  return (
    <HelpDialog title="Keyboard shortcuts" label="Keyboard shortcuts">
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {SHORTCUTS.map(([keys, description]) => (
            <tr key={keys}>
              <td
                style={{
                  paddingRight: '1.5em',
                  paddingBottom: '0.5em',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'top',
                }}
              >
                <code>{keys}</code>
              </td>
              <td style={{ paddingBottom: '0.5em' }}>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Shortcuts are ignored while you are typing in a text field, so the
        region input keeps its own behavior.
      </p>
    </HelpDialog>
  )
}

export default KeyboardShortcutsHelp
