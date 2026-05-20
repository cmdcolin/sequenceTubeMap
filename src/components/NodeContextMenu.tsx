import ContextMenu, { type ContextMenuItem } from './ContextMenu.tsx'
import type { ReadGroup } from './ReadGroupsPanel.tsx'

interface NodeContextMenuProps {
  nodeName: string
  readNames: string[]
  alreadyInNodeSet: boolean
  x: number
  y: number
  activeGroup?: ReadGroup | null
  onAddReadsToSet: (readNames: string[]) => void
  onAddReadsToActiveGroup: (readNames: string[]) => void
  onAddReadsAsNewGroup: (readNames: string[]) => void
  onAddNodeToNodeSet: (nodeName: string) => void
  onClose: () => void
}

const NodeContextMenu = ({
  nodeName,
  readNames,
  alreadyInNodeSet,
  x,
  y,
  activeGroup,
  onAddReadsToSet,
  onAddReadsToActiveGroup,
  onAddReadsAsNewGroup,
  onAddNodeToNodeSet,
  onClose,
}: NodeContextMenuProps) => {
  const count = readNames.length
  const s = count === 1 ? '' : 's'
  const items: ContextMenuItem[] = [
    {
      label:
        count === 0
          ? 'No reads through this node'
          : `Add ${count} read${s} through this node to read set`,
      disabled: count === 0,
      onClick: () => { onAddReadsToSet(readNames); },
    },
    ...(count > 0
      ? [
          ...(activeGroup
            ? [
                {
                  label: `Add ${count} read${s} to "${activeGroup.name}"`,
                  onClick: () => { onAddReadsToActiveGroup(readNames); },
                },
              ]
            : []),
          {
            label: `Add ${count} read${s} as new group`,
            onClick: () => { onAddReadsAsNewGroup(readNames); },
          },
        ]
      : []),
    {
      label: alreadyInNodeSet
        ? 'Already in node set'
        : 'Add this node to node set',
      disabled: alreadyInNodeSet,
      onClick: () => { onAddNodeToNodeSet(nodeName); },
    },
  ]
  return (
    <ContextMenu
      header={`Node: ${nodeName}`}
      x={x}
      y={y}
      onClose={onClose}
      items={items}
    />
  )
}

export default NodeContextMenu
