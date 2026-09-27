import type { CSSProperties } from 'react'

export interface IconDefinition {
  width: number
  height: number
  path: string
}

interface IconProps {
  icon: IconDefinition
  size?: 'xs'
  style?: CSSProperties
  'data-testid'?: string
}

const baseStyle: CSSProperties = {
  boxSizing: 'content-box',
  display: 'inline-block',
  height: '1em',
  width: '1.25em',
  overflow: 'visible',
  verticalAlign: '-0.125em',
}

const xsStyle: CSSProperties = {
  fontSize: '0.75em',
  lineHeight: 'calc(1em / 12)',
  verticalAlign: 0,
}

export function Icon({ icon, size, style, 'data-testid': testid }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      data-testid={testid}
      style={{ ...baseStyle, ...(size === 'xs' ? xsStyle : {}), ...style }}
    >
      <path fill="currentColor" d={icon.path} />
    </svg>
  )
}
