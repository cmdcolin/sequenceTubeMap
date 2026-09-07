import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
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
  return (
    <AppBarMenu label="Examples" testid="examplesMenuButton">
      {close => (
        <>
          {visibleDataSources.map(ds => (
            <MenuItem
              key={ds.name}
              selected={dataType === dataTypes.BUILT_IN && name === ds.name}
              onClick={() => { onSelect(ds.name!); close(); }}
            >
              {ds.name}
            </MenuItem>
          ))}
          {discoveredDataSources.length > 0 && (
            <ListSubheader key="discoveredHeading">Discovered</ListSubheader>
          )}
          {discoveredDataSources.map(ds => (
            <MenuItem
              key={ds.name}
              selected={dataType === dataTypes.BUILT_IN && name === ds.name}
              onClick={() => { onSelect(ds.name!); close(); }}
            >
              {ds.name}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem
            selected={dataType === dataTypes.EXAMPLES}
            onClick={() => { onSelect(dataTypes.EXAMPLES); close(); }}
          >
            Synthetic examples
          </MenuItem>
        </>
      )}
    </AppBarMenu>
  )
}
