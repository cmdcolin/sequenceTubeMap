import MuiButton from '@mui/material/Button'
import Box from '@mui/material/Box'
import Menu from '@mui/material/Menu'
import Typography from '@mui/material/Typography'
import type { VisOptions } from '../Types.ts'
import { CheckboxMenuItem } from './CheckboxMenuItem.tsx'
import { HelpIcon } from './HelpIcon.tsx'

interface ReadsMenuProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
  onOpen: (el: HTMLElement) => void
  visOptions: VisOptions
  toggleVisOptionFlag: (flag: string) => void
  handleMappingQualityCutoffChange?: (value: string | number) => void
}

export function ReadsMenu({
  anchorEl,
  open,
  onClose,
  onOpen,
  visOptions,
  toggleVisOptionFlag,
  handleMappingQualityCutoffChange,
}: ReadsMenuProps) {
  return (
    <>
      <MuiButton
        color="inherit"
        data-testid="readsMenuButton"
        onClick={(e) => { onOpen(e.currentTarget); }}
      >
        Reads
      </MuiButton>
      <Menu anchorEl={anchorEl} open={open} onClose={() => { onClose(); }} slotProps={{ list: { dense: true } }}>
        <CheckboxMenuItem
          label="Show sequence reads"
          checked={visOptions.showReads}
          onToggle={() => { toggleVisOptionFlag('showReads'); }}
        />
        <CheckboxMenuItem
          label="Coarsened (Sankey) view"
          checked={visOptions.coarsenedReadView}
          disabled={!visOptions.showReads}
          onToggle={() => { toggleVisOptionFlag('coarsenedReadView'); }}
          helpText="Aggregates reads into one thick band per node→node edge, with band thickness proportional to the number of reads traversing it. Trades per-read detail for the ability to browse much higher-coverage regions."
        />
        <CheckboxMenuItem
          label="Ignore strand"
          checked={visOptions.ignoreStrand}
          disabled={!visOptions.showReads}
          onToggle={() => { toggleVisOptionFlag('ignoreStrand'); }}
          helpText="Treat forward and reverse strands as equivalent. Normal reads stop being colored by their auxPalette for reverse, and the Sankey view merges (+A→+B) with (-B→-A) into one band."
        />
        <CheckboxMenuItem
          label="Show soft clips"
          checked={visOptions.showSoftClips}
          disabled={!visOptions.showReads || visOptions.coarsenedReadView}
          onToggle={() => { toggleVisOptionFlag('showSoftClips'); }}
          helpText="Renders the soft-clipped portions of reads — bases that were not aligned to the reference — as colored extensions beyond the aligned segment."
        />
        <CheckboxMenuItem
          label="Color by mapping quality"
          checked={visOptions.colorReadsByMappingQuality}
          disabled={!visOptions.showReads || visOptions.coarsenedReadView}
          onToggle={() => { toggleVisOptionFlag('colorReadsByMappingQuality'); }}
          helpText="Colors each read by its mapping quality (MAPQ) score. Higher scores (more confident placements) appear darker; lower scores appear lighter."
        />
        <CheckboxMenuItem
          label="Transparency by mapping quality"
          checked={visOptions.alphaReadsByMappingQuality}
          disabled={!visOptions.showReads || visOptions.coarsenedReadView}
          onToggle={() => { toggleVisOptionFlag('alphaReadsByMappingQuality'); }}
          helpText="Makes reads with lower mapping quality more transparent, so high-confidence alignments stand out visually."
        />
        {handleMappingQualityCutoffChange && (
          <Box
            sx={{ px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <Typography variant="body2">Mapping quality cutoff:</Typography>
            <HelpIcon
              label="Mapping quality cutoff"
              helpText="Hides reads whose mapping quality (MAPQ) score falls below this value (0–60). Higher values show only the most confidently placed reads."
            />
            <select
              disabled={!visOptions.showReads || visOptions.coarsenedReadView}
              value={visOptions.mappingQualityCutoff}
              onChange={(e) => { handleMappingQualityCutoffChange(e.target.value); }}
            >
              {Array.from({ length: 61 }, (_, i) => (
                <option value={i} key={i}>{i}</option>
              ))}
            </select>
          </Box>
        )}
      </Menu>
    </>
  )
}
