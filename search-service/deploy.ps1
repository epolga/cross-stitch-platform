# deploy.ps1 — Build and deploy search-service as a Lambda function behind
# an API Gateway HTTP API.
# Run from search-service/:  .\deploy.ps1
#
# Prerequisites:
#   - AWS CLI installed and credentials configured
#   - .venv already created with dependencies installed (see README-less
#     setup: python -m venv .venv; .venv\Scripts\pip install -r requirements.txt)
#
# Mirrors automation/pinterest-agent/lambda/deploy.ps1's structure (build →
# ensure role → zip → create-or-update function → wire trigger), adapted for
# Python/Lambda-behind-API-Gateway instead of Node.js/Lambda-behind-EventBridge.

$FUNCTION_NAME = "search-service"
$ROLE_NAME     = "search-service-lambda"
$API_NAME      = "search-service-api"
$REGION        = "us-east-1"
$TIMEOUT_SEC   = 10
$MEMORY_MB     = 256
$PYTHON_VER    = "3.13"

# ── 1. Build bundle ───────────────────────────────────────────────────────────
# Python packages must be pre-bundled for Lambda (no internet access to pip
# install at runtime), and built for Lambda's Linux runtime specifically —
# NOT whatever this script runs on. Packages with compiled native code
# (pydantic-core is the one in this project) ship a different binary per
# platform; building locally on Windows would bundle a Windows .pyd that
# can't execute on Lambda's Linux. --platform/--only-binary force pip to
# fetch the Linux (manylinux) wheel instead, no Docker needed.
Write-Host "Building Lambda bundle..." -ForegroundColor Cyan
if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
New-Item -ItemType Directory -Path "build" | Out-Null
New-Item -ItemType Directory -Path "dist" | Out-Null

& ".venv\Scripts\pip" install `
    --platform manylinux2014_x86_64 `
    --only-binary=:all: `
    --python-version $PYTHON_VER `
    --target build `
    -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed"; exit 1 }

Copy-Item -Path "app" -Destination "build\app" -Recurse
Compress-Archive -Path "build\*" -DestinationPath "dist\search-service.zip" -Force
Write-Host "  dist\search-service.zip created" -ForegroundColor Green

# ── 2. Ensure IAM execution role exists ──────────────────────────────────────
Write-Host "Checking IAM role $ROLE_NAME..." -ForegroundColor Cyan

$roleCheckOut = (aws iam get-role --role-name $ROLE_NAME --query "Role.Arn" --output text 2>&1)
$roleExists   = ($LASTEXITCODE -eq 0)

if (-not $roleExists) {
    Write-Host "  Creating role..." -ForegroundColor Yellow

    $tmpDir = [System.IO.Path]::GetTempPath()
    $trustFile = Join-Path $tmpDir "search-service-trust.json"
    [System.IO.File]::WriteAllText($trustFile, '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}')
    $trustUri = "file://" + $trustFile.Replace("\", "/")

    aws iam create-role `
        --role-name $ROLE_NAME `
        --assume-role-policy-document $trustUri `
        --description "Execution role for search-service Lambda" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "create-role failed"; exit 1 }

    # Basic execution only (CloudWatch Logs) — this code doesn't call any
    # other AWS service yet. Add scoped inline policies here later, once
    # Step 3 (the real feature) is scoped and known to need e.g. DynamoDB
    # access — same iterative-policy pattern as pinterest-agent's deploy.ps1.
    aws iam attach-role-policy `
        --role-name $ROLE_NAME `
        --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" | Out-Null

    Write-Host "  Role created. Waiting 10s for IAM propagation..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

$roleArn = (aws iam get-role --role-name $ROLE_NAME --query "Role.Arn" --output text)
Write-Host "  Role ARN: $roleArn" -ForegroundColor Green

# ── 3. Create or update Lambda function ──────────────────────────────────────
Write-Host "Deploying Lambda function $FUNCTION_NAME..." -ForegroundColor Cyan

$fnCheck = (aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>&1)
$fnExists = ($LASTEXITCODE -eq 0)

if (-not $fnExists) {
    Write-Host "  Creating function..." -ForegroundColor Yellow
    aws lambda create-function `
        --function-name $FUNCTION_NAME `
        --runtime "python$PYTHON_VER" `
        --role $roleArn `
        --handler "app.main.handler" `
        --zip-file "fileb://dist/search-service.zip" `
        --timeout $TIMEOUT_SEC `
        --memory-size $MEMORY_MB `
        --region $REGION `
        --description "Cross-Stitch search-service (retrieval evaluation, precision@k/recall@k/MRR)" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "create-function failed"; exit 1 }
    aws lambda wait function-active --function-name $FUNCTION_NAME --region $REGION
} else {
    Write-Host "  Updating function code..." -ForegroundColor Yellow
    aws lambda update-function-code `
        --function-name $FUNCTION_NAME `
        --zip-file "fileb://dist/search-service.zip" `
        --region $REGION | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "update-function-code failed"; exit 1 }

    # Code update returns as soon as AWS accepts the request but applies
    # asynchronously — calling update-function-configuration right after can
    # hit "ResourceConflictException: An update is in progress" (same issue
    # noted in pinterest-agent's deploy.ps1, 2026-07-27). Wait first.
    Write-Host "  Waiting for code update to finish applying..." -ForegroundColor Yellow
    aws lambda wait function-updated --function-name $FUNCTION_NAME --region $REGION
    if ($LASTEXITCODE -ne 0) { Write-Error "wait function-updated failed"; exit 1 }

    aws lambda update-function-configuration `
        --function-name $FUNCTION_NAME `
        --runtime "python$PYTHON_VER" `
        --timeout $TIMEOUT_SEC `
        --memory-size $MEMORY_MB `
        --region $REGION | Out-Null
}

$functionArn = (aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query "Configuration.FunctionArn" --output text)
Write-Host "  Function ARN: $functionArn" -ForegroundColor Green

# ── 4. Ensure API Gateway HTTP API exists, wired to this Lambda ──────────────
Write-Host "Checking API Gateway $API_NAME..." -ForegroundColor Cyan

$apiId = (aws apigatewayv2 get-apis --region $REGION --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text)

if (-not $apiId -or $apiId -eq "None") {
    Write-Host "  Creating API..." -ForegroundColor Yellow
    $apiId = (aws apigatewayv2 create-api `
        --name $API_NAME `
        --protocol-type HTTP `
        --target $functionArn `
        --region $REGION `
        --query "ApiId" --output text)
    if ($LASTEXITCODE -ne 0) { Write-Error "create-api failed"; exit 1 }
} else {
    Write-Host "  API already exists ($apiId) - routes to the current function version automatically, nothing to update here." -ForegroundColor Yellow
}

$apiEndpoint = (aws apigatewayv2 get-api --api-id $apiId --region $REGION --query "ApiEndpoint" --output text)
Write-Host "  API endpoint: $apiEndpoint" -ForegroundColor Green

# ── 5. Explicit invoke permission for API Gateway ────────────────────────────
# create-api --target is *supposed* to wire this automatically, but on
# 2026-08-06 it did not (curl through the API returned "Internal Server
# Error" with zero matching Lambda invocation logs, meaning the request
# never reached the function). Adding it explicitly and idempotently
# (remove-then-add, same pattern as the EventBridge permission step in
# pinterest-agent's deploy.ps1) closes that gap regardless of whether the
# quick-create flow handles it correctly on a given run.
Write-Host "Ensuring API Gateway has permission to invoke the function..." -ForegroundColor Cyan
$sourceArn = "arn:aws:execute-api:${REGION}:$((aws sts get-caller-identity --query Account --output text)):$apiId/*/*"

aws lambda remove-permission --function-name $FUNCTION_NAME --statement-id "AllowAPIGatewayInvoke" --region $REGION 2>&1 | Out-Null
aws lambda add-permission `
    --function-name $FUNCTION_NAME `
    --statement-id "AllowAPIGatewayInvoke" `
    --action "lambda:InvokeFunction" `
    --principal "apigateway.amazonaws.com" `
    --source-arn $sourceArn `
    --region $REGION | Out-Null
Write-Host "  Permission confirmed." -ForegroundColor Green

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host ""
Write-Host "Test:" -ForegroundColor Cyan
Write-Host "  curl $apiEndpoint/health"
Write-Host "  curl -X POST $apiEndpoint/evaluate -H `"Content-Type: application/json`" -d '{`"retrieved_ids`":[1,2,3],`"relevant_ids`":[1],`"k`":3}'"
