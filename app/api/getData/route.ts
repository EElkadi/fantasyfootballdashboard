import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

interface TeamRecord {
  Week: number;
  Team: string;
  Score: number;
  Opponent: string;
  Result: string;
}

interface PlayerRecord {
  Week: number;
  Team: string;
  Player: string;
  Position: string;
  Score: number;
}

interface StandingsRecord {
  Rank: number;
  Team: string;
  'Win/Loss Record': string;
  'Top 6 Record': string;
  'Overall Record': string;
  'Points For': number;
  'Points Against': number;
  'Average Points For': number;
  'Average Points Against': number;
  'Point Differential': number;
  'WIN COUNT': number;
  'LOSS COUNT': number;
  'Head-to-Head': Record<string, number>;
}

interface TeamWeeklyScore {
  Team: string;
  Score: number;
  RB1Score: number;
}

async function readCsvFile(fileName: string) {
  const filePath = path.join(process.cwd(), 'data', fileName);
  const fileContent = await fs.readFile(filePath, 'utf8');
  return parse(fileContent, { columns: true, skip_empty_lines: true });
}

async function getScheduleData() {
  const filePath = path.join(process.cwd(), 'data', 'team_schedule.csv');
  const fileContents = await fs.readFile(filePath, 'utf8');
  const rows = fileContents.split('\n').map(row => row.split(','));
  const headers = rows.shift();
  return rows.map(row => Object.fromEntries(headers!.map((header, index) => [header, row[index]])));
}

function calculateHeadToHeadRecords(teamsData: TeamRecord[]): Record<string, Record<string, number>> {
  const headToHead: Record<string, Record<string, number>> = {};

  teamsData.forEach(game => {
    if (!headToHead[game.Team]) {
      headToHead[game.Team] = {};
    }
    if (!headToHead[game.Opponent]) {
      headToHead[game.Opponent] = {};
    }

    if (game.Result === 'Win') {
      headToHead[game.Team][game.Opponent] = (headToHead[game.Team][game.Opponent] || 0) + 1;
    } else if (game.Result === 'Loss') {
      headToHead[game.Opponent][game.Team] = (headToHead[game.Opponent][game.Team] || 0) + 1;
    }
  });

  return headToHead;
}

function applyTiebreakers(standings: StandingsRecord[]): StandingsRecord[] {
  return standings.sort((a, b) => {
    // 1. Overall Record
    const [aWins, aLosses] = a['Overall Record'].split('-').map(Number);
    const [bWins, bLosses] = b['Overall Record'].split('-').map(Number);

    if (aWins !== bWins) {
      return bWins - aWins; // Sort by wins in descending order
    }
    if (aLosses !== bLosses) {
      return aLosses - bLosses; // If wins are equal, sort by losses in ascending order
    }

    // 2. Head to Head
    const aHeadToHead = a['Head-to-Head'][b.Team] || 0;
    const bHeadToHead = b['Head-to-Head'][a.Team] || 0;
    if (aHeadToHead !== bHeadToHead) {
      return bHeadToHead - aHeadToHead; // Team with more head-to-head wins ranks higher
    }

    // 3. Points For
    return b['Points For'] - a['Points For'];
  });
}

function calculateWeeklyScores(playersData: PlayerRecord[]): Record<number, TeamWeeklyScore[]> {
  const weeklyScores: Record<number, Record<string, TeamWeeklyScore>> = {};

  playersData.forEach(player => {
    if (!weeklyScores[player.Week]) {
      weeklyScores[player.Week] = {};
    }

    if (!weeklyScores[player.Week][player.Team]) {
      weeklyScores[player.Week][player.Team] = { Team: player.Team, Score: 0, RB1Score: 0 };
    }

    weeklyScores[player.Week][player.Team].Score += player.Score;

    if (player.Position === 'RB1' && player.Score > weeklyScores[player.Week][player.Team].RB1Score) {
      weeklyScores[player.Week][player.Team].RB1Score = player.Score;
    }
  });
  
  // Convert the nested object to an array of TeamWeeklyScore for each week
  const result: Record<number, TeamWeeklyScore[]> = {};
  Object.entries(weeklyScores).forEach(([week, scores]) => {
    result[Number(week)] = Object.values(scores);
  });

  return result;
}

export async function GET() {

  try {
    const [teamsData, playersData, standingsData] = await Promise.all([
      readCsvFile('teams_data.csv'),
      readCsvFile('players_data.csv'),
      readCsvFile('standings_data.csv'),
    ]);

    const processedTeamsData: TeamRecord[] = teamsData.map((record: Record<string, string>) => ({
      Week: parseInt(record.Week),
      Team: record.Team,
      Score: parseFloat(record.Score),
      Opponent: record.Opponent,
      Result: record.Result
    }));

    const processedPlayersData: PlayerRecord[] = playersData.map((record: Record<string, string>) => ({
      Week: parseInt(record.Week),
      Team: record.Team,
      Player: record.Player,
      Position: record.Position,
      Score: parseFloat(record.Score)
    }));

    // Calculate weekly scores including RB1 scores
    const weeklyScores = calculateWeeklyScores(processedPlayersData);

    const headToHeadRecords = calculateHeadToHeadRecords(processedTeamsData);

    const processedStandingsData: StandingsRecord[] = standingsData.map((record: Record<string, string>) => {
      const standingsRecord = {
        Rank: parseInt(record.Rank),
        Team: record.Team,
        'Win/Loss Record': record['Win/Loss Record'],
        'Top 6 Record': record['Top 6 Record'],
        'Overall Record': record['Overall Record'],
        'Points For': parseFloat(record['Points For']),
        'Points Against': parseFloat(record['Points Against']),
        'Average Points For': parseFloat(record['Average Points For']),
        'Average Points Against': parseFloat(record['Average Points Against']),
        'Point Differential': parseFloat(record['Point Differential']),
        'WIN COUNT': parseInt(record['WIN COUNT']),
        'LOSS COUNT': parseInt(record['LOSS COUNT']),
        'Head-to-Head': headToHeadRecords[record.Team] || {}
      };
      return standingsRecord;
    });

    // Apply tiebreakers and update ranks
    const sortedStandings = applyTiebreakers(processedStandingsData);
    sortedStandings.forEach((team, index) => {
      team.Rank = index + 1;
    });
    const scheduleData = await getScheduleData();

    const combinedData = {
      teams: processedTeamsData,
      players: processedPlayersData,
      standings: sortedStandings, // Use the sorted standings
      schedule: scheduleData,
      weeklyScores: weeklyScores // Add this new field to the response
    };

    return NextResponse.json(combinedData);
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}