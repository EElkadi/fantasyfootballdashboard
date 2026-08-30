# Premier League Fantasy Football

The league website: standings, matchups, records, rules, playoff odds — and a
commissioner tool that turns pasted WhatsApp score reports into rows in the
league's Google Sheet.

Built with Next.js 14 (App Router), Tailwind, and the Google Sheets API.

## How data flows

```
WhatsApp scores ──paste──▶ /commish ──review──▶ Google Sheet (Scores tab)
                                                      │
                                            site reads it live (60s cache)
                                                      ▼
                                     standings · matchups · records · odds
```

- **The Google Sheet stays the source of truth.** The site reads it directly
  server-side; there is no script to run and no redeploy after entering scores.
- **Standings are computed from the box scores** (H2H + weekly top-6, ranked by
  overall wins → two-team H2H → point differential), so they can't drift from
  the results like a hand-maintained tab can.
- **Past seasons** are archived as CSVs under `data/seasons/<year>/` and feed
  the Record Book and all-time head-to-head numbers.

## Pages

| Route | What it shows |
| --- | --- |
| `/` | Weekly hub: results, awards (top score, MVP, beatdown, nailbiter), next slate, standings snapshot |
| `/matchups` | Week browser with full box scores (`?week=`, `?season=`) |
| `/standings` | Full table with playoff line + Turd Bowl zone, Monte Carlo playoff odds, power rankings, luck index |
| `/teams/<owner>` | Team page: weekly chart vs league average, top contributors, all-time H2H, season history |
| `/draft` | Position-color-coded draft board per season; every pick links to the player's page |
| `/waivers` | Waiver log with per-team spending and the live pot (dues + waiver fees) |
| `/players/<slug>` | Player analytics: weekly chart, game log, position rank, draft/waiver history |
| `/records` | All-time record book computed from the box scores |
| `/rules` | The constitution and full scoring tables |
| `/recap/<week>` | Shareable 1080×1080 recap card (native share on mobile → straight into WhatsApp) |
| `/commish` | Passcode-protected score entry: paste WhatsApp reports, review, save to the Sheet |

## Setup

1. **Service account** — in Google Cloud Console create a service account,
   download a JSON key, and share the league spreadsheet with the service
   account's email (Editor, so `/commish` can append rows).
2. **Env vars** — copy `.env.example` to `.env.local` and fill it in. On
   Vercel, set the same variables in Project Settings → Environment Variables.
3. `npm install && npm run dev`

Without Sheet credentials the site still runs, serving the most recent
archived season — useful for local development.

## The spreadsheet contract

Three tabs (names configurable via env):

- **Scores** — one row per matchup in the historical 43-column layout:
  `Week, Team 1, QB Name, QB, RB1 Name, RB1, … Flex2, Total1, Team 2, …,
  Total2, Winner, Loser`. `/commish` appends rows in exactly this shape.
- **Schedule** — a grid: `Week` column plus one column per team, cells naming
  that week's opponent. A row label like `RIVALRY WEEK 7` still parses as
  week 7 and shows as "Rivalry Week" on the site.
- **Rosters** — one column per team (owner name as the header), rostered
  players below. This powers the parser's fuzzy name matching ("Romeo" →
  Romeo Doubs, "Mathew Stafford" → Matthew Stafford). Update it after the
  draft and after waiver adds; without it, parsing still works but spellings
  aren't corrected.
- **Final Draft Board** + **Teams** — the draft grid (one column per team in
  draft order, `Round NN` rows) and the Teams tab whose `DRAFT ORDER`/`TEAMS`
  columns map board columns to owners. Powers `/draft`.
- **Waiver Wire** — `WEEK | TEAM | PLAYER | COST` rows. Powers `/waivers` and
  the live pot math (fees join the pot; scoring champ stays $250 and the rest
  splits 60/30/10). `/commish` has a one-click form that appends rows here.
- **Adjustments** (optional) — `Week | Team | Points | Reason` rows explaining
  any gap between a row's official total and its players' sum (e.g. the §VII
  -5 confirmation penalty). The site detects the gap automatically either way
  and shows it as an "Adj" line in the box score; this tab just supplies the
  reason. `/commish` writes here when you apply a penalty at score entry.

## Weekly routine (commissioner)

1. Open `/commish`, paste the score reports from the matchup chats.
2. Hit **Parse scores** — check anything flagged in amber (unknown names,
   totals that don't add up, schedule mismatches).
3. **Save to Sheet** per matchup. The site updates within a minute.
4. Optionally open `/recap/<week>` and share the card back into the chat.

## New season checklist

1. Archive last season: export the final Scores/Schedule tabs into
   `data/seasons/<year>/` as `teams.csv`, `players.csv`, `schedule.csv`
   (same long format as `data/seasons/2025/`), and add the year to
   `ARCHIVED_SEASONS` in `lib/league.ts`.
2. Point `LEAGUE_SHEET_ID` at the new sheet (or clear the old tabs), bump
   `CURRENT_SEASON`, and update the Rosters tab after the draft.
3. Update team names / new members in `lib/league.ts` (`OWNERS` — aliases
   handle nickname spellings like Eloy/Elaf, Mono/Monaf).
4. Record last season's champion in `HONORS` in `lib/league.ts`.

## Tests

```
npx tsx tests/parser.test.ts   # parser acceptance tests (real league samples)
npm run lint && npx tsc --noEmit
```
