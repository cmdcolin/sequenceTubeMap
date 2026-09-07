import { useState } from 'react'
import Button from '@mui/material/Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import PopupDialog from './PopupDialog.tsx'
import type { ViewTarget } from '../Types.ts'

interface CopyLinkProps {
  // Only used as the identity of the view that was copied: App hands out a
  // new object per commit, so the "Copied!" label resets by itself as soon as
  // the view (and therefore the link) changes.
  currentViewTarget: ViewTarget
}

export function CopyLink({ currentViewTarget }: CopyLinkProps) {
  const [copiedTarget, setCopiedTarget] = useState<ViewTarget>()
  const [dialogLink, setDialogLink] = useState<string>()

  const handleCopyLink = async () => {
    // App rewrites the query for the committed view, so the address bar
    // already describes what is on screen. Read it at click time: the effect
    // that writes it runs after the render that produced this button.
    const link = window.location.href
    try {
      await navigator.clipboard.writeText(link)
      setCopiedTarget(currentViewTarget)
    } catch (e) {
      console.error('Could not write to the clipboard:', e)
      setCopiedTarget(undefined)
      setDialogLink(link)
    }
  }

  return (
    <>
      <Button
        size="small"
        variant="contained"
        id="copyLinkButton"
        startIcon={<FontAwesomeIcon icon={faLink} />}
        onClick={() => { void handleCopyLink(); }}
      >
        {copiedTarget === currentViewTarget
          ? 'Copied link!'
          : 'Copy link to data'}
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
