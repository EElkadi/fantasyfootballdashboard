'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ownerColor } from '@/lib/league'
import { DraftGrade, DraftPick, DraftSlot } from '@/lib/types'

interface Row {
  team: string
  grade: string
  bestPick: string
  worstPick: string
  notes: string
}

/**
 * The league's post-draft verdict, one row per team: a 0–10 grade and the
 * consensus best and worst pick (chosen from that team's actual picks).
 * Saving rewrites the Draft Grades tab.
 */
export function DraftGradesForm({ order, picks, initial }: { order: DraftSlot[]; picks: DraftPick[]; initial: DraftGrade[] }) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(initial.length > 0)

  useEffect(() => {
    setRows(
      order.map((o) => {
        const g = initial.find((x) => x.team === o.team)
        return {
          team: o.team,
          grade: g ? String(g.grade) : '',
          bestPick: g?.bestPick ?? '',
          worstPick: g?.worstPick ?? '',
          notes: g?.notes ?? '',
        }
      }),
    )
  }, [order, initial])

  const picksOf = useMemo(() => {
    const m = new Map<string, DraftPick[]>()
    for (const p of picks) m.set(p.team, [...(m.get(p.team) ?? []), p])
    m.forEach((list) => list.sort((a, b) => a.round - b.round))
    return m
  }, [picks])

  const update = (team: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.team === team ? { ...r, ...patch } : r)))
  const filled = rows.filter((r) => r.grade.trim() !== '')
  const valid = filled.every((r) => {
    const g = Number(r.grade)
    return Number.isFinite(g) && g >= 0 && g <= 10
  })

  const save = async () => {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/commish/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grades: filled.map((r) => ({ ...r, grade: Number(r.grade) })) }),
      })
      const data = await res.json().catch(() => ({}))
      setNote(res.ok ? `Saved grades for ${data.saved} teams — live on /draft.` : data.error ?? 'Save failed')
    } catch {
      setNote('Network error — grades were NOT saved.')
    } finally {
      setBusy(false)
    }
  }

  const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs'

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Draft grades</CardTitle>
            <CardDescription>
              The league&apos;s verdict: a grade out of 10, the best pick and the worst pick per team. Shows on /draft.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Grade the draft'}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Team</th>
                  <th className="w-20 pb-2 pr-2 font-medium">Grade</th>
                  <th className="pb-2 pr-2 font-medium">Best pick</th>
                  <th className="pb-2 pr-2 font-medium">Worst pick</th>
                  <th className="pb-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const options = picksOf.get(r.team) ?? []
                  const pickSelect = (value: string, onChange: (v: string) => void) => (
                    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
                      <option value="">—</option>
                      {options.map((p) => (
                        <option key={p.overall} value={p.player}>
                          R{p.round} · {p.player}
                          {p.position ? ` (${p.position})` : ''}
                        </option>
                      ))}
                      {value && !options.some((p) => p.player === value) && <option value={value}>{value}</option>}
                    </select>
                  )
                  return (
                    <tr key={r.team} className="border-t border-border/40">
                      <td className="py-1.5 pr-2">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ownerColor(r.team) }} />
                          {r.team}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={r.grade}
                          onChange={(e) => update(r.team, { grade: e.target.value })}
                          className="h-8 w-20 text-sm"
                        />
                      </td>
                      <td className="py-1.5 pr-2">{pickSelect(r.bestPick, (v) => update(r.team, { bestPick: v }))}</td>
                      <td className="py-1.5 pr-2">{pickSelect(r.worstPick, (v) => update(r.team, { worstPick: v }))}</td>
                      <td className="py-1.5">
                        <Input
                          value={r.notes}
                          onChange={(e) => update(r.team, { notes: e.target.value.slice(0, 240) })}
                          placeholder="optional"
                          className="h-8 text-sm"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={busy || filled.length === 0 || !valid}>
              {busy ? 'Saving…' : `Save ${filled.length} grade${filled.length === 1 ? '' : 's'}`}
            </Button>
            {!valid && <span className="text-sm text-loss">Grades must be between 0 and 10.</span>}
            {note && <span className="text-sm text-muted-foreground">{note}</span>}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
