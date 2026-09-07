import { CopyLink } from './CopyLink.tsx'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSearchPlus,
  faSearchMinus,
  faCamera,
} from '@fortawesome/free-solid-svg-icons'
import * as tubeMap from '../util/tubemap.ts'
import { downloadSvgById } from '../util/downloadSvg.ts'
import type { ViewTarget } from '../Types.ts'

const ZOOM_FACTOR = 2.0

interface DataPositionFormRowProps {
  handleGoButton: () => void
  currentViewTarget: ViewTarget
  viewTargetHasChange: boolean
  canGo: boolean
}

function DataPositionFormRow({
  handleGoButton,
  currentViewTarget,
  viewTargetHasChange,
  canGo,
}: DataPositionFormRowProps) {
  const goDisabled = !canGo || !viewTargetHasChange
  const goTitle = !canGo
    ? 'Pick a region (e.g. "ref:0-1000") and load a graph before clicking Go.'
    : viewTargetHasChange
      ? 'Click to apply pending changes.'
      : 'No changes to apply; view is up to date.'

  return (
    <Box
      component="form"
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
      onSubmit={e => { e.preventDefault(); }}
    >
      <Button
        size="small"
        variant="contained"
        title={goTitle}
        id="goButton"
        onClick={() => { handleGoButton(); }}
        disabled={goDisabled}
      >
        Go
      </Button>
      <Button
        size="small"
        variant="contained"
        id="zoomInButton"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => { tubeMap.zoomBy(ZOOM_FACTOR); }}
      >
        <FontAwesomeIcon icon={faSearchPlus} />
      </Button>
      <Button
        size="small"
        variant="contained"
        id="zoomOutButton"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => { tubeMap.zoomBy(1.0 / ZOOM_FACTOR); }}
      >
        <FontAwesomeIcon icon={faSearchMinus} />
      </Button>
      <Button
        size="small"
        variant="contained"
        id="downloadButton"
        startIcon={<FontAwesomeIcon icon={faCamera} />}
        onClick={() => { downloadSvgById('svg', 'graph.svg'); }}
      >
        Download Image
      </Button>
      <CopyLink currentViewTarget={currentViewTarget} />
    </Box>
  )
}

export default DataPositionFormRow
