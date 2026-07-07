# deploy.ps1 — Build and deploy the Lambda function + EventBridge rule.
# Run from automation/pinterest-agent/:  .\lambda\deploy.ps1
#
# Prerequisites:
#   - AWS CLI installed and credentials configured (used by pipeline .env)
#   - Node.js / npm available

$FUNCTION_NAME  = "cross-stitch-daily-pipeline"
$ROLE_NAME      = "cross-stitch-lambda-pipeline"
$RULE_NAME      = "cross-stitch-daily-5am"
$REGION         = "us-east-1"
$TIMEOUT_SEC    = 900   # 15 minutes (Lambda maximum)
$MEMORY_MB      = 1024

# ── 1. Build bundle ───────────────────────────────────────────────────────────
Write-Host "Building Lambda bundle..." -ForegroundColor Cyan
npm run "build:lambda"
if ($LASTEXITCODE -ne 0) { Write-Error "esbuild failed"; exit 1 }

# ── 2. Ensure IAM execution role exists ──────────────────────────────────────
Write-Host "Checking IAM role $ROLE_NAME..." -ForegroundColor Cyan

# Capture both stdout and stderr; check exit code separately
$roleCheckOut = (aws iam get-role --role-name $ROLE_NAME --query "Role.Arn" --output text 2>&1)
$roleExists   = ($LASTEXITCODE -eq 0)

# Write policies to temp files without BOM — PowerShell 5.1 -Encoding utf8 adds a BOM that
# breaks AWS CLI JSON parsing; [System.IO.File]::WriteAllText writes plain UTF-8.
$tmpDir = [System.IO.Path]::GetTempPath()
$toFile = { param($path, $content) [System.IO.File]::WriteAllText($path, $content) }
$acctId  = (aws sts get-caller-identity --query Account --output text)

if (-not $roleExists) {
    Write-Host "  Creating role..." -ForegroundColor Yellow

    $trustFile = Join-Path $tmpDir "trust.json"
    & $toFile $trustFile '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    $trustUri = "file://" + $trustFile.Replace("\", "/")
    aws iam create-role `
        --role-name $ROLE_NAME `
        --assume-role-policy-document $trustUri `
        --description "Execution role for cross-stitch daily pipeline Lambda" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "create-role failed"; exit 1 }

    aws iam attach-role-policy `
        --role-name $ROLE_NAME `
        --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" | Out-Null

    # DynamoDB
    $ddbArn1 = "arn:aws:dynamodb:${REGION}:${acctId}:table/CrossStitchBusinessHistory"
    $ddbArn2 = "arn:aws:dynamodb:${REGION}:${acctId}:table/CrossStitchItems"
    $ddbArn3 = "arn:aws:dynamodb:${REGION}:${acctId}:table/CrossStitchItems/index/*"
    $ddbFile = Join-Path $tmpDir "policy-ddb.json"
    & $toFile $ddbFile "{`"Version`":`"2012-10-17`",`"Statement`":[{`"Effect`":`"Allow`",`"Action`":[`"dynamodb:PutItem`",`"dynamodb:GetItem`",`"dynamodb:Query`",`"dynamodb:BatchWriteItem`",`"dynamodb:UpdateItem`"],`"Resource`":`"$ddbArn1`"},{`"Effect`":`"Allow`",`"Action`":[`"dynamodb:Scan`",`"dynamodb:Query`"],`"Resource`":[`"$ddbArn2`",`"$ddbArn3`"]}]}"
    $ddbUri = "file://" + $ddbFile.Replace("\", "/")
    aws iam put-role-policy --role-name $ROLE_NAME --policy-name "CrossStitchDynamoDB" --policy-document $ddbUri | Out-Null

    # S3
    $s3File = Join-Path $tmpDir "policy-s3.json"
    & $toFile $s3File '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],"Resource":"arn:aws:s3:::cross-stitch-ai-reports/*"}]}'
    $s3Uri = "file://" + $s3File.Replace("\", "/")
    aws iam put-role-policy --role-name $ROLE_NAME --policy-name "CrossStitchS3" --policy-document $s3Uri | Out-Null

    # SES
    $sesFile = Join-Path $tmpDir "policy-ses.json"
    & $toFile $sesFile '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"ses:SendEmail","Resource":"*","Condition":{"StringEquals":{"ses:FromAddress":"ann@cross-stitch.com"}}}]}'
    $sesUri = "file://" + $sesFile.Replace("\", "/")
    aws iam put-role-policy --role-name $ROLE_NAME --policy-name "CrossStitchSES" --policy-document $sesUri | Out-Null

    Write-Host "  Role created. Waiting 10s for IAM propagation..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

$roleArn = (aws iam get-role --role-name $ROLE_NAME --query "Role.Arn" --output text)
Write-Host "  Role ARN: $roleArn" -ForegroundColor Green

# WAF: ensure the role can sync the AutoBlockedIPs IP set. Runs on every
# deploy (not just role creation) so a role created before this feature
# existed still picks up the permission.
$wafQuery = "IPSets[?Name=='AutoBlockedIPs'].ARN | [0]"
$autoBlockIpSetArn = (aws wafv2 list-ip-sets --scope REGIONAL --region $REGION --query $wafQuery --output text)
if ($autoBlockIpSetArn -and $autoBlockIpSetArn -ne "None") {
    $wafFile = Join-Path $tmpDir "policy-waf.json"
    & $toFile $wafFile "{`"Version`":`"2012-10-17`",`"Statement`":[{`"Effect`":`"Allow`",`"Action`":[`"wafv2:GetIPSet`",`"wafv2:UpdateIPSet`"],`"Resource`":`"$autoBlockIpSetArn`"}]}"
    $wafUri = "file://" + $wafFile.Replace("\", "/")
    aws iam put-role-policy --role-name $ROLE_NAME --policy-name "CrossStitchWAF" --policy-document $wafUri | Out-Null
    Write-Host "  WAF policy attached ($autoBlockIpSetArn)" -ForegroundColor Green
} else {
    Write-Host "  WARNING: AutoBlockedIPs IP set not found, WAF sync step will be skipped at runtime." -ForegroundColor Yellow
}

# Logs read: suspicious-IP detector needs to list/read ALB access logs.
# Runs on every deploy for the same reason as the WAF policy above.
$logsFile = Join-Path $tmpDir "policy-logs.json"
& $toFile $logsFile '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:ListBucket"],"Resource":"arn:aws:s3:::cross-stitch-logs"},{"Effect":"Allow","Action":["s3:GetObject"],"Resource":"arn:aws:s3:::cross-stitch-logs/*"}]}'
$logsUri = "file://" + $logsFile.Replace("\", "/")
aws iam put-role-policy --role-name $ROLE_NAME --policy-name "CrossStitchLogsRead" --policy-document $logsUri | Out-Null
Write-Host "  Logs-read policy attached (cross-stitch-logs)" -ForegroundColor Green

# ── 3. Zip the bundle ─────────────────────────────────────────────────────────
Write-Host "Zipping bundle..." -ForegroundColor Cyan
$zipPath = "lambda\dist\handler.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "lambda\dist\handler.js" -DestinationPath $zipPath
Write-Host "  $zipPath created" -ForegroundColor Green

# ── 4. Create or update Lambda function ──────────────────────────────────────
Write-Host "Deploying Lambda function $FUNCTION_NAME..." -ForegroundColor Cyan

$fnCheck = (aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>&1)
$fnExists = ($LASTEXITCODE -eq 0)

if (-not $fnExists) {
    Write-Host "  Creating function..." -ForegroundColor Yellow
    aws lambda create-function `
        --function-name $FUNCTION_NAME `
        --runtime "nodejs22.x" `
        --role $roleArn `
        --handler "handler.handler" `
        --zip-file "fileb://$zipPath" `
        --timeout $TIMEOUT_SEC `
        --memory-size $MEMORY_MB `
        --region $REGION `
        --description "Cross-stitch daily pipeline" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "create-function failed"; exit 1 }
} else {
    Write-Host "  Updating function code..." -ForegroundColor Yellow
    aws lambda update-function-code `
        --function-name $FUNCTION_NAME `
        --zip-file "fileb://$zipPath" `
        --region $REGION | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "update-function-code failed"; exit 1 }

    aws lambda update-function-configuration `
        --function-name $FUNCTION_NAME `
        --runtime "nodejs22.x" `
        --timeout $TIMEOUT_SEC `
        --memory-size $MEMORY_MB `
        --region $REGION | Out-Null
}

$functionArn = (aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query "Configuration.FunctionArn" --output text)
Write-Host "  Function ARN: $functionArn" -ForegroundColor Green

# ── 5. EventBridge rule — daily at 02:00 UTC (05:00 UTC+3) ───────────────────
Write-Host "Setting up EventBridge rule $RULE_NAME..." -ForegroundColor Cyan

$ruleArn = (aws events put-rule `
    --name $RULE_NAME `
    --schedule-expression "cron(0 2 * * ? *)" `
    --state ENABLED `
    --description "Triggers cross-stitch daily pipeline at 05:00 local (02:00 UTC)" `
    --region $REGION `
    --query "RuleArn" --output text)
Write-Host "  Rule ARN: $ruleArn" -ForegroundColor Green

# ── 6. Wire EventBridge → Lambda ─────────────────────────────────────────────
aws events put-targets --rule $RULE_NAME --targets "Id=1,Arn=$functionArn" --region $REGION | Out-Null

aws lambda remove-permission --function-name $FUNCTION_NAME --statement-id "AllowEventBridge" --region $REGION 2>&1 | Out-Null
aws lambda add-permission `
    --function-name $FUNCTION_NAME `
    --statement-id "AllowEventBridge" `
    --action "lambda:InvokeFunction" `
    --principal "events.amazonaws.com" `
    --source-arn $ruleArn `
    --region $REGION | Out-Null

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next: set env vars, then test:" -ForegroundColor Cyan
Write-Host "  aws lambda invoke --function-name $FUNCTION_NAME --payload '{}' --region $REGION out.json"
