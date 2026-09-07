import { useState } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import type { VisOptionFlag, VisOptions } from '../Types.ts'
import { AppBarMenu } from './AppBarMenu.tsx'
import { CheckboxMenuItem } from './CheckboxMenuItem.tsx'
import { HelpIcon } from './HelpIcon.tsx'
import PopupDialog from './PopupDialog.tsx'
import TrackVisibilityPanel from './TrackVisibilityPanel.tsx'

const MAPPING_QUALITY_VALUES = Array.from({ length: 61 }, (_, i) => i)

interface ViewMenuProps {
  legendVisible: boolean
  toggleLegend: () => void
  visOptions: VisOptions
  toggleVisOptionFlag: (flag: VisOptionFlag) => void
  handleMappingQualityCutoffChange: (value: number) => void
  compressedViewLocked?: boolean
}

export function ViewMenu({
  legendVisible,
  toggleLegend,
  visOptions,
  toggleVisOptionFlag,
  handleMappingQualityCutoffChange,
  compressedViewLocked,
}: ViewMenuProps) {
  const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false)
  const readsDisabled = !visOptions.showReads
  const perReadDisabled = readsDisabled || visOptions.coarsenedReadView
  return (
    <>
      <AppBarMenu label="View" testid="viewMenuButton" dense>
        {close => (
          <>
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
            <Divider />
            <ListSubheader>Reads</ListSubheader>
            <CheckboxMenuItem
              label="Show sequence reads"
              checked={visOptions.showReads}
              onToggle={() => { toggleVisOptionFlag('showReads'); }}
            />
            <CheckboxMenuItem
              label="Coarsened (Sankey) view"
              checked={visOptions.coarsenedReadView}
              disabled={readsDisabled}
              onToggle={() => { toggleVisOptionFlag('coarsenedReadView'); }}
              helpText="Aggregates reads into one thick band per node→node edge, with band thickness proportional to the number of reads traversing it. Trades per-read detail for the ability to browse much higher-coverage regions."
            />
            <CheckboxMenuItem
              label="Ignore strand"
              checked={visOptions.ignoreStrand}
              disabled={readsDisabled}
              onToggle={() => { toggleVisOptionFlag('ignoreStrand'); }}
              helpText="Treat forward and reverse strands as equivalent. Normal reads stop being colored by their auxPalette for reverse, and the Sankey view merges (+A→+B) with (-B→-A) into one band."
            />
            <CheckboxMenuItem
              label="Show soft clips"
              checked={visOptions.showSoftClips}
              disabled={perReadDisabled}
              onToggle={() => { toggleVisOptionFlag('showSoftClips'); }}
              helpText="Renders the soft-clipped portions of reads — bases that were not aligned to the reference — as colored extensions beyond the aligned segment."
            />
            <CheckboxMenuItem
              label="Color by mapping quality"
              checked={visOptions.colorReadsByMappingQuality}
              disabled={perReadDisabled}
              onToggle={() => { toggleVisOptionFlag('colorReadsByMappingQuality'); }}
              helpText="Colors each read by its mapping quality (MAPQ) score. Higher scores (more confident placements) appear darker; lower scores appear lighter."
            />
            <CheckboxMenuItem
              label="Transparency by mapping quality"
              checked={visOptions.alphaReadsByMappingQuality}
              disabled={perReadDisabled}
              onToggle={() => { toggleVisOptionFlag('alphaReadsByMappingQuality'); }}
              helpText="Makes reads with lower mapping quality more transparent, so high-confidence alignments stand out visually."
            />
            <Box
              sx={{ px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}
              // The enclosing Menu treats keystrokes as item navigation, which
              // would swallow the Select's own keyboard handling.
              onKeyDown={e => { e.stopPropagation(); }}
            >
              <Typography variant="body2" id="mappingQualityCutoffLabel">
                Mapping quality cutoff:
              </Typography>
              <HelpIcon
                label="Mapping quality cutoff"
                helpText="Hides reads whose mapping quality (MAPQ) score falls below this value (0–60). Higher values show only the most confidently placed reads."
              />
              <Select
                size="small"
                labelId="mappingQualityCutoffLabel"
                disabled={perReadDisabled}
                value={visOptions.mappingQualityCutoff}
                onChange={e => { handleMappingQualityCutoffChange(Number(e.target.value)); }}
              >
                {MAPPING_QUALITY_VALUES.map(value => (
                  <MenuItem value={value} key={value}>
                    {value}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Divider />
            <MenuItem
              dense
              data-testid="trackVisibilityMenuItem"
              onClick={() => {
                setVisibilityDialogOpen(true)
                close()
              }}
            >
              Track visibility…
            </MenuItem>
          </>
        )}
      </AppBarMenu>
      <PopupDialog
        open={visibilityDialogOpen}
        close={() => { setVisibilityDialogOpen(false); }}
        width={null}
        testID="TrackVisibility"
      >
        <TrackVisibilityPanel />
      </PopupDialog>
    </>
  )
}
