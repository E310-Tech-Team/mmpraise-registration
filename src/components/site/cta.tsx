import Link from 'next/link'
import { HandHeart, Ticket } from 'lucide-react'
import { buttonClass } from '@/components/ui/primitives'
import { links } from '@/config/site'
import { cn } from '@/lib/utils'

/**
 * The two headline calls to action, and the order they appear in.
 *
 * Recruiting volunteers is the product's primary conversion goal, so
 * **Volunteer is always the filled button and always comes first**; registering
 * to attend is always the outline beside it. Encoding that here rather than at
 * each call site is the point — hierarchy chosen page by page drifts, and the
 * site ends up arguing with itself about what it wants people to do.
 *
 * `onDark` switches the secondary treatment for placement over a photograph or
 * a night panel. The primary is identical on both, because a filled orange
 * button is legible on either.
 */

type CtaSize = 'md' | 'lg'

export function VolunteerCta({
  size = 'lg',
  className,
  label = 'Volunteer',
  ...props
}: {
  size?: CtaSize
  className?: string
  label?: string
}) {
  return (
    <Link href={links.volunteer} className={buttonClass({ size, className })} {...props}>
      <HandHeart aria-hidden className="size-4" />
      {label}
    </Link>
  )
}

export function RegisterCta({
  size = 'lg',
  className,
  label = 'Register to attend',
  onDark = false,
  ...props
}: {
  size?: CtaSize
  className?: string
  label?: string
  onDark?: boolean
}) {
  return (
    <Link
      href={links.register}
      className={buttonClass({ variant: onDark ? 'outlineOnDark' : 'outline', size, className })}
      {...props}
    >
      <Ticket aria-hidden className="size-4" />
      {label}
    </Link>
  )
}

/**
 * Both actions in their settled order.
 *
 * Stacks on small screens with the primary on top, so the most important action
 * is the one under the thumb rather than the one that happens to come first in
 * the markup.
 */
export function CtaPair({
  onDark = false,
  size = 'lg',
  align = 'start',
  className,
  volunteerLabel,
  registerLabel,
  showRegister = false,
  itemProps,
}: {
  onDark?: boolean
  size?: CtaSize
  align?: 'start' | 'center'
  className?: string
  volunteerLabel?: string
  registerLabel?: string
  showRegister?: boolean
  /** Applied to each button — used by the hero timeline to target them. */
  itemProps?: Record<string, string>
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row',
        align === 'center' && 'sm:justify-center',
        className,
      )}
    >
      <VolunteerCta size={size} label={volunteerLabel} {...itemProps} />
      {showRegister && <RegisterCta size={size} onDark={onDark} label={registerLabel} {...itemProps} />}
    </div>
  )
}
