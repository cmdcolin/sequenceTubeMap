import { useState } from 'react'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import PopupDialog from './PopupDialog.tsx'
import { viewTargetToUrlParams } from '../urlViewTarget.ts'
import type { ViewTarget } from '../Types.ts'

const UNCLICKED_TEXT = ' Copy link to data'
const CLICKED_TEXT = ' Copied link!'

// uses Clipboard API to write text to clipboard
export const writeToClipboard = (text: string) => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  navigator.clipboard.writeText(text)
}

// For testing purposes
let copyCallback: (text: string) => void = writeToClipboard

// sets value of copyCallback
export const setCopyCallback = (callback: (text: string) => void) =>
  (copyCallback = callback)

interface CopyLinkProps {
  currentViewTarget: ViewTarget
}

export function CopyLink({ currentViewTarget }: CopyLinkProps) {
  // Button to copy a link with viewTarget to the data selected
  const [text, setText] = useState(UNCLICKED_TEXT)
  const [dialogLink, setDialogLink] = useState<string>()

  const handleCopyLink = () => {
    const url = new URL(window.location.toString())
    url.search = '?' + viewTargetToUrlParams(currentViewTarget)
    url.hash = ''

    try {
      copyCallback(url.toString())
      setText(CLICKED_TEXT)
    } catch {
      setText(UNCLICKED_TEXT)
      setDialogLink(url.toString())
    }
  }

  return (
    <>
      <Button id="copyLinkButton" color="primary" onClick={() => { handleCopyLink(); }}>
        <FontAwesomeIcon icon={faLink} size="lg" />
        {text}
      </Button>
      <PopupDialog open={dialogLink != null} close={() => { setDialogLink(undefined); }}>
        <h5>Link to Data</h5>
        <p>
          <a href={dialogLink} target="_blank" rel="noopener noreferrer">
            Data
          </a>
          <br />
          Click this link to return to this view. Right click link to copy this
          view location.
        </p>
      </PopupDialog>
    </>
  )
}
