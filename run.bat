@echo off
cd /d "%~dp0"
echo Starting AI Proctoring Server...

set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%~dp0venv312\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    echo Could not find a project virtual environment.
    echo Create one first, or run: python app.py
    pause
    exit /b 1
)

"%PYTHON_EXE%" "%~dp0app.py"
pause
