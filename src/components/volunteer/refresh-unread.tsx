'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refresh once after a message is opened for the first time.
 *
 * The header and the page render in parallel, so the header's unread badge was
 * counted before the page marked this message read. One refresh re-renders the
 * header with the true count; it does nothing on later visits.
 */
export function RefreshUnread() {
  const router = useRouter()
  useEffect(() => {
    router.refresh()
  }, [router])
  return null
}
