import type { AnchorHTMLAttributes, ReactNode } from 'react'

type SafeLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string
  children?: ReactNode
}

export const SafeLink = ({ children, href, ...rest }: SafeLinkProps) => (
  <a href={href} {...rest}>
    {children}
  </a>
)

export default SafeLink
