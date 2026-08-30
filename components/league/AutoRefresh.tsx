'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Re-fetches server data on an interval — used to follow the draft live. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
