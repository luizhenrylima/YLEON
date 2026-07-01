param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDbUrl,

  [Parameter(Mandatory = $true)]
  [string]$TargetDbUrl,

  [string]$OutputDir = "supabase-transfer",

  [switch]$ApplyToTarget
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' was not found. Install Node.js/npm or add it to PATH before running this script."
  }
}

Require-Command "npx"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$transferDir = Join-Path (Resolve-Path ".") $OutputDir
New-Item -ItemType Directory -Path $transferDir -Force | Out-Null

$schemaFile = Join-Path $transferDir "source-public-schema-$timestamp.sql"
$dataFile = Join-Path $transferDir "source-public-data-$timestamp.sql"

Write-Host "Dumping public schema from source..."
npx --yes supabase@latest db dump --db-url $SourceDbUrl --schema public --file $schemaFile

Write-Host "Dumping public data from source..."
npx --yes supabase@latest db dump --db-url $SourceDbUrl --schema public --data-only --file $dataFile

Write-Host "Created:"
Write-Host "  $schemaFile"
Write-Host "  $dataFile"

if (-not $ApplyToTarget) {
  Write-Host ""
  Write-Host "Dry run complete. Re-run with -ApplyToTarget to execute these SQL dumps against the target database."
  exit 0
}

Write-Host "Applying schema to target..."
npx --yes supabase@latest db query --db-url $TargetDbUrl --file $schemaFile

Write-Host "Applying data to target..."
npx --yes supabase@latest db query --db-url $TargetDbUrl --file $dataFile

Write-Host "Done. Verify row counts and app access before switching production traffic."
