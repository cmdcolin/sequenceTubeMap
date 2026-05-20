import type { KeyboardEvent } from 'react'
import { CopyLink } from './CopyLink.tsx'
import { Form, Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSearchPlus,
  faSearchMinus,
  faCamera,
} from '@fortawesome/free-solid-svg-icons'
import * as tubeMap from '../util/tubemap.ts'
import type { ViewTarget } from '../Types.ts'

const ZOOM_FACTOR = 2.0

interface DataPositionFormRowProps {
  handleGoButton: () => void
  uploadInProgress: boolean
  currentViewTarget: ViewTarget
  viewTargetHasChange: boolean
  canGo: boolean
  handleInputChange?: (event: KeyboardEvent<HTMLFormElement>) => void
}

function DataPositionFormRow({
  handleGoButton,
  uploadInProgress,
  currentViewTarget,
  viewTargetHasChange,
  canGo,
  handleInputChange,
}: DataPositionFormRowProps) {
  const onKeyUp = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleInputChange?.(event)
      if (canGo) {
        handleGoButton()
      }
    }
  }

  const goDisabled = uploadInProgress || !canGo || !viewTargetHasChange
  const goTitle = !canGo
    ? 'Pick a region (e.g. "ref:0-1000") and load a graph before clicking Go.'
    : viewTargetHasChange
      ? 'Click to apply pending changes.'
      : 'No changes to apply; view is up to date.'

  const handleDownloadButton = () => {
    const svgN = document.getElementById('svg')
    if (!svgN) return
    const svgData = new XMLSerializer().serializeToString(svgN)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)
    const downloadLink = document.createElement('a')
    downloadLink.href = svgUrl
    downloadLink.download = 'graph.svg'
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
  }

  return (
    <Form onKeyUp={onKeyUp}>
      &nbsp;
      {uploadInProgress && (
        <div className="smallLoader" id="fileUploadSpinner" />
      )}
      <Button
        color="primary"
        title={goTitle}
        id="goButton"
        onClick={() => { handleGoButton(); }}
        disabled={goDisabled}
      >
        Go
      </Button>
      <Button
        color="primary"
        id="zoomInButton"
        onClick={() => { tubeMap.zoomBy(ZOOM_FACTOR); }}
      >
        <FontAwesomeIcon icon={faSearchPlus} size="lg" />
      </Button>
      <Button
        color="primary"
        id="zoomOutButton"
        onClick={() => { tubeMap.zoomBy(1.0 / ZOOM_FACTOR); }}
      >
        <FontAwesomeIcon icon={faSearchMinus} size="lg" />
      </Button>
      <Button
        color="primary"
        id="downloadButton"
        onClick={() => { handleDownloadButton(); }}
      >
        <FontAwesomeIcon icon={faCamera} className="me-1" />
        Download Image
      </Button>
      <CopyLink currentViewTarget={currentViewTarget} />
      {uploadInProgress && (
        <div className="spinner-grow upload-in-progress" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      )}
    </Form>
  )
}

export default DataPositionFormRow
