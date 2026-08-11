# 星際冒險學院 一鍵啟動
# 1. 把雲端硬碟上的最新程式同步到本機執行資料夾
# 2. 啟動遊戲伺服器（已在跑就跳過）
# 3. 依目前的區網 IP 更新兩個網址捷徑
# 4. 開啟教師管理中心

$ErrorActionPreference = 'Stop'
$port = 5174
$runFolder = 'C:\star-academy-web'
$sourceFolder = Join-Path $PSScriptRoot 'web'

function Write-Step($text) { Write-Host "  $text" -ForegroundColor Cyan }

Write-Host ''
Write-Host '  星際冒險學院 啟動中' -ForegroundColor Yellow
Write-Host '  ----------------------------------------'

# --- 檢查環境 -------------------------------------------------------------
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host '  找不到 npm，請先安裝 Node.js。' -ForegroundColor Red
  Read-Host '  按 Enter 關閉'
  exit 1
}
if (-not (Test-Path $sourceFolder)) {
  Write-Host "  找不到程式資料夾 $sourceFolder" -ForegroundColor Red
  Write-Host '  請確認 Google 雲端硬碟已經同步完成。' -ForegroundColor Red
  Read-Host '  按 Enter 關閉'
  exit 1
}

# --- 第一次在這台電腦執行：建立本機執行資料夾 -----------------------------
# node_modules 有大量符號連結，Google 雲端硬碟同步不了，所以要在本機自己裝一次。
$firstRun = -not (Test-Path (Join-Path $runFolder 'node_modules'))
if ($firstRun) {
  Write-Host ''
  Write-Host '  這台電腦第一次執行，要先安裝執行環境。' -ForegroundColor Yellow
  Write-Host '  需要幾分鐘，請不要關掉視窗。' -ForegroundColor Yellow
  Write-Host ''
  New-Item -ItemType Directory -Path $runFolder -Force | Out-Null
  Write-Step '複製程式…'
  robocopy $sourceFolder $runFolder /E /XD node_modules dist .firebase-migration-backup /NFL /NDL /NJH /NJS /NP | Out-Null
  Write-Step '安裝套件（npm install）…'
  Push-Location $runFolder
  npm install --no-audit --no-fund
  $installFailed = $LASTEXITCODE -ne 0
  Pop-Location
  if ($installFailed -or -not (Test-Path (Join-Path $runFolder 'node_modules'))) {
    Write-Host '  套件安裝失敗，請確認這台電腦能連上網路。' -ForegroundColor Red
    Read-Host '  按 Enter 關閉'
    exit 1
  }
  Write-Step '安裝完成。'
}

# --- 同步程式 -------------------------------------------------------------
# 雲端硬碟是工作桌，但它同步不了 node_modules 裡的符號連結，所以在本機跑。
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

# --- 啟動伺服器 -----------------------------------------------------------
$running = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($running) {
  Write-Step '伺服器已經在執行，直接使用。'
} else {
  Write-Step '啟動遊戲伺服器…'
  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "npm run dev:lan -- --port $port --strictPort" `
    -WorkingDirectory $runFolder -WindowStyle Minimized
  $ready = $false
  foreach ($attempt in 1..60) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
  }
  if (-not $ready) {
    Write-Host '  伺服器啟動逾時，請看剛才開啟的小視窗有沒有錯誤訊息。' -ForegroundColor Red
    Read-Host '  按 Enter 關閉'
    exit 1
  }
}

# --- 顯示網址 -------------------------------------------------------------
# 這是本機測試用的伺服器。正式上課請用雲端網址（見「教師管理中心.url」），
# 那個不必開伺服器、換裝置換網路都能用。
$address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*' } |
  Select-Object -First 1
$lan = if ($address) { "http://$($address.IPAddress):$port" } else { $null }

Write-Host '  ----------------------------------------'
Write-Host "  本機測試   http://localhost:$port/"
if ($lan) { Write-Host "  同網段     $lan/" }
Write-Host ''
Write-Host '  這是「改完程式先看看對不對」用的。' -ForegroundColor Gray
Write-Host '  確認沒問題後，點「部署到雲端.bat」才會更新正式網站。' -ForegroundColor Gray
Write-Host '  上課請直接用雲端網址，不需要開這個伺服器。' -ForegroundColor Gray
Write-Host ''

Start-Process "http://localhost:$port/"
Start-Sleep -Seconds 3
