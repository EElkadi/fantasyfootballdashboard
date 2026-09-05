'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun, Trophy } from 'lucide-react'

/** Always visible: the pages people open every week. */
const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/matchups', label: 'Matchups' },
  { href: '/standings', label: 'Standings' },
  { href: '/lineups', label: 'Lineups' },
  { href: '/rosters', label: 'Rosters' },
  { href: '/teams', label: 'Teams' },
  { href: '/draft', label: 'Draft' },
]

/** Under "More": the reference and season-long pages. */
const MORE = [
  { href: '/my-board', label: 'My Draft Board' },
  { href: '/waivers', label: 'Transactions' },
  { href: '/awards', label: 'Awards' },
  { href: '/predictions', label: 'Predictions' },
  { href: '/records', label: 'Records' },
  { href: '/rules', label: 'Rules' },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

function linkClass(isActive: boolean): string {
  return `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
  }`
}

export function SiteNav() {
  const pathname = usePathname()
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4">
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Trophy className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Premier League</span>
          <span className="sm:hidden">PLFF</span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(active(l.href))}>
              {l.label}
            </Link>
          ))}
        </nav>
        {/* Outside the scrolling <nav> so the menu can overlay the page; remounts
            closed on every navigation, so picking an item shuts it */}
        <details key={pathname} className="relative shrink-0">
          <summary
            className={`${linkClass(MORE.some((l) => active(l.href)))} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            More ▾
          </summary>
          <div className="absolute right-0 z-50 mt-1 min-w-[10rem] rounded-lg border bg-background p-1 shadow-lg">
            {MORE.map((l) => (
              <Link key={l.href} href={l.href} className={`block ${linkClass(active(l.href))}`}>
                {l.label}
              </Link>
            ))}
          </div>
        </details>
        <Link
          href="/commish"
          className={`hidden whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium sm:block ${
            active('/commish') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Commish
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
