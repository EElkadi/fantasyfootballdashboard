'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { parseSubmission, decideWinner, ParsedLineup } from '@/lib/parser/parse'
import { ScheduleWeek, Slot, SLOTS, WaiverMove } from '@/lib/types'

interface Context {
  authed: boolean
  configured: boolean
  sheetConfigured: boolean
  season: number
  nextWeek: number
  teams: string[]
  rosters: Record<string, string[]>
  schedule: ScheduleWeek[]
  waivers: WaiverMove[]
}

interface EditablePlayer {
  slot: Slot
  name: string
  score: number
  issues: string[]
  confidence: number
}

interface EditableLineup {
  team: string
  players: EditablePlayer[]
  issues: string[]
  /** Point adjustment applied to the official total, e.g. -5 non-confirm penalty */
  penalty: number
}

interface EditableMatchup {
  id: number
  team1: EditableLineup
  team2: EditableLineup
  status: 'draft' | 'submitting' | 'done' | 'error'
  message?: string
}

function toEditable(l: ParsedLineup | undefined, fallbackTeam: string): EditableLineup {
  const players: EditablePlayer[] = SLOTS.map((slot) => {
    const p = l?.players.find((x) => x.slot === slot)
    return {
      slot,
      name: p?.name ?? '',
      score: p?.score ?? 0,
      issues: p?.issues ?? (p ? [] : ['Missing — fill in']),
      confidence: p?.confidence ?? 0,
    }
  })
  return { team: l?.team ?? fallbackTeam, players, issues: l?.issues ?? [], penalty: 0 }
}

export default function CommishPage() {
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [passcode, setPasscode] = useState('')
  const [loginError, setLoginError] = useState('')

  const [raw, setRaw] = useState('')
  const [week, setWeek] = useState<number>(1)
  const [matchups, setMatchups] = useState<EditableMatchup[]>([])
  const [parseIssues, setParseIssues] = useState<string[]>([])

  const loadContext = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/commish/context')
      const data = await res.json()
      setCtx(data)
      if (data.nextWeek) setWeek(data.nextWeek)
    } catch {
      setCtx(null)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    loadContext()
  }, [])

  const login = async () => {
    setLoginError('')
    const res = await fetch('/api/commish/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    })
    if (res.ok) {
      setPasscode('')
      await loadContext()
    } else {
      const data = await res.json().catch(() => ({}))
      setLoginError(data.error ?? 'Login failed')
    }
  }

  const doParse = () => {
    const result = parseSubmission(raw, { rosters: ctx?.rosters, week })
    if (result.week) setWeek(result.week)
    setParseIssues(result.issues)
    const ms: EditableMatchup[] = []
    for (let i = 0; i < result.lineups.length; i += 2) {
      ms.push({
        id: i,
        team1: toEditable(result.lineups[i], ''),
        team2: toEditable(result.lineups[i + 1], ''),
        status: 'draft',
      })
    }
    setMatchups(ms)
  }

  const expectedOpponent = (team: string): string | undefined => {
    const wk = ctx?.schedule.find((s) => s.week === week)
    return wk?.opponents[team]
  }

  const submit = async (m: EditableMatchup) => {
    setMatchups((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'submitting', message: undefined } : x)))
    const res = await fetch('/api/commish/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week,
        lineups: [m.team1, m.team2].map((l) => ({
          team: l.team,
          players: l.players.map((p) => ({ slot: p.slot, name: p.name, score: p.score })),
          penalty: l.penalty || 0,
        })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setMatchups((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? res.ok
            ? {
                ...x,
                status: 'done',
                message: `Saved — ${data.winner} beats ${data.loser} ${Math.max(data.total1, data.total2)}–${Math.min(data.total1, data.total2)}${data.tiebreaker ? ` (${data.tiebreaker} tiebreaker)` : ''}${data.warning ? ` ⚠ ${data.warning}` : ''}`,
              }
            : { ...x, status: 'error', message: data.error ?? 'Submit failed' }
          : x,
      ),
    )
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">Loading…</div>
  }

  if (!ctx?.authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Commissioner</CardTitle>
            <CardDescription>
              {ctx?.configured === false
                ? 'COMMISH_PASSCODE is not set on the server yet.'
                : 'Enter the commissioner passcode.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder="Passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
            />
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button className="w-full" onClick={login} disabled={!passcode}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Score Entry</h1>
          <p className="text-sm text-muted-foreground">
            Paste the WhatsApp score reports below — headers, typos and all. Review what the parser found, fix anything
            it flagged, then save each matchup straight to the Sheet.
          </p>
        </div>
        <a href="/commish/draft" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary">
          Draft night mode →
        </a>
      </div>

      {!ctx.sheetConfigured && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          The Google Sheet isn&apos;t connected (LEAGUE_SHEET_ID / service account env vars). Parsing works, but saving is
          disabled.
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium">Week</label>
            <Input
              type="number"
              min={1}
              max={18}
              value={week}
              onChange={(e) => setWeek(parseInt(e.target.value) || 1)}
              className="w-24"
            />
            {Object.keys(ctx.rosters).length === 0 && (
              <span className="text-xs text-muted-foreground">
                No Rosters tab found — name matching is off, so double-check spellings.
              </span>
            )}
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={'Week 3\nChuy vs Larry\nQB. Jordan Love: 18pts\nRB. Josh Jacobs: 4pts\n…'}
            className="h-64 w-full rounded-md border border-input bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-3">
            <Button onClick={doParse} disabled={!raw.trim()}>
              Parse scores
            </Button>
            {matchups.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Found {matchups.length} matchup{matchups.length === 1 ? '' : 's'} — review below
              </span>
            )}
          </div>
          {parseIssues.map((issue, i) => (
            <p key={i} className="text-sm text-amber-600 dark:text-amber-400">
              ⚠ {issue}
            </p>
          ))}
        </CardContent>
      </Card>

      {matchups.map((m) => (
        <MatchupEditor
          key={m.id}
          matchup={m}
          teams={ctx.teams}
          expectedOpponent={expectedOpponent}
          canSubmit={ctx.sheetConfigured}
          onChange={(updated) => setMatchups((prev) => prev.map((x) => (x.id === m.id ? updated : x)))}
          onSubmit={() => submit(m)}
        />
      ))}

      <LineupLogger ctx={ctx} defaultWeek={week} />
      <WaiverLogger ctx={ctx} defaultWeek={week} onLogged={loadContext} />
      <TradeLogger ctx={ctx} onLogged={loadContext} />
      {ctx.sheetConfigured && <SheetStatus />}
    </div>
  )
}

interface TabStatus {
  tab: string
  purpose: string
  rows: number
  parsed: number
  unit: string
  status: 'ok' | 'empty' | 'error'
  detail?: string
}

interface Diagnostics {
  configured: boolean
  sheetId: string
  currentSeason: number
  tabs: TabStatus[]
}

const STATUS_STYLE: Record<TabStatus['status'], string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  empty: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  error: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

/**
 * On-demand health check of the connected Sheet: which tabs the site can
 * read and what it managed to parse out of each. Costs one Sheets read per
 * tab, so it only runs when the button is pressed.
 */
function SheetStatus() {
  const [diag, setDiag] = useState<Diagnostics | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const check = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/commish/sheet-status')
      const data = await res.json().catch(() => ({}))
      if (res.ok) setDiag(data)
      else setError(data.error ?? 'Check failed')
    } catch {
      setError('Check failed — network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Sheet status</CardTitle>
        <CardDescription>
          Reads every tab the site depends on and reports what it could parse. Run this after renaming a tab or setting
          up a new season&apos;s workbook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={check} disabled={busy}>
            {busy ? 'Checking…' : 'Check sheet status'}
          </Button>
          {diag && (
            <span className="text-xs text-muted-foreground">
              Sheet {diag.sheetId} · season {diag.currentSeason}
            </span>
          )}
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {diag && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Tab</th>
                  <th className="py-2 pr-3 font-medium">Used for</th>
                  <th className="py-2 pr-3 text-right font-medium">Rows</th>
                  <th className="py-2 pr-3 text-right font-medium">Parsed</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {diag.tabs.map((t) => (
                  <tr key={t.tab} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-medium">{t.tab}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{t.purpose}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{t.rows}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {t.parsed} {t.unit}
                    </td>
                    <td className="py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}>
                        {t.status}
                      </span>
                      {t.detail && <p className="mt-1 max-w-md text-xs text-muted-foreground">{t.detail}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              An empty Scores, Waiver Wire or Trades tab is normal before the season starts. An empty Team by Team
              Schedule or Final Draft Board means the site is falling back to the committed {diag.currentSeason} files.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface LineupDraft {
  id: number
  team: string
  players: { slot: Slot; name: string; issues: string[] }[]
  issues: string[]
}

/**
 * Pre-deadline lineup entry. Managers post starters in the chat — often a
 * single Thursday player first, the rest Sunday morning — so this accepts any
 * subset of slots and only ever appends: the site shows the latest per slot.
 */
function LineupLogger({ ctx, defaultWeek }: { ctx: Context; defaultWeek: number }) {
  const [week, setWeek] = useState(defaultWeek)
  const [raw, setRaw] = useState('')
  const [drafts, setDrafts] = useState<LineupDraft[]>([])
  const [issues, setIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => setWeek(defaultWeek), [defaultWeek])

  const doParse = () => {
    setNote('')
    const result = parseSubmission(raw, { rosters: ctx.rosters, week, lineupOnly: true })
    // The pasted text's week wins, so neither week warning is worth showing
    if (result.week && result.week !== week) setWeek(result.week)
    setIssues(result.issues.filter((i) => !i.startsWith('No week number') && !i.startsWith('Text says week')))
    setDrafts(
      result.lineups.map((l, i) => ({
        id: i,
        team: l.team ?? '',
        players: l.players.map((p) => ({ slot: p.slot, name: p.name, issues: p.issues })),
        issues: l.issues,
      })),
    )
  }

  const update = (id: number, patch: Partial<LineupDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  const ready =
    drafts.length > 0 && drafts.every((d) => d.team && d.players.length > 0 && d.players.every((p) => p.name.trim()))

  const save = async () => {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/commish/lineups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, lineups: drafts.map((d) => ({ team: d.team, players: d.players })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const summary = Object.entries(data.saved ?? {})
          .map(([team, n]) => `${team} (${n})`)
          .join(', ')
        setNote(`Saved week ${data.week} lineups: ${summary}`)
        setDrafts([])
        setRaw('')
      } else {
        setNote(data.error ?? 'Failed to save lineups')
      }
    } catch {
      setNote('Network error — lineups were NOT saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Log lineups</CardTitle>
        <CardDescription>
          Paste starting-lineup posts (&quot;Elaf&quot; then &quot;QB: Josh Allen&quot;, one slot per line). Partial
          lineups are fine — a Thursday flex now, the rest Sunday — the site shows the latest per slot. Powers{' '}
          <a href="/lineups" className="underline">
            /lineups
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">Week</label>
          <Input
            type="number"
            min={1}
            max={18}
            value={week}
            onChange={(e) => setWeek(parseInt(e.target.value) || 1)}
            className="w-24"
          />
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'Elaf\nFlex: Josh Jacobs\n\nChuy\nQB: Jordan Love\nRB: Bijan Robinson\n…'}
          className="h-40 w-full rounded-md border border-input bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={doParse} disabled={!raw.trim()}>
            Parse lineups
          </Button>
          {drafts.length > 0 && (
            <Button onClick={save} disabled={!ready || busy || !ctx.sheetConfigured}>
              {busy ? 'Saving…' : `Save ${drafts.reduce((n, d) => n + d.players.length, 0)} slots`}
            </Button>
          )}
          {note && <span className="text-sm text-muted-foreground">{note}</span>}
        </div>
        {issues.map((i, k) => (
          <p key={k} className="text-sm text-amber-600 dark:text-amber-400">
            ⚠ {i}
          </p>
        ))}
        {drafts.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {drafts.map((d) => (
              <div key={d.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <select
                    value={d.team}
                    onChange={(e) => update(d.id, { team: e.target.value })}
                    className={`rounded-md border bg-background px-2 py-1 text-sm font-semibold ${
                      d.team ? 'border-input' : 'border-amber-500'
                    }`}
                  >
                    <option value="">Whose lineup?</option>
                    {ctx.teams.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-muted-foreground">
                    {d.players.length} of {SLOTS.length} slots
                  </span>
                </div>
                {d.players.map((p, i) => (
                  <div key={p.slot} className="flex items-center gap-2">
                    <span className="w-10 text-xs font-medium text-muted-foreground">{p.slot}</span>
                    <Input
                      value={p.name}
                      onChange={(e) =>
                        update(d.id, {
                          players: d.players.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                        })
                      }
                      className={`h-8 flex-1 ${p.issues.length ? 'border-amber-500' : ''}`}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${p.slot}`}
                      onClick={() => update(d.id, { players: d.players.filter((_, j) => j !== i) })}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {d.players.flatMap((p) => p.issues.map((i) => `${p.slot}: ${i}`)).map((i, k) => (
                  <p key={k} className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠ {i}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TradeLogger({ ctx, onLogged }: { ctx: Context; onLogged: () => void }) {
  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [gets1, setGets1] = useState('')
  const [gets2, setGets2] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  const toAssets = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)

  const submit = async () => {
    setBusy(true)
    setNote('')
    setWarnings([])
    try {
      const res = await fetch('/api/commish/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team1, team2, team1Gets: toAssets(gets1), team2Gets: toAssets(gets2) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setNote(`Logged: ${data.team1} ⇄ ${data.team2}. Rosters updated.`)
        setWarnings(data.warnings ?? [])
        setGets1('')
        setGets2('')
        onLogged()
      } else {
        setNote(data.error ?? 'Failed to log the trade')
      }
    } catch {
      setNote('Network error — the trade was NOT saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const teamPicker = (value: string, onChange: (v: string) => void, exclude: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-semibold"
    >
      <option value="">Pick team…</option>
      {ctx.teams
        .filter((t) => t !== exclude)
        .map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
    </select>
  )

  const ready = team1 && team2 && toAssets(gets1).length > 0 && toAssets(gets2).length > 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Log a trade</CardTitle>
        <CardDescription>
          One asset per line — players as &quot;Name TEAM (POS)&quot;, pick swaps as plain text (e.g. &quot;Round 2,
          Pick 19&quot;). Writes the Trades tab and moves the players between rosters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              [team1, setTeam1, team2, gets1, setGets1],
              [team2, setTeam2, team1, gets2, setGets2],
            ] as const
          ).map(([team, setTeam, other, gets, setGets], side) => (
            <div key={side} className="space-y-2">
              <div className="flex items-center gap-2">
                {teamPicker(team, setTeam, other)}
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  receives
                </span>
              </div>
              <textarea
                value={gets}
                onChange={(e) => setGets(e.target.value)}
                placeholder={side === 0 ? 'Zack Moss CIN (RB)' : 'Jordan Mason SFO (RB)'}
                className="h-24 w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={!ready || busy || !ctx.sheetConfigured}>
            {busy ? 'Saving…' : 'Log trade'}
          </Button>
          {note && <span className="text-sm text-muted-foreground">{note}</span>}
        </div>
        {warnings.map((w, i) => (
          <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ {w}
          </p>
        ))}
      </CardContent>
    </Card>
  )
}

function WaiverLogger({ ctx, defaultWeek, onLogged }: { ctx: Context; defaultWeek: number; onLogged: () => void }) {
  const [team, setTeam] = useState('')
  const [player, setPlayer] = useState('')
  const [week, setWeek] = useState(defaultWeek)
  const [cost, setCost] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  // Fees escalate per manager: $20 for their first add, $40 for the second…
  const suggestedCost = (t: string) => 20 * ((ctx.waivers?.filter((m) => m.team === t).length ?? 0) + 1)

  const submit = async () => {
    setBusy(true)
    setNote('')
    const res = await fetch('/api/commish/waiver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week, team, player, cost: cost === '' ? suggestedCost(team) : cost }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setNote(
        `Logged: ${data.team} adds ${data.player} for $${data.cost} (roster updated)${data.warning ? ` — ⚠ ${data.warning}` : ''}`,
      )
      setPlayer('')
      setCost('')
      onLogged()
    } else {
      setNote(data.error ?? 'Failed to log the move')
    }
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Log a waiver add</CardTitle>
        <CardDescription>
          Appends to the Waiver Wire tab — the fee lands in the pot. Fee auto-fills from that manager&apos;s add count
          ($20, $40, $60…).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Team</label>
            <select
              value={team}
              onChange={(e) => {
                setTeam(e.target.value)
                setCost('')
              }}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Pick…</option>
              {ctx.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Player</label>
            <Input value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Puka Nacua LAR (WR)" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Week</label>
            <Input type="number" min={1} max={18} value={week} onChange={(e) => setWeek(parseInt(e.target.value) || 1)} className="w-20" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Fee $</label>
            <Input
              type="number"
              min={0}
              step={20}
              value={cost}
              placeholder={team ? String(suggestedCost(team)) : '20'}
              onChange={(e) => setCost(e.target.value === '' ? '' : parseInt(e.target.value))}
              className="w-24"
            />
          </div>
          <Button onClick={submit} disabled={!team || !player.trim() || busy || !ctx.sheetConfigured}>
            {busy ? 'Saving…' : 'Log move'}
          </Button>
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

function MatchupEditor({
  matchup,
  teams,
  expectedOpponent,
  canSubmit,
  onChange,
  onSubmit,
}: {
  matchup: EditableMatchup
  teams: string[]
  expectedOpponent: (team: string) => string | undefined
  canSubmit: boolean
  onChange: (m: EditableMatchup) => void
  onSubmit: () => void
}) {
  const total = (l: EditableLineup) =>
    l.players.reduce((s, p) => s + (Number.isFinite(p.score) ? p.score : 0), 0) + (l.penalty || 0)
  const t1 = total(matchup.team1)
  const t2 = total(matchup.team2)

  const preview = useMemo(() => {
    if (!matchup.team1.team || !matchup.team2.team) return null
    const slotScore = (l: EditableLineup) => (slot: Slot) => l.players.find((p) => p.slot === slot)?.score ?? 0
    return decideWinner(
      { team: matchup.team1.team, total: t1, slotScore: slotScore(matchup.team1) },
      { team: matchup.team2.team, total: t2, slotScore: slotScore(matchup.team2) },
    )
  }, [matchup, t1, t2])

  const scheduleWarning = (() => {
    const expected = matchup.team1.team ? expectedOpponent(matchup.team1.team) : undefined
    if (expected && matchup.team2.team && expected !== matchup.team2.team) {
      return `Schedule says ${matchup.team1.team} plays ${expected} this week, not ${matchup.team2.team}`
    }
    return null
  })()

  const ready =
    matchup.team1.team &&
    matchup.team2.team &&
    [...matchup.team1.players, ...matchup.team2.players].every((p) => p.name.trim())

  return (
    <Card className={matchup.status === 'done' ? 'opacity-70' : ''}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">
            {matchup.team1.team || '?'} vs {matchup.team2.team || '?'}
          </CardTitle>
          {preview && (
            <Badge variant="secondary" className="text-sm">
              {preview.winner} wins {Math.max(t1, t2)}–{Math.min(t1, t2)}
              {t1 === t2 ? ` on ${preview.tiebreaker} tiebreaker` : ''}
            </Badge>
          )}
        </div>
        {scheduleWarning && <p className="text-sm text-amber-600 dark:text-amber-400">⚠ {scheduleWarning}</p>}
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {([matchup.team1, matchup.team2] as const).map((lineup, side) => (
            <div key={side} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <select
                  value={lineup.team}
                  onChange={(e) => {
                    const next = { ...matchup } as EditableMatchup
                    if (side === 0) next.team1 = { ...lineup, team: e.target.value }
                    else next.team2 = { ...lineup, team: e.target.value }
                    onChange(next)
                  }}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm font-semibold"
                >
                  <option value="">Pick team…</option>
                  {teams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="tabular text-lg font-bold">{total(lineup)}</span>
              </div>
              {lineup.issues.map((issue, i) => (
                <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ {issue}
                </p>
              ))}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const next = structuredClone(matchup)
                    const target = side === 0 ? next.team1 : next.team2
                    target.penalty = target.penalty === -5 ? 0 : -5
                    onChange(next)
                  }}
                  className={`rounded-md border px-2 py-1 font-medium transition-colors ${
                    lineup.penalty === -5
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-input text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  −5 non-confirm (§VII)
                </button>
                <label className="text-muted-foreground">or adj.</label>
                <input
                  type="number"
                  value={lineup.penalty || ''}
                  placeholder="0"
                  onChange={(e) => {
                    const next = structuredClone(matchup)
                    const target = side === 0 ? next.team1 : next.team2
                    target.penalty = parseInt(e.target.value) || 0
                    onChange(next)
                  }}
                  className="tabular w-16 rounded border border-input bg-background px-2 py-1 text-right"
                />
                {lineup.penalty !== 0 && (
                  <span className="text-muted-foreground">official total includes {lineup.penalty}</span>
                )}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {lineup.players.map((p, pi) => (
                    <tr key={p.slot} className="border-b border-border/50 last:border-0">
                      <td className="w-12 py-1 pr-2 text-xs font-medium text-muted-foreground">{p.slot}</td>
                      <td className="py-1 pr-2">
                        <input
                          value={p.name}
                          onChange={(e) => {
                            const next = structuredClone(matchup)
                            const target = side === 0 ? next.team1 : next.team2
                            target.players[pi].name = e.target.value
                            target.players[pi].issues = []
                            onChange(next)
                          }}
                          className={`w-full rounded border bg-background px-2 py-1 ${
                            p.issues.length > 0 ? 'border-amber-500' : 'border-input'
                          }`}
                        />
                        {p.issues.map((issue, i) => (
                          <p key={i} className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                            {issue}
                          </p>
                        ))}
                      </td>
                      <td className="w-16 py-1">
                        <input
                          type="number"
                          value={Number.isFinite(p.score) ? p.score : ''}
                          onChange={(e) => {
                            const next = structuredClone(matchup)
                            const target = side === 0 ? next.team1 : next.team2
                            target.players[pi].score = parseFloat(e.target.value)
                            onChange(next)
                          }}
                          className="tabular w-full rounded border border-input bg-background px-2 py-1 text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={onSubmit} disabled={!ready || !canSubmit || matchup.status === 'submitting' || matchup.status === 'done'}>
            {matchup.status === 'submitting' ? 'Saving…' : matchup.status === 'done' ? 'Saved' : 'Save to Sheet'}
          </Button>
          {matchup.message && (
            <span className={`text-sm ${matchup.status === 'error' ? 'text-destructive' : 'text-win'}`}>
              {matchup.message}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
