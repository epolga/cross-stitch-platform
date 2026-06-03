# deploy.ps1 — Build and deploy the Lambda function + EventBridge rule.
# Run from automation/pinterest-agent/:  .\lambda\deploy.ps1
#
# Prerequisites:
#   - AWS CLI configured (aws configure) with a profile that can create/update Lambda + EventBridge + IAM
#   - npm run build:lambda must succeed first (or this script does it for you)
#
# What this does:
#   1. Builds the esbuild bundle
#   2. Creates the Lambda execution role (once; idempotent)
#   3. Zips the bundle
#   4. Creates or updates the Lambda function
#   5. Creates or updates the EventBridge rule (daily at 02:00 UTC = 05:00 UTC+3)
#   6. Adds Lambda permission for EventBridge to invoke it

$ErrorActionPreference = "Stop"

$FUNCTION_NAME  = "cross-stitch-daily-pipeline"
$ROLE_NAME      = "cross-stitch-lambda-pipeline"
$RULE_NAME      = "cross-stitch-daily-5am"
$REGION         = "us-east-1"
$TIMEOUT_SEC    = 900   # 15 minutes (Lambda maximum)
$MEMORY_MB      = 1024

# ── 1. Build bundle ───────────────────────────────────────────────────────────
Write-Host "Building Lambda bundle..." -ForegroundColor Cyan
npm run "build:lambda"
if ($LASTEXITCODE -ne 0) { throw "esbuild failed" }

# ── 2. Ensure IAM execution role exists ──────────────────────────────────────
Write-Host "Checking IAM role $ROLE_NAME..." -ForegroundColor Cyan

$roleArn = aws iam get-role --role-name $ROLE_NAME --query "Role.Arn" --output text 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Creating role..." -ForegroundColor Yellow

    $trustPolicy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    aws iam create-role `
        --role-name $ROLE_NAME `
        --assume-role-policy-document $trustPolicy `
        --description "Execution role for cross-stitch daily pipeline Lambda" | Out-Null

    # Basic Lambda logs
    aws iam attach-role-policy `
        --role-name $ROLE_NAME `
        --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" | Out-Null

    # DynamoDB — CrossStitchBusinessHistory (read + write) and CrossStitchItems (read/scan)
    $ddbPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem","dynamodb:GetItem","dynamodb:Query",
        "dynamodb:BatchWriteItem","dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:$REGION:*:table/CrossStitchBusinessHistory"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:Scan","dynamodb:Query"],
      "Resource": [
        "arn:aws:dynamodb:$REGION:*:table/CrossStitchItems",
        "arn:aws:dynamodb:$REGION:*:table/CrossStitchItems/index/*"
      ]
    }
  ]
}
"@
    aws iam put-role-policy `
        --role-name $ROLE_NAME `
        --policy-name "CrossStitchDynamoDB" `
        --policy-document $ddbPolicy | Out-Null

    # S3 — cross-stitch-ai-reports
    $s3Policy = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject","s3:GetObject"],
    "Resource": "arn:aws:s3:::cross-stitch-ai-reports/*"
  }]
}
"@
    aws iam put-role-policy `
        --role-name $ROLE_NAME `
        --policy-name "CrossStitchS3" `
        --policy-document $s3Policy | Out-Null

    # SES — send from ann@cross-stitch.com
    $sesPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "ses:SendEmail",
    "Resource": "*",
    "Condition": {
      "StringEquals": {"ses:FromAddress": "ann@cross-stitch.com"}
    }
  }]
}
"@
    aws iam put-role-policy `
        --role-name $ROLE_NAME `
        --policy-name "CrossStitchSES" `
        --policy-document $sesPolicy | Out-Null

    Write-Host "  Role created. Waiting 10s for IAM propagation..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    $roleArn = aws iam get-role --role-name $ROLE_NAME --query "Role.Arn" --output text
}

Write-Host "  Role ARN: $roleArn" -ForegroundColor Green

# ── 3. Zip the bundle ─────────────────────────────────────────────────────────
Write-Host "Zipping bundle..." -ForegroundColor Cyan
$zipPath = "lambda\dist\handler.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath }
Compress-Archive -Path "lambda\dist\handler.js" -DestinationPath $zipPath
Write-Host "  $zipPath created" -ForegroundColor Green

# ── 4. Create or update Lambda function ──────────────────────────────────────
Write-Host "Deploying Lambda function $FUNCTION_NAME..." -ForegroundColor Cyan

$exists = aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Creating function (first deploy)..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ACTION REQUIRED: Set environment variables in the Lambda console before the first run." -ForegroundColor Red
    Write-Host "  See lambda\env-vars.md for the full list." -ForegroundColor Red
    Write-Host ""

    aws lambda create-function `
        --function-name $FUNCTION_NAME `
        --runtime "nodejs20.x" `
        --role $roleArn `
        --handler "handler.handler" `
        --zip-file "fileb://$zipPath" `
        --timeout $TIMEOUT_SEC `
        --memory-size $MEMORY_MB `
        --region $REGION `
        --description "Cross-stitch daily pipeline: reports, AI analysis, Pinterest metrics, SES summary" | Out-Null
} else {
    Write-Host "  Updating existing function code..." -ForegroundColor Yellow
    aws lambda update-function-code `
        --function-name $FUNCTION_NAME `
        --zip-file "fileb://$zipPath" `
        --region $REGION | Out-Null

    aws lambda update-function-configuration `
        --function-name $FUNCTION_NAME `
        --timeout $TIMEOUT_SEC `
        --memory-size $MEMORY_MB `
        --region $REGION | Out-Null
}

$functionArn = aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query "Configuration.FunctionArn" --output text
Write-Host "  Function ARN: $functionArn" -ForegroundColor Green

# ── 5. EventBridge rule — daily at 02:00 UTC (05:00 UTC+3) ───────────────────
Write-Host "Setting up EventBridge rule $RULE_NAME..." -ForegroundColor Cyan

$ruleArn = aws events put-rule `
    --name $RULE_NAME `
    --schedule-expression "cron(0 2 * * ? *)" `
    --state ENABLED `
    --description "Triggers cross-stitch daily pipeline at 05:00 local (02:00 UTC)" `
    --region $REGION `
    --query "RuleArn" --output text

Write-Host "  Rule ARN: $ruleArn" -ForegroundColor Green

# ── 6. Add Lambda as EventBridge target ──────────────────────────────────────
aws events put-targets `
    --rule $RULE_NAME `
    --targets "Id=1,Arn=$functionArn" `
    --region $REGION | Out-Null

# Grant EventBridge permission to invoke Lambda (idempotent via statement ID)
aws lambda remove-permission `
    --function-name $FUNCTION_NAME `
    --statement-id "AllowEventBridge" `
    --region $REGION 2>$null
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
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Set environment variables in Lambda console (see lambda\env-vars.md)"
Write-Host "  2. Test manually: aws lambda invoke --function-name $FUNCTION_NAME --payload '{}' --region $REGION /tmp/out.json && cat /tmp/out.json"
Write-Host "  3. Once verified, disable the Windows Task Scheduler task: schtasks /Change /TN PinterestDailyReport /Disable"
