#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Export env vars from .env so both backend and frontend can see them
set -a; source .env; set +a

source venv/bin/activate

echo "Starting backend on :8000 ..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
