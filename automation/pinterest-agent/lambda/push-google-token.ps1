# push-google-token.ps1 — After running `npm run setup-token` locally,
# run this script to update the Lambda env var with the new refresh token.
# Run from automation/pinterest-agent/:  .\lambda\push-google-token.ps1

$FUNCTION_NAME = "cross-stitch-daily-pipeline"
$REGION        = "us-east-1"
$ENV_FILE      = Join-Path $PSScriptRoot ".." ".env"

# Read new token from .env
$token = Get-Content $ENV_FILE |
    Where-Object { $_ -match "^GOOGLE_REFRESH_TOKEN=" } |
    ForEach-Object { ($_ -split "=", 2)[1] } |
    Select-Object -First 1

if (-not $token) { Write-Error "GOOGLE_REFRESH_TOKEN not found in .env"; exit 1 }
Write-Host "New token: $($token.Substring(0,20))..." -ForegroundColor Cyan

# Fetch current Lambda env vars
$current = aws lambda get-function-configuration `
    --function-name $FUNCTION_NAME --region $REGION `
    --query "Environment.Variables" --output json | ConvertFrom-Json

# Build updated vars hash
$vars = @{}
$current.PSObject.Properties | ForEach-Object { $vars[$_.Name] = $_.Value }
$vars["GOOGLE_REFRESH_TOKEN"] = $token

# Serialise to JSON without BOM
$tmpDir  = [System.IO.Path]::GetTempPath()
$envFile = Join-Path $tmpDir "lambda-env.json"
$envJson = "{`"Variables`":{" + ($vars.GetEnumerator() | ForEach-Object {
    "`"$($_.Key)`":`"$($_.Value)`""
} | Join-String -Separator ",") + "}}"
[System.IO.File]::WriteAllText($envFile, $envJson)

aws lambda update-function-configuration `
    --function-name $FUNCTION_NAME --region $REGION `
    --environment "file://$($envFile.Replace('\','/'))" | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Lambda GOOGLE_REFRESH_TOKEN updated." -ForegroundColor Green
} else {
    Write-Error "update-function-configuration failed"
}
