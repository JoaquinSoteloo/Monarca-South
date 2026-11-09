@echo off
rem Arranca el puente de la sede sin ventana. Poner un acceso directo a este
rem archivo en la carpeta de Inicio de Windows (Win+R, escribir shell:startup).
cd /d "%~dp0"
start "" pythonw puente.py
