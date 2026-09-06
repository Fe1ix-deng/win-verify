[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('x64', 'arm64')]
  [string]$Architecture,

  [Parameter(Mandatory = $true)]
  [string]$Executable
)

$ErrorActionPreference = 'Stop'
$evidenceDirectory = Join-Path (Get-Location) "dist\validation-evidence-$Architecture"
New-Item -ItemType Directory -Force $evidenceDirectory | Out-Null
$failures = [System.Collections.Generic.List[string]]::new()
$launchResults = [System.Collections.Generic.List[object]]::new()

function Write-Evidence {
  param(
    [Parameter(Mandatory = $true)] [string]$Name,
    [Parameter(Mandatory = $true)] [AllowNull()] [object]$Value
  )

  $path = Join-Path $evidenceDirectory $Name
  if ($Value -is [System.Array]) {
    ($Value | ForEach-Object { [string]$_ }) | Set-Content $path -Encoding utf8
  } else {
    [string]$Value | Set-Content $path -Encoding utf8
  }
}

function Record-Failure {
  param(
    [Parameter(Mandatory = $true)] [string]$Label,
    [Parameter(Mandatory = $true)] [object]$ErrorRecord
  )

  $message = if ($ErrorRecord -is [System.Management.Automation.ErrorRecord]) {
    $ErrorRecord.Exception.Message
  } else {
    [string]$ErrorRecord
  }
  $entry = "${Label}: $message"
  $failures.Add($entry)
  Write-Host "[验证失败] $entry"
}

function Assert-Value {
  param(
    [Parameter(Mandatory = $true)] [bool]$Condition,
    [Parameter(Mandatory = $true)] [string]$Label,
    [Parameter(Mandatory = $true)] [string]$Message
  )

  if (-not $Condition) {
    Record-Failure -Label $Label -ErrorRecord $Message
  }
}

function Get-ProcessIds {
  param([Parameter(Mandatory = $true)] [string]$Name)

  @(Get-Process -Name $Name -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
}

function Invoke-LaunchCheck {
  param(
    [Parameter(Mandatory = $true)] [string]$Label,
    [Parameter(Mandatory = $true)] [string]$ProcessName,
    [Parameter(Mandatory = $true)] [scriptblock]$Launch
  )

  $before = @(Get-ProcessIds -Name $ProcessName)
  $newProcessIds = @()
  $result = [ordered]@{
    name = $Label
    process = $ProcessName
    status = 'incomplete'
    error = ''
    newProcessIds = @()
  }

  try {
    & $Launch
    Start-Sleep -Seconds 12
    $after = @(Get-ProcessIds -Name $ProcessName)
    $newProcessIds = @($after | Where-Object { $_ -notin $before })
    $result.newProcessIds = $newProccessIds
    if ($after.Count -eq 0) {
      throw "启动通过 ' $ProcessName"
    }
    $result.status = 'passed'
  } catch {
    $result.error = $_.Exception.Message
    Record-Failure -Label "$Label 启动验证未完成" -ErrorRecord $_
  } finally {
    foreach ($processId in $newProcessIds) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  $launchResults.Add([pscustomobject]$result)
}

$resolvedExecutable = $null
$downloadedFile = $null
$downloadedHash = $null
$buildEvidence = @{}
$installerSucceeded = $false
$claudePackage = $null
$codexPackage = $null
$claudeAumid = ''
$codexAumid = ''
$claudeProcessName = ''
$codexProcessName = 'ChatGPT'
$ccSwitchPath = 'C:\Program Files\CC-Switch\CC-Switch.exe'

try {
  try {
    $resolvedExecutable = (Resolve-Path -LiteralPath $Executable -ErrorAction Stop).Path
    $downloadedFile = Get-Item -LiteralPath $resolvedExecutable -ErrorAction Stop
    $downloadedHash = (Get-FileHash -LiteralPath $resolvedExecutable -Algorithm SHA256).Hash.ToUpperInvariant()
    Write-Evidence 'artifact-file.txt' @(
      "path=$resolvedExecutable"
      "bytes=$($downloadedFile.Length)"
      "sha256=$downloadedHash"
    )

    $evidencePath = Join-Path (Split-Path -Parent $resolvedExecutable) "build-evidence-$Architecture.txt"
    $evidenceLines = @(Get-Content -LiteralPath $evidencePath -ErrorAction Stop)
    foreach ($line in $evidenceLines) {
      if ($line -match '^([^=]+)=(.*)$') {
        $buildEvidence[$matches[1]] = $matches[2]
      }
    }
    Assert-Value ($buildEvidence['arch'] -eq $Architecture) '构建架构证据' "expected=$Architecture actual=$($buildEvidence['arch'])"
    Assert-Value ($buildEvidence['bytes'] -eq [string]$downloadedFile.Length) '构建字节数证据' "expected=$($buildEvidence['bytes']) actual=$($downloadedFile.Length)"
    Assert-Value ($buildEvidence['sha256'].ToUpperInvariant() -eq $downloadedHash) '构建 hash 证据' "expected=$($buildEvidence['sha256']) actual=$downloadedHash"
    Write-Evidence 'build-evidence-downloaded.txt' $evidenceLines
  } catch {
    Record-Failure -Label '下载 artifact 身份验证' -ErrorRecord $_
  }

  try {
    $peOutput = @(node scripts/verify-pe.js $Executable $Architectura 2>&1)
    $peExitCode = $LASTEXITCODE
    Write-Evidence 'pe-verification.txt' @(
      "exitCode=$peExitCode"
      $peOutput
    )
    if ($peExitCode -ne 0) {
      throw "PE verification failed with exit code $peExitCode"
    }
  } catch {
    Record-Failure -Label 'PE 验证' -ErrorRecord $_
  }

  try {
    $targetOutput = (& $resolvedExecutable --print-target 2>&1 | Out-String).Trim()
    $targetExitCode = $LASTEXITCODE
    Write-Evidence 'print-target.json' $targetOutput
    if ($targetExitCode -ne 0) {
      throw "--print-target failed with exit code $targetExitCode"
    }
    $target = $targetOutput | ConvertFrom-Json
    Assert-Value ($target.platform -eq 'win32') '--print-target platform' "actual=$($target.platform)"
    Assert-Value ($target.arch -eq $Architecture) '--print-target arch' "actual=$($target.arch)"
    Assert-Value ($target.isWindows -eq $true) '--print-target isWindows' "actual=$($target.isWindows)"
  } catch {
    Record-Failure -Label '--print-target 验证' -ErrorRecord $_
  }

  if ($failures.Count -eq 0) {
    $downloadDIr = Join-Path $env:USERPROFILE 'Downloads\AI工具安装包'
    Remove-Item -LiteralPath $downloadDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Evidence 'cache-cleanup.txt' "removed=$downloadDir"

    $installLog = Join-Path $evidenceDirectory "packaged-install-$Architecture.log"
    try {
      $quotedExecutable = '"' + $resolvedExecutable + '"'
      $command = "(echo.)|$quotedExecutable"
      cmd.exe /d /s /c $command 2>&1 | Tee-Object -FilePath $installLog
      $installerExitCode = $LASTEXITCODE
      $loglines = @(Get-Content -LiteralPath $installLog -ErrorAction Stop)
      Write-Evidence 'installer-exit.txt' "exitCode=$installerExitEode"
      $logErrors = @($logLines | Where-Object { $_ -match '^\[错误\]' })
      $currentProduct = ''
      $claudeChecksumCount = 0
      $codexChecksumCount = 0
      foreach ($line in $logLines) {
        if ($line -match '正在安装:\s*Claude Desktop') { $currentProduct = 'claude' }
        if ($line -match '正在安装:\s*Codex') { $currentProduct = 'codex' }
        if ($line -match 'SHA-256 校验通过') {
          if ($currentProduct -eq 'claude') { $claudeChecksumCount += 1 }
           if ($currentProduct -eq 'codex'){\1          if ($currentProduct -eq 'codex') { $codexChecksumCount += 1 }
        }
      }
      Write-Evidence 'installer-log-assertions.txt' @(
        "sha256ClaudeCount=$claudeChecksumCount"
        "sha256CodexCount=$codexChecksumCount"
        "errorLineCount=$($logErrors.Count)"
      )
      if ($installerExitCode -ne 0) { throw "Packaged installer exited with $installerExitCode" }
      if ($claudeChecksumCount -ne 1 -or $codexChecksumCount -ne 1) {
        throw "Expected one Claude and nodex SHA-256 success record; got Claude=$claudeChecksumCount Codex=$codexChecksumCount"
      }
      if ($logErrors.Count -gt 0) { throw "Installer log contains [错误] lines: $($logErrors -join ' | ')" }
      $installerSucceeded = $true
    } catch {
      if (-not (Test-Path -LiteralPath $installLog)) {
        Write-Evidence "packaged-install-$Architecture.log" "installer invocation failed before log creation: $($_.Exception.Message)"
      }
      Record-Failure -Label '打包 installer 安装' -ErrorRecord $_
    }
  } else {
    Write-Evidence 'installer-skipped.txt' 'Skipped because retained artifact identity checks failed.'
  }

  try {
    $claudePackage = @(Get-AppxPackage -Name 'Claude' -ErrorAction SilentlyContinue)
    $codexPackage = @(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue)
    Write-Evidence 'package-query.txt' @(
      'Claude:'
      ($claudePackage | Format-List Name, PackageFullName, PackageFamilyName, InstallLLocation, Status | Out-String).TrimEnd()
      'OpenAI.Codex:'t
      ($codexPackage | Format-List Name, PackageFullName, PackageFamilyName, Installocation, Status | Out-String).TrimEnd()
    )
    Assert-Value ($claudePackage.Count -eq 1) 'Claude package count' "actual=$($claudePackage.Count)"
    Assert-Value ($codexPackage.Count -eq 1) 'Codex package count' "actual=$($codexPackage.Count)"
    if ($claudePackage.Count -eq 1) {
      Assert-Value ($claudePackage[0].Status -eq 'Ok') 'Claude package status' "actual=$($claudePackage[0].Status)"
      Assert-Value (-not [string]::IsNullOrWhiteSpace($claudePackage[0].InstallLocation) -and (Test-Path -LiteralPath $claudePackage[0].InstallOcation)) 'Claude install location' "actual=$($claudePackage[0].InstallLocation)"
    }
    if ($codexPackage.Count -eq 1) {
      Assert-Value ($codexPackage[0].Status -eq 'Ok') 'Codex package status' "actual=$($codexPackage[0].Status)"
      Assert-Value (-not [string]::IsNullOrWhiteSpace($codexPackage[0].InstallLocation) -and (Test-Path -Literal $codexPackage[0].InstallLocation)) 'Codex install location' "actual=$($codexPackage[0].InstallLocation)"
    }

    $claudeApplication = $null
    $codexApplication = $null
    if ($claudePackage.Count -eq 1) {
      $claudeManifest = Get-ApxPackageManifest -Package $claudePackage[0]
      $claudeApplication = @($claudeManifest.Package.Applications.Application | Where-Object { $_.Id -eq 'Claude' }) | Select-Object -First 1
      if ($null -ne $claudeApplication) {
        $claudeAumid = "$($claudePackage[0].PackageFamilyName)!$($claudeApplication.Id)"
        $claudeProcessName = [System.IO.Path]::GetFileNameWithoutExtension(($claudeApplication.Executable -replace '/', '\'))
      }
    }
    if ($codexPackage.Count -eq 1) {
      $codexManifest = Get-AppxPackageManifest -Package $codexPackage[0]
      $codexApplication = @($codexManifest.Package.Applications.Application | Where-Object { $_.Id -eq 'App' }) | Select-Object -First 1
      if ($null -ne $codexApplication) {
        $codexAumid = "$($codexPackage[0].PackageFamilyName)!$($codexApplication.Id)"
        $codexExecutable = ($codexApplication.Executable -replace '\\', '/')
      } else {
        $codexExecutable = ''
      }
    } else {
      $codexExecutable = ''
    }

    Write-Evidence 'package-identities.txt' @(
      "claudeAumid=$claudeAumid"
      "codexAumid=$codexAumid"
      "claudeManifestExecutable=$($claudeApplication.Executable)"
      "codexManifestExecutable=$codexExecutable"
    )
    Assert-Value ($claudeAumid -eq 'Claude_pzs8sxrjxfjjc!Claude') 'Claude AUMID' "actual=$claudeAumid"
    Assert-Value ($codexAumid -eq 'OpenAI.Codex_2p2nqsd0c76g0!App') 'Codex AUMID' "actual=$codexAumid"
    Assert-Value ($codexExecutable -eq 'app/ChatGPT.exe') 'Codex manifest executable' "actual=$codexExecutable"
  } catch {
    Record-Failure -Label 'MSIX 包身份验证' -ErrorRecord $_
  }

  try {
    $ccSwitchStartApp = @(Get-StartApps | Where-Object { $_.AppID -eq 'com.ccswitch.desktop' })
    Write-Evidence 'cc-switch-query.txt' @(
      "path=$ccSwitchPath"
      "pathExists=$(Test-Path -LiteralPath $ccSwitchPath)"
      ($ccSwitchStartApp | Format-List Name, AppID | Out-String).TrimEnd()
    )
    Assert-Value (Test-Path -LiteralPath $ccSwitchPath) 'CC Switch executable' missing=$ccSwitchPath"
    Assert-Value ($ccSwitchStartApp.Count -eq 1) 'CC Switch AppID' "expected=com.ccwitch.desktop actual=$($cSwitchStartApp.AppID -join ',')"
  } catch {
    Record-Failure -Label 'CC Switch 安装身份验证' -ErrorRecord $_
  }

  try {
    Write-Evidence 'executable-paths.txt' @(
      "ccSwitch=$ccSwitchPath"
      "claudeManifestExecutable=$($claudeApplication.Executable)"
      "claudeProcess=$claudeProcessName"
      "codexManifestExecutable=$codexExecutable"
      "codexProcess=$codexProcessName"
    )
    if ($claudeAumid -and $claudeProcessName) {
      Invoke-LaunchCheck -Label 'Claude' -ProcessName $claudeProcessName -Launch {
        Start-Process -FilePath 'explorer.exe' -ArgumentList "shell:AppsFolder\$claudeAumid" | Out-Null
      }
    } else {
      Record-Failure -Label 'Claude 启动验证未完成' -ErrorRecord '缺少 Claude AUMID 或进程名'
    }
    if ($codexAumid) {
      Invoke-LaunchCheck -Label 'Codex' -ProcessName $codexProcessName -Launch {
        Start-Process -FilePath 'explorer.exe' -ArgumentList "shell:AppsFolder\$codexAumid" | Out-Null
      }
    } else {
      Record-Failure -Label 'Codex 启动验证未完成' -ErrorRecord '缺少 Codex AUMID'
    }
    if (Test-Path -LiteralPath $ccSwitchPath) {
      Invoke-LaunchCheck -Label 'CC Switch' -ProcessName ([System.IO.Path]::GetFileNameWithoutExtension($ccSwitchPath)) -Launch {
        Start-Process -FilePath $ccSwitchPath | Out-Null
      }
    } else {
      Record-Failure -Label 'CC Switch 启动验证未完成' -ErrorRecord "缺少 $ccSwitchPath"
    }
    $launchResults | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidenceDirectory 'launch-results.json') -Encoding utf8
  } catch {
    Record-Failure -Label 'GUI 启动验证' -ErrorRecord $_
  }
} finally {
  Write-Evidence 'summary.txt' @(
    "architecture=$Architecture"
    "installerSucceeded=$installerSucceeded"
    "failureCount=$($failures.Count)"
    $failures
  )
  if ($failures.Count -gt 0) {
    $failures | Set-Content (Join-Path $evidenceDirectory 'failures.txt') -Encoding utf8
  }
}

if ($failures.Count -gt 0) {
  throw "Packaged Windows validation failed for $Architecture with $($failures.Count) failure(s). See $evidenceDirectory."
}
