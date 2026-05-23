<#
.SYNOPSIS
Stores a deploy environment's database password into PowerShell SecretStore via a
GUI credential prompt, avoiding the Windows console multi-line / paste fragility.

.DESCRIPTION
Uses Get-Credential to capture the password via the native Windows credential dialog,
which handles paste reliably (unlike Read-Host -AsSecureString which can drop all
characters after the first on some ConHost configurations).

Validates the captured length before writing to SecretStore. The secret name is
resolved from scripts/deploy-config.json by environment, so this script stays in
sync with the wrapper.

.PARAMETER Environment
The deploy environment: 'staging' or 'prod'.

.EXAMPLE
.\scripts\store-deploy-password.ps1 staging

.NOTES
Prerequisites (one-time, from setup):
  Install-Module Microsoft.PowerShell.SecretManagement, Microsoft.PowerShell.SecretStore -Scope CurrentUser -Force
  Register-SecretVault -Name PolicyPilot -ModuleName Microsoft.PowerShell.SecretStore -DefaultVault
  Set-SecretStoreConfiguration -Authentication None -Interaction None -Confirm:$false
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateSet('staging', 'prod')]
  [string]$Environment
)

$ErrorActionPreference = 'Stop'
$scriptName = $MyInvocation.MyCommand.Name

$configPath = Join-Path $PSScriptRoot 'deploy-config.json'
if (-not (Test-Path $configPath)) {
  Write-Error "[$scriptName] Config file missing: $configPath"
  exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$envConfig = $config.$Environment
if (-not $envConfig -or -not $envConfig.secretName) {
  Write-Error "[$scriptName] No config entry / secretName for environment '$Environment'"
  exit 1
}

$secretName = $envConfig.secretName

Write-Host ""
Write-Host "Storing the database password for environment: $Environment"
Write-Host "SecretStore secret name:                       $secretName"
Write-Host ""
Write-Host "A Windows credential dialog will appear next. Paste the password into the"
Write-Host "Password field (the UserName field is just a label, leave it as '$Environment')."
Write-Host ""

$cred = Get-Credential -UserName $Environment -Message "Paste the Supabase $Environment database password into the Password field below"

if (-not $cred) {
  Write-Host "Cancelled (Get-Credential returned null)." -ForegroundColor Yellow
  exit 1
}

# Extract password for length validation only
$plain = $cred.GetNetworkCredential().Password
$len = $plain.Length
$plain = $null
[System.GC]::Collect()

Write-Host "Captured: $len chars"

if ($len -lt 8) {
  Write-Host "REJECTED: only $len chars captured. The dialog paste did not capture the full password - try re-running this script. If it keeps failing, type the password manually into the dialog instead of pasting." -ForegroundColor Red
  exit 1
}

if ($len -gt 128) {
  Write-Host "REJECTED: $len chars is unusually long. Did you paste a connection URL by mistake instead of just the password? Only the password component should be entered." -ForegroundColor Red
  exit 1
}

# Compute SHA prefix for verification (one-way, safe to display)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($cred.GetNetworkCredential().Password)
$sha = (New-Object System.Security.Cryptography.SHA256Managed).ComputeHash($bytes)
$hex8 = -join ($sha[0..3] | ForEach-Object { $_.ToString('x2') })
$bytes = $null

Set-Secret -Name $secretName -Secret $cred.Password -Vault PolicyPilot

Write-Host ""
Write-Host "OK: stored $len chars into SecretStore as '$secretName'" -ForegroundColor Green
Write-Host "SHA256[0..3] (one-way verification token): $hex8"
Write-Host ""
Write-Host "Next step: pnpm db:verify:staging  (pre-flight) -- or db:migrate:staging directly if you trust the pre-flight will reach the DB."
