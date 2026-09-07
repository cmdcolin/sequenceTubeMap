import type { VisOptionFlag, VisOptions } from '../Types.ts'
import { AppBarMenu } from './AppBarMenu.tsx'
import { CheckboxMenuItem } from './CheckboxMenuItem.tsx'

interface ViewMenuProps {
  legendVisible: boolean
  toggleLegend: () => void
  visOptions: VisOptions
  toggleVisOptionFlag: (flag: VisOptionFlag) => void
  compressedViewLocked?: boolean
}

export function ViewMenu({
  legendVisible,
  toggleLegend,
  visOptions,
  toggleVisOptionFlag,
  compressedViewLocked,
}: ViewMenuProps) {
  return (
    <AppBarMenu label="View" testid="viewMenuButton" dense>
      {() => (
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
        </>
      )}
    </AppBarMenu>
  )
}
