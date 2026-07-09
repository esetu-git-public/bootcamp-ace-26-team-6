#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Export env vars
set -a; source .env 2>/dev/null || source backend/.env; set +a

source venv/bin/activate

echo "Starting backend on :8000 ..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

if [ -f frontend/app.py ]; then
    echo "Starting frontend on :8501 ..."
    streamlit run frontend/app.py --server.port 8501 &
    FRONTEND_PID=$!
fi

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Swagger:  http://localhost:8000/docs"
echo "  Frontend: http://localhost:8501"
echo ""

wait