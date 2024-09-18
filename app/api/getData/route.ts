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

    const processedStandingsData: StandingsRecord[] = standingsData.map((record: Record<string, string>) => ({
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
      'LOSS COUNT': parseInt(record['LOSS COUNT'])
    }));

    const scheduleData = await getScheduleData();

    const combinedData = {
      teams: processedTeamsData,
      players: processedPlayersData,
      standings: processedStandingsData,
      schedule: scheduleData
    };

    return NextResponse.json(combinedData);
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}