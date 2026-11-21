@echo off
rem Klavye DJ - cift tikla calistir. Ilk seferde paketleri kurar, sonra uygulamayi acar.
cd /d "%~dp0"
if not exist node_modules (
  echo Paketler kuruluyor, bu bir kez olur...
  call npm.cmd install || (echo Kurulum basarisiz. & pause & exit /b 1)
)
echo Klavye DJ baslatiliyor. Kapatmak icin bu pencereyi kapat.
call npm.cmd run dev -- --open
pause
