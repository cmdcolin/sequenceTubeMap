import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import type { ReadGroup } from './ReadGroupsPanel'

interface NodeContextMenuProps {
  nodeName: string
  readNames: string[]
  alreadyInNodeSet: boolean
  x: number
  y: number
  activeGroup?: ReadGroup | null
  onAddReadsToSet: (readNames: string[]) => void
  onAddReadsToActiveGroup: (readNames: string[]) => void
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
  onAddNodeToNodeSet,
  onClose,
}: NodeContextMenuProps) => {
  const count = readNames.length
  const items: ContextMenuItem[] = [
    {
      label:
        count === 0
          ? 'No reads through this node'
          : `Add ${count} read${count === 1 ? '' : 's'} through this node to read set`,
      disabled: count === 0,
      onClick: () => onAddReadsToSet(readNames),
    },
    {
      label: alreadyInNodeSet
        ? 'Already in node set'
        : 'Add this node to node set',
      disabled: alreadyInNodeSet,
      onClick: () => onAddNodeToNodeSet(nodeName),
    },
  ]
  if (activeGroup && count > 0) {
    items.push({
      label: `Add ${count} read${count === 1 ? '' : 's'} to "${activeGroup.name}"`,
      onClick: () => onAddReadsToActiveGroup(readNames),
    })
  }
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
