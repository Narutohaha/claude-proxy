@echo off
cd /d "%~dp0"
echo ========================================
echo Running: npx tsx src/index.ts
echo ========================================
call npx tsx src/index.ts
echo.
echo ========================================
echo Done!
pause