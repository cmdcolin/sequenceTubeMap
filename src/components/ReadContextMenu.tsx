import ContextMenu, { type ContextMenuItem } from './ContextMenu.tsx'
import type { ReadGroup } from './ReadGroupsPanel.tsx'

interface ReadContextMenuProps {
  readName: string
  x: number
  y: number
  alreadyInSet: boolean
  activeGroup?: ReadGroup | null
  alreadyInActiveGroup: boolean
  onFilter: (readName: string) => void
  onAddToSet: (readName: string) => void
  onAddToActiveGroup: (readName: string) => void
  onClose: () => void
}

const ReadContextMenu = ({
  readName,
  x,
  y,
  alreadyInSet,
  activeGroup,
  alreadyInActiveGroup,
  onFilter,
  onAddToSet,
  onAddToActiveGroup,
  onClose,
}: ReadContextMenuProps) => {
  const items: ContextMenuItem[] = [
    {
      label: 'Show only this read',
      onClick: () => { onFilter(readName); },
    },
    {
      label: alreadyInSet ? 'Already in set' : 'Add to set',
      disabled: alreadyInSet,
      onClick: () => { onAddToSet(readName); },
    },
  ]
  if (activeGroup) {
    items.push({
      label: alreadyInActiveGroup
        ? `Already in "${activeGroup.name}"`
        : `Add to "${activeGroup.name}"`,
      disabled: alreadyInActiveGroup,
      onClick: () => { onAddToActiveGroup(readName); },
    })
  }
  return (
    <ContextMenu
      header={`Read: ${readName}`}
      x={x}
      y={y}
      onClose={onClose}
      items={items}
    />
  )
}

export default ReadContextMenu
