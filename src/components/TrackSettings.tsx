import Box from '@mui/material/Box'
import RadioRow from './RadioRow.tsx'
import ColorPicker from './ColorPicker.tsx'
import {
  DEFAULT_AVAILABLE_COLORS,
  type ColorPaletteName,
  type ColorScheme,
  type FileType,
  type PaletteField,
  type Palette,
} from '../Types.ts'

type SettingsFileType = FileType | 'nodeLabel'

interface TrackSettingsProps {
  fileType?: SettingsFileType
  // Partial because the node-label dialog only carries mainPalette.
  trackColorSettings?: Partial<ColorScheme>
  setTrackColorSetting: (key: PaletteField, value: Palette) => void
  label?: string
  availableColors?: ColorPaletteName[]
  presetColors?: string[]
}

const DEFAULT_PRESET_COLORS = [
  '#FF6900',
  '#FCB900',
  '#7BDCB5',
  '#00D084',
  '#8ED1FC',
  '#0693E3',
  '#ABB8C3',
  '#EB144C',
  '#F78DA7',
  '#9900EF',
]

const DEFAULT_COLOR_SETTINGS: Partial<ColorScheme> = {
  mainPalette: 'blues',
  auxPalette: 'reds',
  colorReadsByMappingQuality: false,
  alphaReadsByMappingQuality: false,
}

// Per file type, the row headings for the (main, aux) palette slots.
// undefined for aux means that file type only has a single palette slot.
const ROW_LABELS: Partial<Record<SettingsFileType, [string, string?]>> = {
  haplotype: ['Haplotypes'],
  graph: ['Reference Path', 'Non-Reference Path'],
  read: ['Forward Reads', 'Reverse Reads'],
  nodeLabel: ['Node Labels'],
}

interface PaletteRowProps {
  heading: string
  palette: Palette | undefined
  field: PaletteField
  setColor: (field: PaletteField, value: Palette) => void
  availableColors: ColorPaletteName[]
  presetColors: string[]
}

const PaletteRow = ({
  heading,
  palette,
  field,
  setColor,
  availableColors,
  presetColors,
}: PaletteRowProps) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 680 }}>
    <Box sx={{ flexGrow: 1 }}>
      <RadioRow
        rowHeading={heading}
        color={palette}
        setting={field}
        setColorSetting={setColor}
        availableColors={availableColors}
      />
    </Box>
    <ColorPicker
      color={palette}
      presetColors={presetColors}
      onChange={color => { setColor(field, color); }}
    />
  </Box>
)

/**
 * A component meant to contain settings related to an individual track.
 */
export const TrackSettings = ({
  fileType = 'haplotype',
  trackColorSettings = DEFAULT_COLOR_SETTINGS,
  setTrackColorSetting,
  label,
  availableColors = DEFAULT_AVAILABLE_COLORS,
  presetColors = DEFAULT_PRESET_COLORS,
}: TrackSettingsProps) => {
  const labels = ROW_LABELS[fileType]
  return (
    <>
      <h5>{label === undefined ? 'Colors' : `${label} Colors`}</h5>
      {labels && (
        <Box component="form">
          <PaletteRow
            heading={labels[0]}
            palette={trackColorSettings.mainPalette}
            field="mainPalette"
            setColor={setTrackColorSetting}
            availableColors={availableColors}
            presetColors={presetColors}
          />
          {labels[1] !== undefined && (
            <PaletteRow
              heading={labels[1]}
              palette={trackColorSettings.auxPalette}
              field="auxPalette"
              setColor={setTrackColorSetting}
              availableColors={availableColors}
              presetColors={presetColors}
            />
          )}
        </Box>
      )}
    </>
  )
}

export default TrackSettings
