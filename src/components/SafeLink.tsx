// React Router-compatible Link that falls back to a plain <a> outside a Router.

import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Link, useInRouterContext, type LinkProps } from 'react-router-dom'

type SafeLinkProps = Omit<LinkProps, 'to' | 'children'> &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: LinkProps['to']
    href?: string
    children?: ReactNode
  }

export const SafeLink = ({ children, to, href, ...rest }: SafeLinkProps) => {
  return useInRouterContext() ? (
    <Link to={to ?? href ?? ''} {...rest}>
      {children}
    </Link>
  ) : (
    <a href={href ?? (typeof to === 'string' ? to : undefined)} {...rest}>
      {children}
    </a>
  )
}

export default SafeLink
