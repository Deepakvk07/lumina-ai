# Lumina AI — Undetectable Live Interview Assistant & Question Solver 🎯

An enterprise-grade, middle-layer AI assistant built for live technical and behavioral interviews, online tests, and competitive coding exams. It runs quietly in the background, captures interviewer questions via digital audio loopback, solves on-screen questions (MCQs, Aptitude, Reasoning, DSA) via a **Dual-Pass 120B reasoning engine**, and streams verified answers directly into a **100% undetectable HUD overlay** that is completely invisible to screen shares (Zoom, Microsoft Teams, Google Meet, OBS, Discord, and proctoring tools).

---

## 🌟 Key Features

### 1. 👻 100% Invisible to Screen Sharing (WDA_EXCLUDEFROMCAPTURE)
- Uses native Windows Win32 Desktop Window Manager (DWM) API SetWindowDisplayAffinity(hwnd, 0x00000011).
- When sharing your entire screen in **Zoom**, **Google Meet**, **Microsoft Teams**, or **Discord**, the teleprompter window is stripped by the hardware compositor. You see the answers; the interviewer only sees a clean desktop.

### 2. ⚡ Question Solver (99%+ Accuracy Dual-Pass Engine)
- **Dual-Pass Reasoning**: High-fidelity OCR extraction + 120-Billion Parameter Math Reasoner (openai/gpt-oss-120b).
- **Direct Option Output**: Outputs clean, direct answers (e.g. 🎯 Option C — Wednesday) without long paragraphs.
- **1-Click Website / Full Screen Scan**: Click 🖥️ Scan Website to capture and solve all visible questions without Alt+Tab.
- **Instant Screenshot Auto-Solve**: Paste with Ctrl + V and it solves automatically in under 1 second.

### 3. 🎙️ Automatic Voice Copilot (Lumina HUD)
- Captures the interviewer's voice directly from your system audio in real-time.
- **Zero Meeting Bots**: No bots joining or recording announcements.
- Grounded in your resume & experience with STAR behavioral responses.

### 4. 🎛️ Stealth Controls & Hotkeys
- **Panic Hide / Unhide (Ctrl + Shift + H)**: 100% invisible hide with zero trace on screen.
- **Mouse Click-Through (Ctrl + Shift + T)**: Pass mouse clicks directly through the overlay to click buttons in the underlying test.
- **Ghost Opacity**: Lower transparency down to 10% for subtle visibility.

---

## 🚀 Quick Start (Local Desktop)

### One-Click Launch (Windows)
Double-click 
un_app.bat in the root directory:
`cmd
run_app.bat
`

### Manual Startup
1. **Start Python Backend**:
   `ash
   pip install -r backend/requirements.txt
   python -m backend.app
   `
2. **Start Frontend / Desktop App**:
   `ash
   cd frontend
   npm install
   npx electron .
   `
3. **Web UI Access**:
   Open [http://localhost:5173](http://localhost:5173) in your browser or phone.

---

## 🌐 Deploy to Vercel (Web Companion)

1. Push this repository to your GitHub account.
2. Import the repository in [Vercel](https://vercel.com/new).
3. Set the build settings:
   - **Framework Preset**: Vite
   - **Root Directory**: ./ (or rontend)
   - **Build Command**: cd frontend && npm install && npm run build
   - **Output Directory**: rontend/dist
4. Set Environment Variables (Optional):
   - VITE_API_BASE_URL: http://<YOUR_PC_IP>:8765 (or your deployed backend)

---

## ⌨️ Master Shortcuts

| Shortcut | Description |
|---|---|
| Ctrl + Shift + H | 100% Invisible Panic Hide / Unhide |
| Ctrl + Shift + T | Toggle Mouse Click-Through |
| Ctrl + Shift + S | Snip Screen Region |
| Ctrl + V | Paste Screenshot & Auto-Solve |

---

## 🔒 Security & Privacy
- Zero cloud storage of audio recordings or screenshots.
- API keys and personal resumes remain stored strictly in local settings.json and are ignored from version control.
