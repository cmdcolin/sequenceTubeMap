import { Col, Label, Input, FormGroup } from 'reactstrap'

// map of all possible colors [displayedName, value]
const colorMap = new Map([
  ['colorful', 'plainColors'],
  ['greyscale', 'greys'],
  ['Ygreyscale', 'ygreys'],
  ['reds', 'reds'],
  ['blues', 'blues'],
  ['pale colors', 'lightColors'],
])

const defaultAvailableColors = [
  'greys',
  'ygreys',
  'blues',
  'reds',
  'plainColors',
  'lightColors',
]

function RadioRow({
  color,
  rowHeading,
  setColorSetting,
  setting,
  availableColors = defaultAvailableColors,
}) {
  const onChange = event => {
    setColorSetting(setting, colorMap.get(event.target.value))
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
