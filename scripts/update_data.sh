#!/bin/bash

# Set the directory of your project
PROJECT_DIR="/Users/elaf/projects/fantasyfootballdashboard"

# Run the Python script to fetch and process data
source $PROJECT_DIR/venv/bin/activate
python3 $PROJECT_DIR/scripts/process_fantasy_data.py
deactivate

# Check if the Python script ran successfully
if [ $? -eq 0 ]; then
    echo "Data updated successfully"
    
    # Move the updated CSV files to the web app's data directory
    mv $PROJECT_DIR/teams_data.csv $PROJECT_DIR/data/
    mv $PROJECT_DIR/players_data.csv $PROJECT_DIR/data/
    mv $PROJECT_DIR/standings_data.csv $PROJECT_DIR/data/
    
    # Optionally, trigger a rebuild of your Next.js app if you're using static generation
    # cd $PROJECT_DIR/fantasy-football-dashboard && npm run build
    
    echo "Web app data updated"
else
    echo "Error updating data"
    exit 1
fi