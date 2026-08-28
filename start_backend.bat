@echo off
title Lumina AI Backend
cd /d "%~dp0"
echo.
echo  ============================================
echo   LUMINA AI - Starting Backend Server...
echo  ============================================
echo.
echo  Backend will run on: http://127.0.0.1:8765
echo  Keep this window open while using Lumina AI!
echo.
python -m backend.app
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Backend failed to start.
  echo  Make sure packages are installed:
  echo    pip install -r backend/requirements.txt
  echo.
  pause
)
