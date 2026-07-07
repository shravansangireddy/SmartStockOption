@echo off
title Options Scanner - Setup
echo ============================================
echo  Options Scanner - Prerequisites Installer
echo ============================================
echo.

:: ─── Check Node.js ────────────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo   Download from: https://nodejs.org/
    echo   Requires Node.js v18+ ^(recommended: v20+^)
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER% found

:: ─── Check npm ─────────────────────────────────────────────
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed.
    echo   It comes bundled with Node.js.
    pause
    exit /b 1
)
echo [OK] npm found

:: ─── Install Server Dependencies ───────────────────────────
echo.
echo [1/3] Installing server dependencies...
cd /d "%~dp0server"
call npm install --production
if %errorlevel% neq 0 (
    echo [ERROR] Server npm install failed.
    pause
    exit /b 1
)
echo [OK] Server dependencies installed

:: ─── Build Client (if needed) ──────────────────────────────
echo.
echo [2/3] Installing client dependencies...
cd /d "%~dp0client"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Client npm install failed.
    pause
    exit /b 1
)
echo [OK] Client dependencies installed

echo.
echo [2.5/3] Building client for production...
cd /d "%~dp0client"
call npm run build
if %errorlevel% neq 0 (
    echo [WARN] Client build failed — dev mode will still work.
) else (
    echo [OK] Client build complete
)

echo.
echo [2.75/3] Verifying TensorFlow.js...
cd /d "%~dp0server"
node -e "try { require('@tensorflow/tfjs'); console.log('[OK] @tensorflow/tfjs'); } catch(e) { console.log('[MISSING] @tensorflow/tfjs'); process.exit(1); }"

:: ─── Verify .env ────────────────────────────────────────────
echo.
echo [3/3] Checking server .env configuration...
if not exist "%~dp0server\.env" (
    echo [WARN] No .env file found. Creating default...
    (
        echo # Data Provider API Keys
        echo PUBLIC_API_KEY=your_public_com_key_here
        echo FINNHUB_TOKEN=cuelud9r01qkqnpfhbtgcuelud9r01kqnpfhbu0
    ) > "%~dp0server\.env"
    echo [OK] Default .env created
) else (
    echo [OK] .env file exists
)

:: ─── Verify critical modules ────────────────────────────────
echo.
echo Verifying critical modules...
cd /d "%~dp0server"
node -e "try { require('better-sqlite3'); console.log('[OK] better-sqlite3'); } catch(e) { console.log('[MISSING] better-sqlite3'); process.exit(1); }"
if %errorlevel% neq 0 (
    echo [ERROR] better-sqlite3 failed to load. Try: cd server ^&^& npm rebuild better-sqlite3
    pause
    exit /b 1
)
node -e "try { require('express'); console.log('[OK] express'); } catch(e) { console.log('[MISSING] express'); process.exit(1); }"
node -e "try { require('cors'); console.log('[OK] cors'); } catch(e) { console.log('[MISSING] cors'); process.exit(1); }"
node -e "try { require('ml-random-forest'); console.log('[OK] ml-random-forest'); } catch(e) { console.log('[MISSING] ml-random-forest'); process.exit(1); }"
node -e "try { require('yahoo-finance2'); console.log('[OK] yahoo-finance2'); } catch(e) { console.log('[MISSING] yahoo-finance2'); process.exit(1); }"

echo.
cd /d "%~dp0client"
node -e "try { require('react'); console.log('[OK] react'); } catch(e) { console.log('[MISSING] react'); process.exit(1); }"
node -e "try { require('recharts'); console.log('[OK] recharts'); } catch(e) { console.log('[MISSING] recharts'); process.exit(1); }"

:: ─── Done ──────────────────────────────────────────────────
echo.
echo ============================================
echo  Setup complete!
echo ============================================
echo.
echo  To start the app, run:  start.bat
echo  Or manually:
echo    Server:  cd server ^&^& node index.js
echo    Client:  cd client ^&^& npm run dev
echo.
echo  Backend:  http://localhost:4000
echo  Frontend: http://localhost:5173
echo.
pause