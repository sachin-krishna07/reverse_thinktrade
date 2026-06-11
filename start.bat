@echo off
title ThinkTrade Bot

echo Starting ThinkTrade...

:: Start Backend
start "ThinkTrade Backend" cmd /k "cd /d D:\Projects\ThinkTrade\backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000"

:: Wait 3 seconds for backend to start
timeout /t 3 /nobreak >nul

:: Start Frontend
start "ThinkTrade Frontend" cmd /k "cd /d D:\Projects\ThinkTrade\frontend && npm run dev"

:: Wait 4 seconds for frontend to start
timeout /t 4 /nobreak >nul

:: Open Chrome
start chrome http://localhost:8080

echo ThinkTrade started!
