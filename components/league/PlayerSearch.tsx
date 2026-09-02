'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { PoolPlayer } from '@/lib/types'
import { ambiguousNames, formatPoolPlayer, playerKey, positionColor, searchPool } from '@/lib/players'

/**
 * Typeahead over the Player Pool. Picking a suggestion writes the canonical
 * "Name TEAM POS" form the sheet parsers read back; free text still works for
 * anyone the pool is missing. Enter with a highlighted suggestion picks it,
 * otherwise Enter is the caller's (e.g. "draft what's typed").
 */
export function PlayerSearch({
  pool,
  value,
  onChange,
  onEnter,
  taken,
  placeholder,
  autoFocus,
  className,
}: {
  pool: PoolPlayer[]
  value: string
  onChange: (text: string) => void
  onEnter?: () => void
  /** playerKey() -> who has them; shown greyed with the owner instead of hidden */
  taken?: Map<string, string>
  placeholder?: string
  autoFocus?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)

  const ambiguous = useMemo(() => ambiguousNames(pool), [pool])
  const suggestions = useMemo(() => (pool.length ? searchPool(pool, value, 8) : []), [pool, value])
  useEffect(() => setActive(0), [value])
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (p: PoolPlayer) => {
    onChange(formatPoolPlayer(p))
    setOpen(false)
  }
  const showing = open && suggestions.length > 0 && value.trim().length > 0

  return (
    <div ref={wrap} className={`relative ${className ?? ''}`}>
      <Input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (showing && e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, suggestions.length - 1))
          } else if (showing && e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Escape') {
            setOpen(false)
          } else if (e.key === 'Enter') {
            const chosen = showing ? suggestions[active] : undefined
            const owner = chosen ? taken?.get(playerKey(chosen, ambiguous)) : undefined
            if (chosen && !owner) {
              e.preventDefault()
              pick(chosen)
            } else if (!showing) {
              onEnter?.()
            }
          }
        }}
        role="combobox"
        aria-expanded={showing}
        aria-autocomplete="list"
      />
      {showing && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-background p-1 text-sm shadow-lg"
        >
          {suggestions.map((p, i) => {
            const owner = taken?.get(playerKey(p, ambiguous))
            return (
              <li
                key={`${p.player}-${p.rank}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!owner) pick(p)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                  owner ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                } ${i === active && !owner ? 'bg-secondary' : ''}`}
              >
                <span
                  className="w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: positionColor(p.position) }}
                >
                  {p.position ?? '—'}
                </span>
                <span className="flex-1 truncate font-medium">{p.player}</span>
                {p.nflTeam && <span className="text-xs text-muted-foreground">{p.nflTeam}</span>}
                <span className="tabular w-8 text-right text-xs text-muted-foreground">#{p.rank}</span>
                {owner && <span className="text-xs">→ {owner}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
