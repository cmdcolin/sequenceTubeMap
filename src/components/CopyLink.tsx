import { useState } from 'react'
import { Button } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import * as qs from 'qs'
import PopupDialog from './PopupDialog.tsx'
import type { Track, ViewTarget } from '../Types.ts'

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
  getCurrentViewTarget: () => ViewTarget
}

export function CopyLink(props: CopyLinkProps) {
  // Button to copy a link with viewTarget to the data selected
  const [text, setText] = useState(UNCLICKED_TEXT)
  const [dialogLink, setDialogLink] = useState<string>()

  const handleCopyLink = () => {
    // qs encodeValuesOnly=true keeps keys readable (see https://github.com/ljharb/qs#stringifying)
    const params = qs.stringify(props.getCurrentViewTarget(), {
      encodeValuesOnly: true,
    })
    const url = new URL(window.location.toString())
    url.search = '?' + params
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

// Parse a ViewTarget from the URL's query params. Returns null if no query.
// qs can't tell true/false from "true"/"false", so boolean flags are coerced.
// qs parses array-style params (tracks[0][...]=...) as { '0': ..., '1': ... },
// so we convert the tracks object to an array.
export const urlParamsToViewTarget = (
  url: string | Location,
): ViewTarget | null => {
  const parsed = new URL(url.toString())
  if (!parsed.search) {
    return null
  }
  const result = qs.parse(parsed.search.slice(1)) as Record<string, unknown>
  if (result.tracks === undefined || result.region === undefined) {
    // The query carries something other than a saved view (e.g. analytics
    // params). Don't fabricate a partial ViewTarget — callers default-fill.
    return null
  }
  for (const flag of ['simplify', 'removeSequences']) {
    if (result[flag] === 'true') result[flag] = true
    else if (result[flag] === 'false') result[flag] = false
  }
  const rawTracks = result.tracks
  if (rawTracks !== null && typeof rawTracks === 'object' && !Array.isArray(rawTracks)) {
    const tracksRecord = rawTracks as Record<string, unknown>
    result.tracks = Object.keys(tracksRecord)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => tracksRecord[k] as Track)
  }
  return result as unknown as ViewTarget
}
