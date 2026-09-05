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
| `/draft` | Position-color-coded draft board per season with steals/busts value analysis; live-updating on draft night |
| `/waivers` | Transactions: waiver log with per-team spending, the live pot (dues + waiver fees), and the trade ledger |
| `/players/<slug>` | Player analytics: weekly chart, game log, position rank, draft/waiver history |
| `/records` | All-time record book computed from the box scores |
| `/rules` | The constitution and full scoring tables |
| `/recap/<week>` | Shareable 1080×1080 recap card (native share on mobile → straight into WhatsApp) |
| `/my-board` | A manager's private draft board: the Player Pool dragged into their own order, kept in their browser (nothing server-side), with live cross-outs as picks land |
| `/rosters` | Every team's current roster with how each player was acquired (draft pick, waiver, trade) |
| `/lineups` | Submitted starting lineups per week — partials show what's in so far; flags starters that differ from the box score |
| `/awards` | Weekly awards (Top Gun, Cupcake, Bad Beat, Heist, Nailbiter, Hammer) and the season tally |
| `/predictions` | Preseason ballots — hidden until kickoff, then scored against the standings every week |
| `/commish` | Passcode-protected score entry: paste WhatsApp reports, review, save to the Sheet |
| `/commish/draft` | Draft-night mode: enter picks live; the public board updates as you go |

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
- **Team by Team Schedule** — the week grid: a `Week` column plus one column
  per team, cells naming that week's opponent. A row label like
  `RIVALRY WEEK 7` still parses as week 7 and shows as "Rivalry Week" on the
  site. Note this is NOT the tab named `Schedule`, which in these workbooks is
  a free-form weekly scratch area; both names are tried in order, and
  `SCHEDULE_TAB` pins one explicitly.
- **Rosters** — one column per team (owner name as the header), rostered
  players below. Powers `/rosters` and the parser's fuzzy name matching
  ("Romeo" → Romeo Doubs, "Mathew Stafford" → Matthew Stafford). Create the
  tab empty: the draft-night tool writes the header and every pick, and the
  waiver and trade forms keep it current from then on. Without it, parsing
  still works but spellings aren't corrected.
- **Player Pool** (optional, recommended) — `Player Name | Team | Position`,
  one row per draftable player, kept in rough draft-value order. Powers the
  typeahead in the draft-night tool and the waiver form (picks write the
  canonical `Name TEAM POS` form), the commissioner's **Best available**
  panel, name matching on `/my-board`, the **Free agents** list on `/rosters`, position and
  NFL-team fill-in for anyone typed as a bare name, and a spelling fallback
  in the score/lineup parsers for players not yet on a roster.
- **Lineups** — `Week | Team | Slot | Player | Submitted`, one row per slot,
  appended by the **Log lineups** form on `/commish`. Rows are never edited:
  a Thursday partial and Sunday's full lineup both stay, and the site shows
  the latest row per slot — so the tab doubles as an audit trail for
  deadline disputes. Powers `/lineups`.
- **Final Draft Board** + **Teams** — the draft grid (one column per team in
  draft order, `Round NN` rows) and the Teams tab whose `DRAFT ORDER`/`TEAMS`
  columns map board columns to owners. Powers `/draft`. A `Team Name` column
  on the Teams tab supplies this season's franchise names site-wide
  (falling back to `OWNERS` in `lib/league.ts`).
- **Waiver Wire** — `WEEK | TEAM | PLAYER | COST` rows. Powers `/waivers` and
  the live pot math (fees join the pot; scoring champ stays $250 and the rest
  splits 60/30/10). `/commish` has a one-click form that appends rows here.
- **Trades** (optional) — `TEAM 1 | TEAM 1 GETS | TEAM 2 | TEAM 2 GETS`, one
  asset per row with blank team cells continuing a multi-player deal. Powers
  the trade ledger on `/waivers`.
- **Predictions** (optional) — `Submitted | Manager | Order | Champion | Turd | Bold Take`,
  one row per ballot, appended by `/predictions` (requires `LEAGUE_PASSCODE`).
  `Order` is a comma-separated list, best first; a manager's latest row wins.
  Ballots lock at `PREDICTIONS_LOCK_AT` (Week 1 kickoff).
- **Adjustments** (optional) — `Week | Team | Points | Reason` rows explaining
  any gap between a row's official total and its players' sum (e.g. the §VII
  -5 confirmation penalty). The site detects the gap automatically either way
  and shows it as an "Adj" line in the box score; this tab just supplies the
  reason. `/commish` writes here when you apply a penalty at score entry.

## Weekly routine (commissioner)

Everything runs from `/commish` — the Sheet is the database, not the interface:

1. Paste the score reports from the matchup chats, hit **Parse scores**, check
   anything flagged in amber (unknown names, totals that don't add up,
   schedule mismatches, the -5 non-confirm toggle), **Save to Sheet**.
2. Before kickoff, paste lineup posts into **Log lineups** as they arrive —
   partials included. `/lineups` shows the league who's starting whom.
3. Log waiver adds and trades with their forms — both write their tabs AND
   keep the Rosters tab (the parser's name matching) current automatically.
4. Open `/recap/<week>` and either share the image or hit **Copy for the group
   chat** for a text recap (results, awards, standings, next week's slate).

The site updates within a minute of any save.

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
5. Set `PREDICTIONS_LOCK_AT` to the new Week 1 kickoff and post the
   `LEAGUE_PASSCODE` in the chat so ballots can come in before the draft.

## Tests

```
npx tsx tests/parser.test.ts   # parser acceptance tests (real league samples)
npx tsx tests/data.test.ts     # transforms, schedule rules, clinch math
npx tsx tests/features.test.ts # awards, recap text, predictions, career
npx tsx tests/rosters-lineups.test.ts # lineup merging, team names, roster provenance, lineup-mode parsing
npm run lint && npx tsc --noEmit
```
