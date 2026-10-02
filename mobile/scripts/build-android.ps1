$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path $PSScriptRoot -Parent
$studioJava = 'C:\Program Files\Android\Android Studio\jbr'
$localJava = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Unihome\tools\jdk-21*') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($localJava) { $env:JAVA_HOME = $localJava.FullName }
elseif (-not $env:JAVA_HOME -and (Test-Path "$studioJava\bin\java.exe")) { $env:JAVA_HOME = $studioJava }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $env:ANDROID_HOME)) { throw 'Android SDK missing. Install it using Android Studio SDK Manager.' }
Push-Location $mobileRoot
try {
  & npm.cmd run sync
  if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
  Push-Location (Join-Path $mobileRoot 'android')
  try {
    & .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
  } finally { Pop-Location }
  $outputDir = Join-Path $mobileRoot 'dist'
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $mobileRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $outputDir 'unihome-debug.apk')
  Write-Host "APK: $outputDir\unihome-debug.apk"
} finally { Pop-Location }
