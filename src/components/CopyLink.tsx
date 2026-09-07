import { useState } from 'react'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import PopupDialog from './PopupDialog.tsx'
import { viewTargetToUrlParams } from '../urlViewTarget.ts'
import type { ViewTarget } from '../Types.ts'

interface CopyLinkProps {
  currentViewTarget: ViewTarget
}

export function CopyLink({ currentViewTarget }: CopyLinkProps) {
  // The link that was last copied, so the "Copied!" label resets by itself as
  // soon as the view target (and therefore the link) changes.
  const [copiedLink, setCopiedLink] = useState<string>()
  const [dialogLink, setDialogLink] = useState<string>()

  const url = new URL(window.location.toString())
  url.search = '?' + viewTargetToUrlParams(currentViewTarget)
  url.hash = ''
  const link = url.toString()

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedLink(link)
    } catch (e) {
      console.error('Could not write to the clipboard:', e)
      setCopiedLink(undefined)
      setDialogLink(link)
    }
  }

  return (
    <>
      <Button
        size="sm"
        id="copyLinkButton"
        color="primary"
        onClick={() => { void handleCopyLink(); }}
      >
        <FontAwesomeIcon icon={faLink} />
        {copiedLink === link ? ' Copied link!' : ' Copy link to data'}
      </Button>
      <PopupDialog open={dialogLink !== undefined} close={() => { setDialogLink(undefined); }}>
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
