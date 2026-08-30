/**
 * League scoring system and constitution content, rendered on the Rules page.
 * Source: Premier League Fantasy Football Constitution (revised 08/29/2026).
 * All stats are based on ESPN.com.
 */

export interface ScoringTable {
  title: string
  note?: string
  rows: { label: string; points: string }[]
}

export const SCORING_TABLES: ScoringTable[] = [
  {
    title: 'Offensive Touchdowns',
    note: 'QB, RB, WR — pass, rush or receive',
    rows: [
      { label: '0–9 yards', points: '6' },
      { label: '10–19 yards', points: '7' },
      { label: '20–29 yards', points: '8' },
      { label: '30–39 yards', points: '9' },
      { label: '40–49 yards', points: '10' },
      { label: '50–59 yards', points: '11' },
      { label: '60–69 yards', points: '12' },
      { label: '70–79 yards', points: '13' },
      { label: '80–89 yards', points: '14' },
      { label: '90+ yards', points: '15' },
    ],
  },
  {
    title: 'QB Rushing Touchdowns',
    rows: [
      { label: '0–9 yards', points: '6' },
      { label: '10–19 yards', points: '7' },
      { label: '20–29 yards', points: '8' },
      { label: '30–39 yards', points: '10' },
      { label: '40–49 yards', points: '12' },
      { label: '50–59 yards', points: '14' },
      { label: '60–69 yards', points: '16' },
      { label: '70–79 yards', points: '18' },
      { label: '80–89 yards', points: '20' },
      { label: '90+ yards', points: '25' },
    ],
  },
  {
    title: 'Performance Points',
    note: 'Rush and receiving yards (QB, RB, WR) — no max',
    rows: [
      { label: '10–19 yards', points: '1' },
      { label: '20–29 yards', points: '2' },
      { label: '30–39 yards', points: '3' },
      { label: '40–49 yards', points: '4' },
      { label: '…every +10 yards', points: '+1' },
    ],
  },
  {
    title: 'QB Passing Yards',
    note: 'Add 1 point every 25 yards past 424',
    rows: [
      { label: '200–249 yards', points: '6' },
      { label: '250–274 yards', points: '7' },
      { label: '275–299 yards', points: '8' },
      { label: '300–324 yards', points: '10' },
      { label: '325–349 yards', points: '11' },
      { label: '350–374 yards', points: '12' },
      { label: '375–399 yards', points: '13' },
      { label: '400–424 yards', points: '14' },
    ],
  },
  {
    title: 'QB Interceptions',
    note: 'Subtract 1 point for each INT past 4',
    rows: [
      { label: '0 INT (min. 5 attempts)', points: '3' },
      { label: '1 INT', points: '0' },
      { label: '2 INT', points: '-1' },
      { label: '3 INT', points: '-2' },
      { label: '4 INT', points: '-4' },
    ],
  },
  {
    title: '2-Point Conversion',
    rows: [
      { label: 'Pass / Receive', points: '2' },
      { label: 'Rush', points: '3' },
    ],
  },
  {
    title: 'Kicker & Field Goals',
    note: 'Game-winning FG inside the final 30 seconds of the 4th quarter: add 6 points. Non-kicker FG = 10. TD by a kicker = 12.',
    rows: [
      { label: 'Extra point', points: '1' },
      { label: 'FG 0–29 yards', points: '1' },
      { label: 'FG 30–49 yards', points: '3' },
      { label: 'FG 50+ yards', points: '6' },
    ],
  },
  {
    title: 'Defensive Touchdowns',
    note: 'Fumble recovery, INT, blocked punt/FG, kickoff/punt return. Kick and punt returns count for defensive points.',
    rows: [
      { label: '0–9 yards', points: '6' },
      { label: '10–19 yards', points: '7' },
      { label: '20–29 yards', points: '8' },
      { label: '30–39 yards', points: '9' },
      { label: '40–49 yards', points: '10' },
      { label: '50–59 yards', points: '11' },
      { label: '60–69 yards', points: '12' },
      { label: '70–79 yards', points: '13' },
      { label: '80–89 yards', points: '14' },
      { label: '90+ yards', points: '15' },
    ],
  },
  {
    title: 'Defense — Misc',
    rows: [
      { label: 'Safety', points: '5' },
      { label: 'Sack', points: '2' },
      { label: 'Turnover (fumble/INT)', points: '3' },
      { label: 'Blocked XP returned for TD', points: '6' },
      { label: 'Fumble recovered in endzone by QB/RB/WR', points: '6' },
    ],
  },
  {
    title: 'Points Allowed',
    note: "Points scored on your defense via special teams or turnover return TDs don't count against you.",
    rows: [
      { label: 'Shutout', points: '10' },
      { label: '1–3 points', points: '7' },
      { label: '4–10 points', points: '3' },
      { label: '11–34 points', points: '0' },
      { label: '35–41 points', points: '-3' },
      { label: '42–48 points', points: '-5' },
      { label: '49+ points', points: '-10' },
    ],
  },
  {
    title: 'Yards Allowed',
    rows: [
      { label: 'Under 100 yards', points: '10' },
      { label: '100–149 yards', points: '7' },
      { label: '150–199 yards', points: '3' },
      { label: '200+ yards', points: '0' },
    ],
  },
]

export interface RuleSection {
  numeral: string
  title: string
  body: string[]
}

export const CONSTITUTION: RuleSection[] = [
  {
    numeral: 'I',
    title: 'League Dues',
    body: ['League dues are due by the draft. League fees are $300.'],
  },
  {
    numeral: 'II',
    title: 'Payouts',
    body: ['1st Place: $2,010 · 2nd Place: $1,005 · 3rd Place: $335 · Scoring Champ: $250.'],
  },
  {
    numeral: 'III',
    title: 'Draft Day',
    body: [
      'The draft is the Saturday of Labor Day weekend every year, unless the league agrees to a different date to accommodate certain managers.',
    ],
  },
  {
    numeral: 'IV',
    title: 'Name Dropping at the Draft',
    body: [
      "If you drop a player's name before you make your pick, you go to the end of the round. If you draft and then drop a player's name, you go to the end of the following round.",
    ],
  },
  {
    numeral: 'V',
    title: 'Team Rosters',
    body: [
      'At the end of the draft each team should consist of 20 players: 2 QBs, 5 RBs, 5 WRs, 1 K, 1 DEF, and 6 slots the manager fills as they like.',
    ],
  },
  {
    numeral: 'VI',
    title: 'Lineups',
    body: [
      'Lineups are due by Sunday at 9:59am to be considered on time. ANY lineup turned in after that is considered late and deemed a forfeit — this includes turning in a lineup at 10:00am.',
      'For Thursday and Friday night games, a player you are starting must be turned in to your opponent and the commissioner by 5pm that day. On Thanksgiving, starters must be reported before kickoff of the game they play in. A flex player you fail to identify automatically becomes your RB2 or WR2.',
    ],
  },
  {
    numeral: 'VII',
    title: 'Weekly Matchup Reporting',
    body: [
      'Points are due by Tuesday 11:59pm, reported in your matchup chat. Failure to do so results in both managers taking a 0 and going 0-2 for the week.',
      "Points must be CONFIRMED by the opposing manager in the matchup chat — reply 'Confirm' or react with a thumbs up.",
      "Amendment (08/23/2025): failure to confirm by Tuesday 11:59pm results in a 5-point deduction that week for the non-confirming manager. If points come in at exactly 11:59pm Tuesday, the opposing manager must confirm immediately.",
    ],
  },
  {
    numeral: 'VIII',
    title: 'Player Swap',
    body: [
      'If a starter is ruled out after lineups lock (9:59am) but before his game kicks off, you may swap him for a rostered player whose game has not yet started. Once the 10am games kick off, those players are locked and cannot be swapped in or out. It is your responsibility to know whether your players are active.',
    ],
  },
  {
    numeral: 'IX',
    title: 'Tiebreakers',
    body: [
      'Tied matchup: higher-scoring RB1 wins; still tied, WR1; still tied, QB.',
      "Standings: head-to-head result first. You play three opponents twice and eight opponents once — sweep a double matchup and you own that tiebreaker; split it and the tiebreaker is Points Scored.",
    ],
  },
  {
    numeral: 'X',
    title: 'Trades',
    body: [
      'Trades are not subject to league vote. Report the agreed deal in the Trade Block chat and both managers must confirm to finalize. Trades may also be finalized in private group chats with the commissioner (Amendment 08/23/2025).',
      'The commissioner reserves the right to VETO any trade deemed detrimental to league balance (Amendment 08/23/2025).',
    ],
  },
  {
    numeral: 'XI',
    title: 'League Chat',
    body: ['Our league chat is done on WhatsApp. It is easy to use and the best way to do it.'],
  },
  {
    numeral: 'XII',
    title: 'League Activity',
    body: [
      "Three simple things: turn in your lineup every week, do your points, and BE ACTIVE in the league chat. If you're a ghost, you will get replaced.",
    ],
  },
  {
    numeral: 'XIII',
    title: 'Important Dates',
    body: [
      'Trade deadline: Week 12 (11:59pm after the Monday night game). Waiver wire deadline: the Wednesday before Week 11 starts.',
    ],
  },
  {
    numeral: 'XIV',
    title: 'Waiver Wire',
    body: [
      'The waiver wire opens the Wednesday before Week 5. Order is determined by standings after Week 4 and runs as a rolling order — use your pick, go to the end of the line.',
      'Fees start at $20 and increase $20 for every add you make ($20, $40, $60, …). The wire runs until the Wednesday before Week 11.',
    ],
  },
  {
    numeral: 'XV',
    title: 'Regular Season',
    body: ['The regular season runs through the end of Week 14.'],
  },
  {
    numeral: 'XVI',
    title: 'Playoffs',
    body: [
      'Playoffs run Weeks 15–17. Seven teams qualify; the #1 seed gets a first-round bye. The top remaining seed always plays the lowest remaining seed.',
    ],
  },
  {
    numeral: 'XVII',
    title: 'Turd Bowl',
    body: [
      "The bottom 4 teams play a two-week tournament to crown the league Turd. The Turd plans and books the location for the following year's draft.",
    ],
  },
  {
    numeral: 'XVIII',
    title: 'Revisions to Scoring',
    body: [
      "A blocked extra point returned for a score counts 6 points. Points scored on your defense via defensive/special-teams touchdowns don't count toward points allowed.",
      'Amendment (08/23/2025): kickers earn 1 point per successful extra point.',
    ],
  },
  {
    numeral: 'XIX',
    title: 'Rule Proposals',
    body: [
      'When a new rule is approved it cannot be voted out until two full seasons have passed.',
    ],
  },
]
