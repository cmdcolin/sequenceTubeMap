import ContextMenu from "./ContextMenu";

const ReadContextMenu = ({
  readName,
  x,
  y,
  alreadyInSet,
  onFilter,
  onAddToSet,
  onClose,
}) => (
  <ContextMenu
    header={`Read: ${readName}`}
    x={x}
    y={y}
    onClose={onClose}
    items={[
      {
        label: "Show only this read",
        onClick: () => onFilter(readName),
      },
      {
        label: alreadyInSet ? "Already in filter set" : "Add to filter set",
        disabled: alreadyInSet,
        onClick: () => onAddToSet(readName),
      },
    ]}
  />
);


export default ReadContextMenu;
