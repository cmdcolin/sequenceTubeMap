import { CopyLink } from './CopyLink.tsx'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSearchPlus,
  faSearchMinus,
  faCamera,
} from '@fortawesome/free-solid-svg-icons'
import * as tubeMap from '../util/tubemap.ts'
import { downloadSvgById } from '../util/downloadSvg.ts'
import { legendSections } from '../util/legend.ts'
import type { Tracks, ViewTarget } from '../Types.ts'

const ZOOM_FACTOR = 2.0

interface DataPositionFormRowProps {
  handleGoButton: () => void
  // Passed through to CopyLink, which uses it to tell one copied view from
  // the next.
  currentViewTarget: ViewTarget
  viewTargetHasChange: boolean
  canGo: boolean
  // Whether the committed view is still being fetched.
  loading: boolean
  // The tracks the color key describes, or undefined when the user has the
  // legend hidden — which keeps it out of a saved figure too.
  legendTracks: Tracks | undefined
}

function DataPositionFormRow({
  handleGoButton,
  currentViewTarget,
  viewTargetHasChange,
  canGo,
  loading,
  legendTracks,
}: DataPositionFormRowProps) {
  const goDisabled = !canGo || !viewTargetHasChange || loading
  const goTitle = loading
    ? 'Loading the current view…'
    : !canGo
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
        startIcon={
          loading ? <CircularProgress size={14} color="inherit" /> : undefined
        }
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
        onClick={() => {
          downloadSvgById(
            'svg',
            'graph.svg',
            legendTracks &&
              legendSections({
                tracks: legendTracks,
                ...tubeMap.getRenderedColoring(),
              }),
          )
        }}
      >
        Download Image
      </Button>
      <CopyLink currentViewTarget={currentViewTarget} />
    </Box>
  )
}

export default DataPositionFormRow
