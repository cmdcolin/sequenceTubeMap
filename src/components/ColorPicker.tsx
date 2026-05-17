import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SketchPicker } from 'react-color'
import { Button, Container } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPalette } from '@fortawesome/free-solid-svg-icons'
import type { ColorHex, Palette } from '../Types.ts'

interface ColorPickerProps {
  color?: Palette
  presetColors?: string[]
  onChange: (color: ColorHex) => void
  testID?: string
}

// A react-color picker embedded within a button
export const ColorPicker = ({
  color,
  presetColors,
  onChange,
  testID = 'color-picker-component',
}: ColorPickerProps) => {
  const [nextColor, setNextColor] = useState<ColorHex>()
  const [open, setOpen] = useState(false)

  const popover: CSSProperties = {
    position: 'absolute',
    zIndex: 2,
  }

  const cover: CSSProperties = {
    position: 'fixed',
    top: '0px',
    right: '0px',
    bottom: '0px',
    left: '0px',
  }

  function togglePicker() {
    if (open) {
      setOpen(false)
      if (nextColor) {
        onChange(nextColor)
      }
    } else {
      setOpen(true)
      if (color?.startsWith('#')) {
        setNextColor(color as ColorHex)
      } else {
        setNextColor(undefined)
      }
    }
  }

  return (
    <div>
      <Button
        aria-label="ColorPicker"
        onClick={() => { togglePicker(); }}
        data-testid={testID}
      >
        <FontAwesomeIcon icon={faPalette} />
      </Button>

      {open ? (
        <div style={popover}>
          <div style={cover} onClick={() => { togglePicker(); }} />
          <Container>
            <SketchPicker
              color={nextColor || '#fff'}
              presetColors={presetColors}
              onChange={newColor => {
                setNextColor(newColor.hex as ColorHex)
              }}
            />
          </Container>
        </div>
      ) : null}
    </div>
  )
}

export default ColorPicker
