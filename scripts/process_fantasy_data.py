import json

import gspread
import pandas as pd
from google.oauth2.service_account import Credentials


def load_config():
    with open(
        "/Users/elafelkadi/premier-league-fantasy/fantasy-football-dashboard/scripts/config.json",
        "r",
    ) as f:
        return json.load(f)


def authenticate_gspread(creds_path):
    scope = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_file(creds_path, scopes=scope)
    return gspread.authorize(creds)


def get_sheet_data(client, sheet_id, worksheet_name):
    sheet = client.open_by_key(sheet_id).worksheet(worksheet_name)
    return sheet.get_all_values()


def create_team_data(df, team_num):
    suffix = "1" if team_num == 1 else "2"
    team_data = df[
        [
            "Week",
            f"Team {team_num}",
            f"Total{suffix}",
            f"Team {3-team_num}",
            "Winner",
            "Loser",
        ]
    ]
    team_data.columns = ["Week", "Team", "Score", "Opponent", "Winner", "Loser"]
    team_data["Result"] = team_data.apply(
        lambda row: "Win" if row["Team"] == row["Winner"] else "Loss", axis=1
    )
    return team_data.drop(["Winner", "Loser"], axis=1)


def create_player_data(df, position, team_num):
    prefix = "" if team_num == 1 else "_2"
    team_col = f"Team {team_num}"
    name_col = f"{position}{prefix} Name"
    score_col = f"{position}{prefix}"

    player_data = df[["Week", team_col, name_col, score_col]]
    player_data.columns = ["Week", "Team", "Player", "Score"]
    player_data["Position"] = position

    return player_data


def get_raw_standings_data(client, sheet_id, worksheet_name):
    sheet = client.open_by_key(sheet_id).worksheet(worksheet_name)
    return pd.DataFrame(sheet.get_all_records())


def process_raw_standings(df):
    # Convert numeric columns to appropriate types
    numeric_columns = [
        "Points For",
        "Points Against",
        "Average Points For",
        "Average Points Against",
        "Point Differential",
        "WIN COUNT",
        "LOSS COUNT",
    ]
    df[numeric_columns] = df[numeric_columns].apply(pd.to_numeric)

    # Calculate additional metrics
    df["Win Percentage"] = df["WIN COUNT"] / (df["WIN COUNT"] + df["LOSS COUNT"])
    df["Efficiency"] = df["Points For"] / df["Points Against"]

    # Sort by WIN COUNT (descending) and Point Differential (descending)
    df_sorted = df.sort_values(
        ["WIN COUNT", "Point Differential"], ascending=[False, False]
    )

    # Add Rank column
    df_sorted["Rank"] = range(1, len(df_sorted) + 1)

    return df_sorted


def main():
    config = load_config()
    client = authenticate_gspread(config["credentials_path"])

    # Process Scores data
    scores_data = get_sheet_data(client, config["sheet_id"], config["worksheet_name"])
    df = pd.DataFrame(scores_data[1:], columns=scores_data[0])

    # Create team data
    team1_data = create_team_data(df, 1)
    team2_data = create_team_data(df, 2)
    teams_df = pd.concat([team1_data, team2_data], ignore_index=True)

    # Create player data
    positions = ["QB", "RB1", "RB2", "WR1", "WR2", "DEF", "K", "Flex"]
    players_df = pd.concat(
        [
            create_player_data(df, pos, team_num)
            for pos in positions
            for team_num in [1, 2]
        ],
        ignore_index=True,
    )

    # Clean up player names
    players_df["Player"] = players_df["Player"].str.split("(").str[0].str.strip()

    # Process Raw Standings data
    raw_standings_df = get_raw_standings_data(
        client, config["sheet_id"], "Raw Standings"
    )
    standings_df = process_raw_standings(raw_standings_df)

    # Save processed data
    teams_df.to_csv(config["teams_output_path"], index=False)
    players_df.to_csv(config["players_output_path"], index=False)
    standings_df.to_csv(config["standings_output_path"], index=False)

    print(
        f"Processed data saved to {config['teams_output_path']}, {config['players_output_path']}, and {config['standings_output_path']}"
    )


if __name__ == "__main__":
    main()
