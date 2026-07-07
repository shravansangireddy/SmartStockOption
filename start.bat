@echo off
echo Starting Options Scanner Backend (port 4000)...
start "Options Scanner API" cmd /k "cd /d "%~dp0server" && node index.js"

echo Waiting 2 seconds for backend to start...
timeout /t 2 /nobreak >nul

echo Starting Options Scanner Frontend (port 5173)...
start "Options Scanner UI" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo ========================================
echo  Options Scanner is starting!
echo  Backend:  http://localhost:4000
echo  Frontend: http://localhost:5173
echo ========================================
echo.
echo Open http://localhost:5173 in your browser
echo.
echo Close the two terminal windows to stop the servers.
pause