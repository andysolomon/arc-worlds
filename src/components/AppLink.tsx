import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { navigate } from '../lib/navigation'

interface AppLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
  children: ReactNode
}

/** A real link for copy/new-tab behavior that becomes in-app navigation on an ordinary click. */
export function AppLink({ href, children, onClick, target, ...props }: AppLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== '_self')
    ) {
      return
    }
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin) return
    event.preventDefault()
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }

  return (
    <a href={href} target={target} onClick={handleClick} {...props}>
      {children}
    </a>
  )
}
