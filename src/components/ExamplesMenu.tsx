import MuiButton from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
import type { ViewTarget } from '../Types.ts'
import { dataTypes } from './headerFormUtils.ts'

interface ExamplesMenuProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  onOpen: (el: HTMLElement) => void
  visibleDataSources: ViewTarget[]
  discoveredDataSources: ViewTarget[]
  dataType: string
  name: string | undefined
  onSelect: (name: string) => void
}

export function ExamplesMenu({
  anchorEl,
  open,
  onClose,
  onOpen,
  visibleDataSources,
  discoveredDataSources,
  dataType,
  name,
  onSelect,
}: ExamplesMenuProps) {
  return (
    <>
      <MuiButton
        color="inherit"
        data-testid="examplesMenuButton"
        onClick={(e) => { onOpen(e.currentTarget); }}
      >
        Examples
      </MuiButton>
      <Menu anchorEl={anchorEl} open={open} onClose={() => { onClose(); }}>
        {visibleDataSources.map(ds => (
          <MenuItem
            key={ds.name}
            selected={dataType === dataTypes.BUILT_IN && name === ds.name}
            onClick={() => { onSelect(ds.name!); onClose(); }}
          >
            {ds.name}
          </MenuItem>
        ))}
        {discoveredDataSources.length > 0 && (
          <>
            <ListSubheader>Discovered</ListSubheader>
            {discoveredDataSources.map(ds => (
              <MenuItem
                key={ds.name}
                selected={dataType === dataTypes.BUILT_IN && name === ds.name}
                onClick={() => { onSelect(ds.name!); onClose(); }}
              >
                {ds.name}
              </MenuItem>
            ))}
          </>
        )}
        <Divider />
        <MenuItem
          selected={dataType === dataTypes.EXAMPLES}
          onClick={() => { onSelect(dataTypes.EXAMPLES); onClose(); }}
        >
          Synthetic examples
        </MenuItem>
      </Menu>
    </>
  )
}
