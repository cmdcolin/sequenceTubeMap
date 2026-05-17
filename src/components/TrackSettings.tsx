import { Form, Row, Col } from 'reactstrap'
import RadioRow from './RadioRow.tsx'
import ColorPicker from './ColorPicker.tsx'
import {
  DEFAULT_AVAILABLE_COLORS,
  type ColorPaletteName,
  type ColorScheme,
  type FileType,
  type Palette,
} from '../Types.ts'

interface TrackSettingsProps {
  fileType?: FileType | 'nodeLabel'
  // Partial because the node-label dialog only carries mainPalette.
  trackColorSettings?: Partial<ColorScheme>
  setTrackColorSetting: (key: keyof ColorScheme, value: Palette) => void
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
  function colorRenderSwitch(fileType: FileType | 'nodeLabel') {
    switch (fileType) {
      case 'haplotype':
        return (
          <Form>
            <Row>
              <Col className="radio-row">
                <RadioRow
                  rowHeading="Haplotypes"
                  color={trackColorSettings.mainPalette}
                  setting="mainPalette"
                  setColorSetting={setTrackColorSetting}
                  availableColors={availableColors}
                />
              </Col>
              <Col className="tracklist-button" md="1">
                <ColorPicker
                  color={trackColorSettings.mainPalette}
                  presetColors={presetColors}
                  onChange={color => {
                    setTrackColorSetting('mainPalette', color)
                  }}
                />
              </Col>
            </Row>
          </Form>
        )
      case 'graph':
      case 'read':
        return (
          <Form>
            <Row>
              <Col className="radio-row">
                <RadioRow
                  rowHeading={
                    fileType === 'read' ? 'Forward Reads' : 'Reference Path'
                  }
                  color={trackColorSettings.mainPalette}
                  setting="mainPalette"
                  setColorSetting={setTrackColorSetting}
                  availableColors={availableColors}
                />
              </Col>
              <Col className="tracklist-button" md="1">
                <ColorPicker
                  color={trackColorSettings.mainPalette}
                  presetColors={presetColors}
                  onChange={color => {
                    setTrackColorSetting('mainPalette', color)
                  }}
                />
              </Col>
            </Row>
            <Row>
              <Col className="radio-row">
                <RadioRow
                  rowHeading={
                    fileType === 'read' ? 'Reverse Reads' : 'Non-Reference Path'
                  }
                  color={trackColorSettings.auxPalette}
                  setting="auxPalette"
                  setColorSetting={setTrackColorSetting}
                  availableColors={availableColors}
                />
              </Col>
              <Col className="tracklist-button" md="1">
                <ColorPicker
                  color={trackColorSettings.auxPalette}
                  presetColors={presetColors}
                  onChange={color => {
                    setTrackColorSetting('auxPalette', color)
                  }}
                />
              </Col>
            </Row>
          </Form>
        )
      case 'nodeLabel':
        return (
          <Form>
            <Row>
              <Col className="radio-row">
                <RadioRow
                  rowHeading="Node Labels"
                  color={trackColorSettings.mainPalette}
                  setting="mainPalette"
                  setColorSetting={setTrackColorSetting}
                  availableColors={availableColors}
                />
              </Col>
              <Col className="tracklist-button" md="1">
                <ColorPicker
                  color={trackColorSettings.mainPalette}
                  presetColors={presetColors}
                  onChange={color => {
                    setTrackColorSetting('mainPalette', color)
                  }}
                />
              </Col>
            </Row>
          </Form>
        )
      case 'node':
      case 'translation':
        return null
      default:
        throw new Error('Invalid file type')
    }
  }

  return (
    <>
      <h5>{label} Colors</h5>
      {colorRenderSwitch(fileType)}
    </>
  )
}

export default TrackSettings
