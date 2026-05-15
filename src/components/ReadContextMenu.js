import ContextMenu from './ContextMenu'

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
}) => {
  const items = [
    {
      label: 'Show only this read',
      onClick: () => onFilter(readName),
    },
    {
      label: alreadyInSet ? 'Already in set' : 'Add to set',
      disabled: alreadyInSet,
      onClick: () => onAddToSet(readName),
    },
  ]
  if (activeGroup) {
    items.push({
      label: alreadyInActiveGroup
        ? `Already in "${activeGroup.name}"`
        : `Add to "${activeGroup.name}"`,
      disabled: alreadyInActiveGroup,
      onClick: () => onAddToActiveGroup(readName),
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
