/// SafeLink.tsx: React Router-compatible Link component that doesn't explode if
/// not used inside a React Router.

import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Link, useInRouterContext, type LinkProps } from 'react-router-dom'

type SafeLinkProps = Omit<LinkProps, 'to' | 'children'> &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: LinkProps['to']
    href?: string
    children?: ReactNode
  }

export const SafeLink = ({ children, ...props }: SafeLinkProps) => {
  // Find out if we are in a router
  const insideRouter = useInRouterContext()
  if (insideRouter) {
    // We can use Link
    const { href: _href, to, ...linkProps } = props
    return (
      <Link to={to ?? props.href ?? ''} {...linkProps}>
        {children}
      </Link>
    )
  } else {
    // We can't use Link
    // Also try to fix to -> href
    const { to, href, ...otherProps } = props
    const fixedProps = { href: href || (typeof to === 'string' ? to : undefined), ...otherProps }
    return <a {...fixedProps}>{children}</a>
  }
}

export default SafeLink
