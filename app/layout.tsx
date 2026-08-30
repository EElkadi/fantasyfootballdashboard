import '@/app/globals.css'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/ui/theme-provider'
import { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SiteNav } from '@/components/league/SiteNav'
import { LEAGUE } from '@/lib/league'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: LEAGUE.name,
    template: `%s · ${LEAGUE.name}`,
  },
  description: 'Standings, matchups, records and rules for the Premier League Fantasy Football league — since 2015.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1a' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="flex min-h-screen flex-col">
            <SiteNav />
            <main className="flex-1">{children}</main>
            <footer className="border-t py-6">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-xs text-muted-foreground">
                <span>
                  {LEAGUE.name} · since {LEAGUE.since}
                </span>
                <span>
                  ${LEAGUE.payouts.reduce((s, p) => s + p.amount, 0).toLocaleString()} on the line · winner takes $
                  {LEAGUE.payouts[0].amount.toLocaleString()}
                </span>
              </div>
            </footer>
          </div>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
