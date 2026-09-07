import { getDataHealth } from '@/lib/data'

/**
 * Shown only while this server is falling back because the live sheet
 * couldn't be read. Silence is the normal state; a blank page never is.
 */
export function DataHealthNotice() {
  const h = getDataHealth()
  if (!h.degraded) return null
  const when = h.failedAt
    ? new Date(h.failedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    : ''
  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-800 dark:text-amber-300">
      Live sheet unreachable{when ? ` since ${when}` : ''} — showing{' '}
      {h.serving === 'last-good' ? 'the last good copy' : 'archived data'}. It retries automatically.
    </div>
  )
}
