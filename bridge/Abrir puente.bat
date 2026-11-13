@echo off
rem Doble clic para abrir el puente de la sede.
rem - Pide permiso de administrador (Windows pregunta "¿Permitir…?": Si).
rem - La primera vez deja instalado que arranque solo al entrar a Windows.
rem - Abre el puente en esta ventana. Si ya habia uno corriendo, avisa.
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

schtasks /query /tn "Puente Monarca" >nul 2>&1
if errorlevel 1 (
  schtasks /create /tn "Puente Monarca" /tr "\"%~dp0iniciar-puente.bat\"" /sc onlogon /rl highest /f >nul
  if errorlevel 1 (
    echo No pude dejar instalado el arranque automatico. El puente abre igual.
  ) else (
    echo Listo: desde ahora el puente arranca solo al entrar a Windows.
  )
  echo.
)

title Puente Monarca
python puente.py
if %errorlevel%==3 (
  echo Muestro lo que va haciendo el puente que ya esta corriendo. Para salir, cerra esta ventana.
  echo.
  powershell -NoProfile -Command "Get-Content -Path 'puente.log' -Tail 15 -Wait -Encoding UTF8"
)
echo.
echo El puente se cerro. Para volver a abrirlo, doble clic en "Abrir puente".
pause
