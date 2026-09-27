import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import type { ViewTarget } from '../Types.ts'
import { bandageJsUrl } from '../util/bandageJs.ts'

export function OpenInBandageJsMenuItem({
  viewTarget,
  trackFileBaseURI,
  close,
}: {
  viewTarget: ViewTarget | undefined
  trackFileBaseURI: string | undefined
  close: () => void
}) {
  const url =
    viewTarget === undefined
      ? undefined
      : bandageJsUrl(viewTarget, trackFileBaseURI)
  return (
    <MenuItem
      dense
      component="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      disabled={url === undefined}
      onClick={close}
      data-testid="openInBandageJsMenuItem"
    >
      <ListItemText
        primary="Open in BandageJS"
        secondary={
          url === undefined ? 'Needs a hosted .gbz.db graph' : undefined
        }
      />
    </MenuItem>
  )
}
