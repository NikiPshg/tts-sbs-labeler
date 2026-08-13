import type { AppUser } from '../types'

interface AvatarProps {
  user: AppUser
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({ user, size = 'md' }: AvatarProps) {
  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')

  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ '--avatar-color': user.color } as React.CSSProperties}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
