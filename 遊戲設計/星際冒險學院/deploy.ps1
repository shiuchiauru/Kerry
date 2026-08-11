# 星際冒險學院 部署到 Firebase Hosting
# 1. 把雲端硬碟上的最新程式同步到本機執行資料夾
# 2. 建置正式版
# 3. 上傳到 Firebase Hosting

$ErrorActionPreference = 'Stop'
$runFolder = 'C:\star-academy-web'
$sourceFolder = Join-Path $PSScriptRoot 'web'

function Write-Step($text) { Write-Host "  $text" -ForegroundColor Cyan }

Write-Host ''
Write-Host '  部署星際冒險學院到雲端' -ForegroundColor Yellow
Write-Host '  ----------------------------------------'

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  Write-Host '  找不到 firebase 指令，請先執行：npm install -g firebase-tools' -ForegroundColor Red
  Read-Host '  按 Enter 關閉'
  exit 1
}
if (-not (Test-Path (Join-Path $runFolder 'node_modules'))) {
  Write-Host '  還沒建立執行環境，請先點一次「啟動星際冒險學院.bat」。' -ForegroundColor Red
  Read-Host '  按 Enter 關閉'
  exit 1
}

Write-Step '同步雲端硬碟上的最新程式…'
foreach ($folder in @('src', 'public')) {
  $from = Join-Path $sourceFolder $folder
  if (Test-Path $from) {
    robocopy $from (Join-Path $runFolder $folder) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  }
}
foreach ($file in @('index.html', 'game.html', 'vite.config.ts', 'package.json',
                    'tsconfig.json', 'tsconfig.app.json', 'postcss.config.js',
                    'tailwind.config.js', '.env.local', 'firebase.json', '.firebaserc')) {
  $from = Join-Path $sourceFolder $file
  if (Test-Path $from) { Copy-Item $from -Destination $runFolder -Force }
}

Push-Location $runFolder
try {
  Write-Step '建置正式版…'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw '建置失敗，請把畫面訊息貼給 Claude。' }

  Write-Step '上傳到 Firebase Hosting…'
  firebase deploy --only hosting
  if ($LASTEXITCODE -ne 0) { throw '上傳失敗。若提示未登入，請先執行：firebase login' }
} catch {
  Write-Host ''
  Write-Host "  $_" -ForegroundColor Red
  Pop-Location
  Read-Host '  按 Enter 關閉'
  exit 1
}
Pop-Location

Write-Host ''
Write-Host '  ----------------------------------------'
Write-Host '  完成，網址：' -ForegroundColor Green
Write-Host '    教師管理中心  https://teacherstudy-503912.web.app/'
Write-Host '    遊戲前台      https://teacherstudy-503912.web.app/game.html'
Write-Host ''
Write-Host '  這是固定網址，任何裝置直接開，不必開伺服器、不必管 IP。' -ForegroundColor Gray
Write-Host '  之後改了程式，再點一次這個檔案重新部署即可。' -ForegroundColor Gray
Write-Host ''
Read-Host '  按 Enter 關閉'
