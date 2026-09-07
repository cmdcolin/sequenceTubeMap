import { useState } from 'react'
import Button from '@mui/material/Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import PopupDialog from './PopupDialog.tsx'

export function CopyLink() {
  // The link that was last copied, so the "Copied!" label resets by itself as
  // soon as the view (and therefore the link) changes.
  const [copiedLink, setCopiedLink] = useState<string>()
  const [dialogLink, setDialogLink] = useState<string>()

  // App rewrites the query on every commit, so the current URL already
  // describes the view on screen.
  const link = window.location.href

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
        size="small"
        variant="contained"
        id="copyLinkButton"
        startIcon={<FontAwesomeIcon icon={faLink} />}
        onClick={() => { void handleCopyLink(); }}
      >
        {copiedLink === link ? 'Copied link!' : 'Copy link to data'}
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
