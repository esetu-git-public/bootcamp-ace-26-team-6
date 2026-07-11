# PPE Compliance Detection System

An AI-powered real-time PPE (Personal Protective Equipment) Compliance Detection System that monitors workers through live CCTV/video feeds using YOLOv8 object detection. The system identifies PPE compliance and violations, detects falls, stores detection events in SupaBase Database, and provides an Interactive UI for monitoring and reporting.

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd bootcamp-ace-26-team-6
```

### 2. Create and activate a virtual environment

**Windows**

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

**Linux / macOS**

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file in the project root and add the required environment variables.

Example:

```env
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-supabase-key>
MODEL_PATH=models/best.pt
```

### 5. Run the application

Start the FastAPI server:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### 6. Open the application

Open your browser and navigate to:

```
http://localhost:8000
```

The application serves both the backend APIs and the frontend dashboard from the same server.
