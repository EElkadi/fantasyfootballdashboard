import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

interface CSVTeam {
  Week: string;
  Team: string;
  Score: string;
  Opponent: string;
  Result: string;
}

interface CSVPlayer {
  Week: string;
  Team: string;
  Player: string;
  Score: string;
  Position: string;
}

interface Player {
  Player: string;
  Position: string;
  Score: number;
}

interface TeamMatchup {
  Team: string;
  Players: Player[];
  TotalScore: number;
}

interface Matchup {
  Team1: TeamMatchup;
  Team2: TeamMatchup;
}

function readCSV(filePath: string) {
  const fileContent = fs.readFileSync(path.join(process.cwd(), filePath), 'utf-8');
  return parse(fileContent, { columns: true, skip_empty_lines: true });
}

function processMatchupData(teamsData: CSVTeam[], playersData: CSVPlayer[]) {
  const weeklyMatchups: Record<number, Matchup[]> = {};
  const processedMatchups = new Set<string>();

  teamsData.forEach(game => {
    const week = parseInt(game.Week);
    if (!weeklyMatchups[week]) weeklyMatchups[week] = [];

    const matchupId = `${week}-${game.Team}-${game.Opponent}`;
    const reverseMatchupId = `${week}-${game.Opponent}-${game.Team}`;

    if (!processedMatchups.has(matchupId) && !processedMatchups.has(reverseMatchupId)) {
      // Find the opponent's data
      const opponentData = teamsData.find(
        g => g.Week === game.Week && g.Team === game.Opponent && g.Opponent === game.Team
      );

      const matchup: Matchup = {
        Team1: createTeamMatchup(game.Team, parseFloat(game.Score), playersData, week),
        Team2: createTeamMatchup(game.Opponent, opponentData ? parseFloat(opponentData.Score) : null, playersData, week)
      };

      weeklyMatchups[week].push(matchup);
      processedMatchups.add(matchupId);
    }
  });

  return weeklyMatchups;
}

function createTeamMatchup(teamName: string, score: number | null, playersData: CSVPlayer[], week: number): TeamMatchup {
  const teamPlayers = playersData.filter(p => p.Team === teamName && parseInt(p.Week) === week);
  return {
    Team: teamName,
    Players: teamPlayers.map(p => ({
      Player: p.Player,
      Position: p.Position,
      Score: parseFloat(p.Score)
    })),
    TotalScore: score ?? teamPlayers.reduce((sum, p) => sum + parseFloat(p.Score), 0)
  };
}

export async function GET() {
  const teamsData = readCSV('data/teams_data.csv');
  const playersData = readCSV('data/players_data.csv');

  const processedMatchups = processMatchupData(teamsData, playersData);

  return NextResponse.json(processedMatchups);
}
