import { CopyLink } from './CopyLink.tsx'
import { Form, Button } from 'reactstrap'
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
    <Form>
      &nbsp;
      <Button
        size="sm"
        color="primary"
        title={goTitle}
        id="goButton"
        onClick={() => { handleGoButton(); }}
        disabled={goDisabled}
      >
        Go
      </Button>
      <Button
        size="sm"
        color="primary"
        id="zoomInButton"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => { tubeMap.zoomBy(ZOOM_FACTOR); }}
      >
        <FontAwesomeIcon icon={faSearchPlus} />
      </Button>
      <Button
        size="sm"
        color="primary"
        id="zoomOutButton"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => { tubeMap.zoomBy(1.0 / ZOOM_FACTOR); }}
      >
        <FontAwesomeIcon icon={faSearchMinus} />
      </Button>
      <Button
        size="sm"
        color="primary"
        id="downloadButton"
        onClick={() => { downloadSvgById('svg', 'graph.svg'); }}
      >
        <FontAwesomeIcon icon={faCamera} className="me-1" />
        Download Image
      </Button>
      <CopyLink currentViewTarget={currentViewTarget} />
    </Form>
  )
}

export default DataPositionFormRow
