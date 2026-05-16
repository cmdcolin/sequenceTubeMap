import type { KeyboardEvent } from 'react'
import { CopyLink } from './CopyLink'
import { Form, Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faStepBackward,
  faStepForward,
  faSearchPlus,
  faSearchMinus,
} from '@fortawesome/free-solid-svg-icons'
import HelpButton from './HelpButton'
import * as tubeMap from '../util/tubemap'
import type { ViewTarget } from '../Types'

const ZOOM_FACTOR = 2.0

interface DataPositionFormRowProps {
  handleGoButton: () => void
  handleGoLeft: () => void
  handleGoRight: () => void
  uploadInProgress: boolean
  getCurrentViewTarget: () => ViewTarget
  viewTargetHasChange: boolean
  canGoLeft: boolean
  canGoRight: boolean
  handleInputChange?: (event: KeyboardEvent<HTMLFormElement>) => void
}

function DataPositionFormRow({
  handleGoButton,
  handleGoLeft,
  handleGoRight,
  uploadInProgress,
  getCurrentViewTarget,
  viewTargetHasChange,
  canGoLeft,
  canGoRight,
  handleInputChange,
}: DataPositionFormRowProps) {
  const onKeyUp = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleInputChange?.(event)
      handleGoButton()
    }
  }

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
      <HelpButton file="./help/help.md" />
      <Button
        color={viewTargetHasChange ? 'alert' : 'primary'}
        title={
          viewTargetHasChange
            ? 'Click to apply pending changes.'
            : 'No changes to apply; view is up to date.'
        }
        id="goButton"
        onClick={() => handleGoButton()}
        disabled={uploadInProgress}
      >
        Go
      </Button>
      <Button
        color="primary"
        id="goLeftButton"
        onClick={() => handleGoLeft()}
        disabled={uploadInProgress || !canGoLeft}
      >
        <FontAwesomeIcon icon={faStepBackward} size="lg" />
      </Button>
      <Button
        color="primary"
        id="zoomInButton"
        onClick={() => tubeMap.zoomBy(ZOOM_FACTOR)}
      >
        <FontAwesomeIcon icon={faSearchPlus} size="lg" />
      </Button>
      <Button
        color="primary"
        id="zoomOutButton"
        onClick={() => tubeMap.zoomBy(1.0 / ZOOM_FACTOR)}
      >
        <FontAwesomeIcon icon={faSearchMinus} size="lg" />
      </Button>
      <Button
        color="primary"
        id="goRightButton"
        onClick={() => handleGoRight()}
        disabled={uploadInProgress || !canGoRight}
      >
        <FontAwesomeIcon icon={faStepForward} size="lg" />
      </Button>
      <Button
        color="secondary"
        id="downloadButton"
        onClick={() => handleDownloadButton()}
      >
        Download Image
      </Button>
      <CopyLink getCurrentViewTarget={getCurrentViewTarget} />
      {uploadInProgress && (
        <div className="spinner-grow upload-in-progress" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      )}
    </Form>
  )
}

export default DataPositionFormRow
