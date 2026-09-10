import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
import { isLocalCompatibleDataSource } from '../common.ts'
import type { ViewTarget } from '../Types.ts'
import { AppBarMenu } from './AppBarMenu.tsx'
import { dataTypes } from './headerFormUtils.ts'

interface ExamplesMenuProps {
  visibleDataSources: ViewTarget[]
  discoveredDataSources: ViewTarget[]
  dataType: string
  name: string | undefined
  onSelect: (name: string) => void
}

export function ExamplesMenu({
  visibleDataSources,
  discoveredDataSources,
  dataType,
  name,
  onSelect,
}: ExamplesMenuProps) {
  // Which backend an example needs is the first thing about it a reader wants,
  // and the name alone cannot say it, so the menu groups by that: a `.gbz.db`
  // example is read in the browser, anything else is chunked by a vg server.
  // Each group that has entries is labelled, including when it is the only
  // one — in local mode HeaderForm has filtered the server examples out, and
  // the heading is then what says why the list is short.
  const inBrowser = visibleDataSources.filter(isLocalCompatibleDataSource)
  const serverOnly = visibleDataSources.filter(
    ds => !isLocalCompatibleDataSource(ds),
  )

  return (
    <AppBarMenu label="Examples" testid="examplesMenuButton">
      {close => {
        const item = (ds: ViewTarget) => (
          <MenuItem
            key={ds.name}
            selected={dataType === dataTypes.BUILT_IN && name === ds.name}
            onClick={() => { onSelect(ds.name!); close(); }}
          >
            {ds.name}
          </MenuItem>
        )
        return (
          <>
            {inBrowser.length > 0 && (
              <ListSubheader key="inBrowserHeading">
                In-browser (gbz-base .gbz.db)
              </ListSubheader>
            )}
            {inBrowser.map(item)}
            {serverOnly.length > 0 && (
              <ListSubheader key="serverHeading">
                Needs a vg server (.xg, .vg, .gbz)
              </ListSubheader>
            )}
            {serverOnly.map(item)}
            {discoveredDataSources.length > 0 && (
              <ListSubheader key="discoveredHeading">Discovered</ListSubheader>
            )}
            {discoveredDataSources.map(item)}
            <Divider />
            <MenuItem
              selected={dataType === dataTypes.EXAMPLES}
              onClick={() => { onSelect(dataTypes.EXAMPLES); close(); }}
            >
              Synthetic examples
            </MenuItem>
          </>
        )
      }}
    </AppBarMenu>
  )
}
