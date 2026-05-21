import MuiButton from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import type { VisOptions } from '../Types.ts'
import { CheckboxMenuItem } from './CheckboxMenuItem.tsx'

interface ViewMenuProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  onOpen: (el: HTMLElement) => void
  legendVisible: boolean
  toggleLegend: () => void
  visOptions: VisOptions
  toggleVisOptionFlag: (flag: string) => void
  compressedViewLocked?: boolean
}

export function ViewMenu({
  anchorEl,
  open,
  onClose,
  onOpen,
  legendVisible,
  toggleLegend,
  visOptions,
  toggleVisOptionFlag,
  compressedViewLocked,
}: ViewMenuProps) {
  return (
    <>
      <MuiButton
        color="inherit"
        data-testid="viewMenuButton"
        onClick={(e) => { onOpen(e.currentTarget); }}
      >
        View
      </MuiButton>
      <Menu anchorEl={anchorEl} open={open} onClose={() => { onClose(); }} slotProps={{ list: { dense: true } }}>
        <CheckboxMenuItem
          label="Show legend"
          checked={legendVisible}
          onToggle={() => { toggleLegend(); }}
          testid="legendToggleMenuItem"
        />
        <CheckboxMenuItem
          label="Merge node chains"
          checked={visOptions.removeRedundantNodes}
          onToggle={() => { toggleVisOptionFlag('removeRedundantNodes'); }}
          helpText="Merges consecutive nodes that only ever connect to each other with no branching, collapsing simple linear paths into single nodes for a cleaner layout."
        />
        <CheckboxMenuItem
          label="Compressed view"
          checked={visOptions.compressedView}
          disabled={compressedViewLocked}
          onToggle={() => { toggleVisOptionFlag('compressedView'); }}
          helpText="Uses a logarithmic scale for node width instead of a linear one, so very long nodes don't visually dominate short ones. Sequence bases are not rendered in this mode."
        />
        <CheckboxMenuItem
          label="Fully transparent nodes"
          checked={visOptions.transparentNodes}
          onToggle={() => { toggleVisOptionFlag('transparentNodes'); }}
          helpText="Makes graph nodes fully transparent so only the colored read paths passing through them are visible, giving an unobstructed view of alignment patterns."
        />
        <CheckboxMenuItem
          label="Show node labels"
          checked={visOptions.showNodeLabels}
          onToggle={() => { toggleVisOptionFlag('showNodeLabels'); }}
          helpText="Displays the numeric node ID on each graph node."
        />
      </Menu>
    </>
  )
}
