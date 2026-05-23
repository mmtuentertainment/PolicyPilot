<#
.SYNOPSIS
Runs a command with database credentials materialized into env vars for the spawned child process only.

.DESCRIPTION
Pattern 3 of the credential-isolation discussion (2026-05-22): the database password lives only in
PowerShell SecretStore. At runtime this wrapper retrieves the password, constructs DATABASE_URL and
DIRECT_URL strings, sets them as environment variables for the spawned child process, then clears
them on exit (even if the child throws).

The password never lands in a file. The constructed URLs exist only in env for the lifetime of the
child process. After this script returns, env vars are restored to whatever they were before
(usually unset).

.PARAMETER Environment
The deploy environment: 'staging' or 'prod'. Mapped to scripts/deploy-config.json entries.

.PARAMETER Command
Remaining args form the command to spawn (e.g., tsx node_modules/drizzle-kit/bin.cjs migrate).

.EXAMPLE
./scripts/with-deploy-creds.ps1 staging tsx node_modules/drizzle-kit/bin.cjs migrate

.NOTES
One-time operator setup:
  Install-Module Microsoft.PowerShell.SecretManagement, Microsoft.PowerShell.SecretStore -Scope CurrentUser -Force
  Register-SecretVault -Name PolicyPilot -ModuleName Microsoft.PowerShell.SecretStore -DefaultVault
  Set-Secret -Name PolicyPilotStagingDB -Secret (Read-Host -AsSecureString -Prompt 'Paste staging password')
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateSet('staging', 'prod')]
  [string]$Environment,

  [Parameter(Mandatory, Position = 1, ValueFromRemainingArguments)]
  [string[]]$Command
)

$ErrorActionPreference = 'Stop'
$scriptName = $MyInvocation.MyCommand.Name

function Write-WrapperError {
  param([string]$Message)
  Write-Error "[$scriptName] $Message"
}

# --- Load deploy config ---
$configPath = Join-Path $PSScriptRoot 'deploy-config.json'
if (-not (Test-Path $configPath)) {
  Write-WrapperError "Config file missing: $configPath"
  exit 1
}

try {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
} catch {
  Write-WrapperError "Failed to parse $configPath as JSON: $_"
  exit 1
}

$envConfig = $config.$Environment
if (-not $envConfig) {
  Write-WrapperError "No config entry for environment '$Environment' in $configPath"
  exit 1
}

foreach ($field in 'host', 'poolerPort', 'directPort', 'user', 'database', 'secretName') {
  if (-not $envConfig.$field) {
    Write-WrapperError "Config for '$Environment' missing required field: $field"
    exit 1
  }
}

# Reject the prod placeholder until operator replaces it
if ($envConfig.user -like '*REPLACE_WITH_*') {
  Write-WrapperError "Config for '$Environment' has placeholder user '$($envConfig.user)'. Edit scripts/deploy-config.json with the real project_ref."
  exit 1
}

# --- Verify SecretStore is installed ---
$secretMgmtModule = Get-Module -ListAvailable -Name Microsoft.PowerShell.SecretManagement
if (-not $secretMgmtModule) {
  Write-WrapperError @"
SecretStore is not installed. One-time setup:

  Install-Module -Name Microsoft.PowerShell.SecretManagement, Microsoft.PowerShell.SecretStore -Scope CurrentUser -Force
  Register-SecretVault -Name PolicyPilot -ModuleName Microsoft.PowerShell.SecretStore -DefaultVault
  Set-SecretStoreConfiguration -Authentication None -Interaction None -Confirm:`$false
  Set-Secret -Name $($envConfig.secretName) -Secret (Read-Host -AsSecureString -Prompt 'Paste $Environment password')

Then re-run this script.
"@
  exit 1
}

# Note: we intentionally do NOT call Get-SecretStoreConfiguration here.
# When the vault is locked (Authentication=Password mode), even reading the config
# requires unlocking, which would prompt. Since this wrapper runs under
# powershell -NonInteractive (set in package.json), any prompt throws immediately
# rather than hanging. We let Get-Secret below produce that error, which we then
# catch and translate into clear Authentication=None setup guidance.

# --- Retrieve password ---
# -Vault PolicyPilot pins lookup to the vault that store-deploy-password.ps1
# writes to (Set-Secret -Vault PolicyPilot), avoiding multi-vault ambiguity
# if the operator has other registered SecretManagement vaults.
$password = $null
try {
  $password = Get-Secret -Name $envConfig.secretName -Vault PolicyPilot -AsPlainText -ErrorAction Stop
} catch {
  $errMsg = $_.Exception.Message
  # Two failure modes:
  # 1) Secret missing - operator never stored it
  # 2) Vault locked + powershell -NonInteractive in effect - prompt throws instead of hangs
  # Both produce different messages; surface guidance for both.
  Write-WrapperError @"
Failed to retrieve secret '$($envConfig.secretName)' from SecretStore.

Underlying error: $errMsg

If this is a 'cannot prompt in non-interactive mode' / 'host is non-interactive' error:
  The SecretStore vault is in Authentication=Password mode but this wrapper runs in non-interactive PowerShell. Switch the vault to non-interactive mode (one-time, requires your current master password):

    Set-SecretStoreConfiguration -Authentication None -Interaction None -Confirm:`$false

  The vault file remains encrypted at rest via Windows DPAPI (key tied to your Windows user account), so Pattern 3 isolation is preserved.

If this is a 'secret not found' error:
  The named secret doesn't exist in the vault. Store it:

    Set-Secret -Name $($envConfig.secretName) -Secret (Read-Host -AsSecureString -Prompt 'Paste $Environment password')
"@
  exit 1
}

if ([string]::IsNullOrWhiteSpace($password)) {
  Write-WrapperError "Retrieved an empty password for '$($envConfig.secretName)'. Did the Set-Secret command store an empty SecureString?"
  exit 1
}

# --- Construct URLs in script scope ---
# URL-encode the password component. Supabase auto-generated passwords can include
# URL-special characters (:, @, /, ?, #, &, %, [, ]). Embedding those literally in
# the URL breaks the postgres-js parser - e.g., a ':' in the password is mis-parsed
# as the port separator, leading to confusing 28P01 "password authentication failed"
# errors. [Uri]::EscapeDataString covers all reserved characters per RFC 3986.
$encodedPassword = [Uri]::EscapeDataString($password)
$databaseUrl = "postgres://$($envConfig.user):$encodedPassword@$($envConfig.host):$($envConfig.poolerPort)/$($envConfig.database)"
$directUrl   = "postgres://$($envConfig.user):$encodedPassword@$($envConfig.host):$($envConfig.directPort)/$($envConfig.database)"
$encodedPassword = $null

# Best-effort: clear the local password reference now that URLs are constructed.
# PowerShell strings are immutable, so the original string may still exist in memory until GC.
$password = $null
[System.GC]::Collect()

# --- Snapshot any pre-existing env vars so we can restore on exit ---
$originalDatabaseUrl = $env:DATABASE_URL
$originalDirectUrl = $env:DIRECT_URL

$exitCode = 1
try {
  $env:DATABASE_URL = $databaseUrl
  $env:DIRECT_URL = $directUrl

  # Clear the local URL variables; env now holds them. The child process inherits env on spawn.
  $databaseUrl = $null
  $directUrl = $null
  [System.GC]::Collect()

  # Spawn the inner command. The call operator (&) invokes external commands;
  # the array splat passes Command[1..] as separate arguments.
  $cmdExe = $Command[0]
  $cmdArgs = @()
  if ($Command.Length -gt 1) { $cmdArgs = $Command[1..($Command.Length - 1)] }

  & $cmdExe @cmdArgs
  $exitCode = $LASTEXITCODE
} finally {
  # Always restore env state, even if the inner command threw.
  if ($null -eq $originalDatabaseUrl) {
    if (Test-Path Env:DATABASE_URL) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  } else {
    $env:DATABASE_URL = $originalDatabaseUrl
  }
  if ($null -eq $originalDirectUrl) {
    if (Test-Path Env:DIRECT_URL) { Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue }
  } else {
    $env:DIRECT_URL = $originalDirectUrl
  }

  # Null out the originals too.
  $originalDatabaseUrl = $null
  $originalDirectUrl = $null
  [System.GC]::Collect()
}

exit $exitCode
