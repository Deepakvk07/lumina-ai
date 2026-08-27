@echo off
title Lumina AI - Undetectable Live Interview Assistant & Question Solver
color 0B

echo ==============================================================================
echo           LUMINA AI - UNDETECTABLE LIVE ASSISTANT & QUESTION SOLVER
echo ==============================================================================
echo [1/3] Checking Python backend environment...
python -c "import fastapi, uvicorn, pyaudiowpatch, soundcard, mss, PIL, openai, groq, google.genai" >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Installing missing Python requirements...
    pip install -r backend/requirements.txt
)

echo [2/3] Starting Middle-Layer Audio & AI Core Engine on port 8765...
start "Lumina Python Backend" /min cmd /c "python -m backend.app"

echo [3/3] Launching Undetectable Stealth Desktop Overlay...
cd frontend
start "" npx electron .

echo ==============================================================================
echo [SUCCESS] Lumina is now running in Stealth Desktop Mode!
echo.
echo Master Hotkeys:
echo   - [Ctrl + Shift + H] : 100%% Invisible Panic Hide / Unhide
echo   - [Ctrl + Shift + S] : Snip Screen Region & Auto-Solve
echo   - [Ctrl + Shift + T] : Toggle Mouse Click-Through
echo.
echo Browser Web UI is also available at: http://localhost:5173
echo ==============================================================================
exit
