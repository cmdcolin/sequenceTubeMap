import React from 'react'

const PANEL_STYLE = {
  padding: '8px 12px',
  border: '1px solid',
  borderRadius: '4px',
  margin: '8px 0',
  fontSize: '14px',
}

const HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '6px',
}

const CHIP_LIST_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
}

const CHIP_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: 'white',
  border: '1px solid currentColor',
  borderRadius: '12px',
  padding: '2px 4px 2px 10px',
  fontSize: '13px',
}

const CHIP_REMOVE_STYLE = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: '1',
  padding: '0 4px',
  color: '#666',
}

const VARIANT_STYLE = {
  read: { background: '#e7f3ff', borderColor: '#bcdcff' },
  node: { background: '#e3f9e5', borderColor: '#a3e0a8' },
  filter: { background: '#fff3cd', borderColor: '#ffeeba' },
}

const PendingPanel = ({
  variant,
  title,
  titleHint,
  items,
  onRemove,
  actions,
}) => (
  <div style={{ ...PANEL_STYLE, ...VARIANT_STYLE[variant] }}>
    <div style={HEADER_STYLE}>
      <span title={titleHint}>{title}</span>
      {actions.map((action, idx) => (
        <button
          key={idx}
          type="button"
          title={action.hint}
          onClick={() => action.onClick()}
        >
          {action.label}
        </button>
      ))}
    </div>
    <div style={CHIP_LIST_STYLE}>
      {items.map(name => (
        <span key={name} style={CHIP_STYLE}>
          {name}
          {onRemove ? (
            <button
              type="button"
              style={CHIP_REMOVE_STYLE}
              onClick={() => onRemove(name)}
              aria-label={`Remove ${name}`}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
    </div>
  </div>
)

export default PendingPanel
