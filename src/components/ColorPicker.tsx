import { useId } from 'react'
import type { ColorHex, Palette } from '../Types.ts'

interface ColorPickerProps {
  color?: Palette
  presetColors?: string[]
  onChange: (color: ColorHex) => void
  testID?: string
}

// Rebuilding the string keeps the ColorHex template type without a cast.
function asHex(color: string): ColorHex | undefined {
  return color.startsWith('#') ? `#${color.slice(1)}` : undefined
}

// A native color swatch. The presets are offered through a datalist, which
// browsers surface as suggested swatches inside their own color picker.
export const ColorPicker = ({
  color,
  presetColors,
  onChange,
  testID = 'color-picker-component',
}: ColorPickerProps) => {
  const listId = useId()
  const current = color === undefined ? undefined : asHex(color)
  return (
    <>
      <input
        type="color"
        aria-label="Pick a custom color"
        title="Pick a custom color"
        data-testid={testID}
        value={current ?? '#ffffff'}
        list={presetColors ? listId : undefined}
        onChange={e => {
          const picked = asHex(e.target.value)
          if (picked !== undefined) {
            onChange(picked)
          }
        }}
        style={{
          width: 32,
          height: 28,
          padding: 0,
          border: '1px solid #888',
          borderRadius: 3,
          cursor: 'pointer',
          background: 'transparent',
        }}
      />
      {presetColors ? (
        <datalist id={listId}>
          {presetColors.map(preset => (
            <option key={preset} value={preset} />
          ))}
        </datalist>
      ) : null}
    </>
  )
}

export default ColorPicker
