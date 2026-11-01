@echo off
rem Starts the Android emulator and opens Roomora with live updates.
rem Run "pnpm dev" in the roomora folder first, for the API.
set ANDROID_HOME=E:\Android\Sdk
set ANDROID_SDK_ROOT=E:\Android\Sdk
set ANDROID_AVD_HOME=E:\Android\avd
set ADB=E:\Android\Sdk\platform-tools\adb.exe

start "Roomora emulator" E:\Android\Sdk\emulator\emulator.exe -avd roomora -no-metrics -no-boot-anim
start "Roomora app server" /D "%~dp0..\apps\mobile" cmd /k npx expo start --web --port 8081

echo Waiting for Android to start. This can take about 2 minutes.
%ADB% wait-for-device
:boot
for /f %%b in ('%ADB% shell getprop sys.boot_completed') do if "%%b"=="1" goto ready
timeout /t 3 /nobreak >nul
goto boot
:ready
%ADB% reverse tcp:8081 tcp:8081
%ADB% reverse tcp:4000 tcp:4000
%ADB% shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081
echo Roomora is opening on the emulator.
