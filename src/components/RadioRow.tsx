import type { ReactNode, ChangeEvent } from 'react'
import { Col, Label, Input, FormGroup } from 'reactstrap'
import type { ColorPaletteName, Palette } from '../Types'

// map of all possible colors [displayedName, value]
const colorMap = new Map<string, ColorPaletteName>([
  ['colorful', 'plainColors'],
  ['greyscale', 'greys'],
  ['Ygreyscale', 'ygreys'],
  ['reds', 'reds'],
  ['blues', 'blues'],
  ['pale colors', 'lightColors'],
])

const defaultAvailableColors: ColorPaletteName[] = [
  'greys',
  'ygreys',
  'blues',
  'reds',
  'plainColors',
  'lightColors',
]

interface RadioRowProps {
  color?: Palette | string
  rowHeading: ReactNode
  setColorSetting: (setting: string, value: Palette) => void
  setting: string
  availableColors?: ColorPaletteName[]
}

function RadioRow({
  color,
  rowHeading,
  setColorSetting,
  setting,
  availableColors = defaultAvailableColors,
}: RadioRowProps) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = colorMap.get(event.target.value)
    if (next !== undefined) {
      setColorSetting(setting, next)
    }
  }

  const currColorMap = new Map(
    Array.from(colorMap).filter(([, valueColor]) =>
      availableColors.includes(valueColor),
    ),
  )

  const colorRadios = Array.from(currColorMap).map(([keyColor, valueColor]) => (
    <Col xs="auto" key={keyColor}>
      <FormGroup check>
        <Label check>
          <Input
            type="radio"
            value={keyColor}
            checked={color === valueColor}
            onChange={onChange}
            key={keyColor}
          />
          {keyColor}
        </Label>
      </FormGroup>
    </Col>
  ))

  return (
    <FormGroup row className="mb-1">
      {rowHeading}:{colorRadios}
    </FormGroup>
  )
}

export default RadioRow
