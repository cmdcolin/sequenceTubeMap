import type { ReactNode, ChangeEvent } from 'react'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import type { ColorPaletteName, PaletteField, Palette } from '../Types.ts'

// map of all possible colors [displayedName, value]
const colorMap = new Map<string, ColorPaletteName>([
  ['colorful', 'plainColors'],
  ['greyscale', 'greys'],
  ['Ygreyscale', 'ygreys'],
  ['reds', 'reds'],
  ['blues', 'blues'],
  ['pale colors', 'lightColors'],
])

interface RadioRowProps {
  color?: Palette
  rowHeading: ReactNode
  setColorSetting: (setting: PaletteField, value: Palette) => void
  setting: PaletteField
}

function RadioRow({
  color,
  rowHeading,
  setColorSetting,
  setting,
}: RadioRowProps) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = colorMap.get(event.target.value)
    if (next !== undefined) {
      setColorSetting(setting, next)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 1,
        mb: 0.5,
      }}
    >
      {rowHeading}:
      {[...colorMap].map(([keyColor, valueColor]) => (
        <FormControlLabel
          key={keyColor}
          label={keyColor}
          sx={{ '& .MuiFormControlLabel-label': { fontSize: 'inherit' } }}
          control={
            <Radio
              value={keyColor}
              checked={color === valueColor}
              onChange={onChange}
            />
          }
        />
      ))}
    </Box>
  )
}

export default RadioRow
