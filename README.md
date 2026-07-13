# 🦺 PPE Compliance Detection System

An AI-powered real-time PPE (Personal Protective Equipment) Compliance Detection System that monitors workers through live CCTV/video feeds using YOLOv8 object detection. The system identifies PPE compliance and violations, detects falls, stores detection events in SupaBase Database, and provides an Interactive UI for monitoring and reporting.

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
| Frontend | HTML, CSS, JavaScript |
| Backend | Python 3.10+ |
| AI/ML | YOLOv8, PyTorch, OpenCV |
| Database | MongoDB, PyMongo, MongoDB Compass |
| Reporting | Plotly |
| Version Control | Git, GitHub |

---

## 🏗️ Workflow

Live CCTV Feed → Frame Capture → YOLOv8 Detection → PPE/Fall Analysis → Violation Check → Snapshot & Logging (MongoDB) → Alert Generation → Dashboard Display & Reporting

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

**Assumptions:** CCTV cameras pre-installed, stable network, YOLOv8 trained on provided PPE dataset, MongoDB installed locally.

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
│   └── main.py
├── frontend/
│   ├── __init__.py
│   └── app.py
├── .env
├── .gitignore
├── requirements.txt
├── run.sh
└── yolov8n.pt
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

