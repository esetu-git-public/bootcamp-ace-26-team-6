# 🦺 PPE Compliance Detection System

An AI-powered real-time PPE (Personal Protective Equipment) Compliance Detection System that monitors workers through live CCTV/video feeds using YOLOv8 object detection. The system identifies PPE compliance and violations, detects falls, stores detection events in Supabase Database, and provides a web dashboard for monitoring and reporting.

---

## 🚀 Features

- Real-time PPE detection from live CCTV/RTSP streams
- Detects: Person, Hardhat, Safety Vest, Gloves, Goggles, Mask, Ladder, Safety Cone
- Flags violations: No Hardhat, No Safety Vest, No Gloves, No Goggles, No Mask
- Real-time fall detection with emergency alerts
- Snapshot capture and event logging on every incident
- Dashboard notifications with optional email/SMS alerts
- Searchable historical logs by site, camera, date, violation type, and area
- Exportable reports (by type, site, camera, daily/weekly)
- Role-Based Access Control (RBAC)
- Multi-camera support and scalable architecture

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript (served via FastAPI) |
| Backend | Python 3.10+, FastAPI |
| AI/ML | YOLOv8, PyTorch, OpenCV |
| Database | Supabase (PostgreSQL) |
| Reporting | Plotly |
| Version Control | Git, GitHub |

---

## 🏗️ Workflow

Live CCTV Feed → Frame Capture → YOLOv8 Detection → PPE/Fall Analysis → Violation Check → Snapshot & Logging (Supabase) → Alert Generation → Dashboard Display & Reporting

---

## 🎯 Problem & Solution

Manual PPE checks are slow, inconsistent, and can't cover every worker or camera at once. This system automates detection using YOLOv8 on live feeds, instantly alerting personnel to violations and falls while logging every event for reporting and audit.

---

## ⚙️ Key Requirements

- Alert latency under 5 seconds; support for multiple concurrent streams
- Target uptime of 99%+
- Scalable to new cameras, users, and sites without redesign
- Encrypted passwords and RBAC-secured access
- Responsive dashboard (desktop, tablet, mobile)

---

## 🚧 Assumptions & Out of Scope

**Assumptions:** CCTV cameras pre-installed, stable network, YOLOv8 trained on provided PPE dataset, Supabase project configured.

**Out of Scope:** Face recognition, worker identity tracking, camera installation, PPE quality assessment.

---

## 🔮 Future Enhancements

- Multi-site centralised dashboard
- Predictive risk analytics
- Mobile alerting app
- Access control / turnstile integration
- Cloud deployment option

---

## 📁 Project Structure

```
bootcamp-ace-26-team-6/
├── backend/
│   ├── __init__.py
│   ├── config.py
│   ├── db.py
│   ├── detector.py
│   ├── main.py
│   ├── stream.py
│   ├── auth.py
│   ├── .env          # Not tracked in git
│   └── test/
├── models/
│   ├── best.pt
│   └── last.pt
├── training/
│   ├── ppe-compliance-model-train.ipynb
│   └── results_summary.md
├── .env.example
├── .gitignore
├── requirements.txt
├── run.sh        # Linux/macOS
├── runx.sh       # Windows
├── pytest.ini
├── DBXSTRUCTURE.TXT
└── README.md
```

---

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
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-random-secret-key-at-least-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
MODEL_PATH=models/best.pt
```

### 5. Run the application
**Linux / macOS:**
```bash
./run.sh
```

**Windows:**
```bash
./runx.sh
```

Or manually:
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. Open the application
Open your browser and navigate to:
```
http://localhost:8000
```

API documentation (Swagger UI):
```
http://localhost:8000/docs
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| SUPABASE_URL | Supabase project URL | Yes |
| SUPABASE_SERVICE_KEY | Service role key (bypasses RLS) | Yes |
| SUPABASE_ANON_KEY | Anonymous/public key | Yes |
| JWT_SECRET | Secret for signing JWT tokens (32+ chars) | Yes |
| JWT_ALGORITHM | JWT algorithm (default: HS256) | No |
| JWT_EXPIRE_MINUTES | Access token expiry (default: 60) | No |
| MODEL_PATH | Path to YOLO model (default: models/best.pt) | No |

---

## Database Schema

See `DBXSTRUCTURE.TXT` for the Supabase/PostgreSQL schema with tables:
- `users` - Authentication
- `cameras` - Camera configurations
- `detection_events` - Detection event logs
- `detections` - Individual detections per event
- `alerts` - Generated alerts
- `user_settings` - Per-user detection/alert settings