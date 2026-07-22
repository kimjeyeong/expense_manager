param(
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverUrl = 'http://127.0.0.1:4173'
$bundledNode = 'C:\Users\01057\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$dataDirectory = Join-Path $projectDirectory 'data'
$serverLog = Join-Path $dataDirectory 'server.log'
$errorLog = Join-Path $dataDirectory 'server-error.log'

function Test-TravelServer {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $serverUrl -TimeoutSec 1
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $dataDirectory)) {
    New-Item -ItemType Directory -Path $dataDirectory | Out-Null
}

if (-not (Test-TravelServer)) {
    if (Test-Path -LiteralPath $bundledNode) {
        $nodeExecutable = $bundledNode
    }
    else {
        $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeCommand) {
            throw 'Node.js 실행 파일을 찾을 수 없습니다.'
        }
        $nodeExecutable = $nodeCommand.Source
    }

    Start-Process `
        -FilePath $nodeExecutable `
        -ArgumentList 'server.js' `
        -WorkingDirectory $projectDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $serverLog `
        -RedirectStandardError $errorLog

    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        if (Test-TravelServer) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        $detail = if (Test-Path -LiteralPath $errorLog) { Get-Content -Raw -LiteralPath $errorLog } else { '오류 기록이 없습니다.' }
        throw "서버가 준비되지 않았습니다.`n$detail"
    }
}

if (-not $NoOpen) {
    Start-Process $serverUrl
}

Write-Host '여비온 서버가 실행 중입니다.' -ForegroundColor Green
Write-Host $serverUrl
