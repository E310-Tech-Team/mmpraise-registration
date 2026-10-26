'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/primitives'

/**
 * Recompute the page's figures on demand. The overview renders fresh on every
 * request already; this exists so "are these numbers current?" has a one-click
 * answer instead of a browser-reload superstition. No auto-polling — an
 * operational dashboard left open on a wall should not hammer the database.
 */
export function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      isLoading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {!pending && <RefreshCw aria-hidden className="size-4" />}
      Refresh
    </Button>
  )
}
