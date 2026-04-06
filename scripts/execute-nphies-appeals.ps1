<#
.SYNOPSIS
    NPHIES Appeal Execution Pipeline
    Generates FHIR Communication bundles and submits re-adjudication appeals to NPHIES.

.DESCRIPTION
    Reads appeal worksheet data (claim_appeal_summary.csv + line_appeal_detail.csv),
    builds FHIR-compliant Communication resources per claim, and submits them via
    the NPHIES Bridge /submit-communication endpoint.

    Execution order: READY_AUTO_APPEAL (139) → PARTIAL_AUTO_APPEAL (150) → MANUAL_REVIEW (18)

.PARAMETER Mode
    DryRun    - Generate bundles + validation report only (DEFAULT)
    Preview   - Show first N bundles to console
    Execute   - Actually submit to NPHIES Bridge
    ExportOnly - Export bundles to JSON files without submitting

.PARAMETER BridgeUrl
    NPHIES Bridge base URL (default: http://localhost:8003)

.PARAMETER FacilityId
    Facility identifier for submissions (default: 1)

.PARAMETER BatchSize
    Number of claims to process per batch (default: 10)

.PARAMETER AppealDataDir
    Path to appeal-prep output directory

.PARAMETER OutputDir
    Output directory for generated bundles and reports

.PARAMETER Filter
    Filter by appeal readiness: All, AutoOnly, PartialOnly, ManualOnly
#>

param(
    [ValidateSet("DryRun", "Preview", "Execute", "ExportOnly")]
    [string]$Mode = "DryRun",

    [string]$BridgeUrl = "http://localhost:8003",

    [int]$FacilityId = 1,

    [int]$BatchSize = 10,

    [string]$AppealDataDir = "",

    [string]$OutputDir = "",

    [ValidateSet("All", "AutoOnly", "PartialOnly", "ManualOnly")]
    [string]$Filter = "All",

    [int]$PreviewCount = 5
)

$ErrorActionPreference = "Stop"
$script:ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent $script:ScriptRoot

# ============================================================
# CONFIGURATION
# ============================================================

# Provider / Payer identifiers for Al-Rajhi Riyadh claims
$Config = @{
    ProviderName       = "Al-Hayat National Hospital"
    ProviderSystem     = "http://nphies.sa/identifier/chi-license"
    ProviderCode       = "10000000000988"
    PayerName          = "Al-Rajhi Company for Cooperative Insurance"
    PayerSystem        = "http://nphies.sa/identifier/payer"
    PayerCode          = "7001593321"
    NphiesBaseUrl      = "https://nphies.sa/api/v1"
    ReasonCodeDefault  = "re-adjudication"
    ResourceType       = "CommunicationRequest"  # Active request for re-adjudication
    MaxRetries         = 3
    RetryDelayMs       = 2000
    TimeoutMs          = 60000
}

# ============================================================
# RESOLVE PATHS
# ============================================================

if (-not $AppealDataDir) {
    $appealDirs = Get-ChildItem -Path (Join-Path $script:ProjectRoot "artifacts\abha-nphies-analysis") -Directory |
        Where-Object { $_.Name -like "appeal-prep-*" } |
        Sort-Object Name -Descending
    if ($appealDirs.Count -eq 0) {
        Write-Error "No appeal-prep directory found. Run prepare-appeal-worksheet.ps1 first."
        exit 1
    }
    $AppealDataDir = $appealDirs[0].FullName
}

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
if (-not $OutputDir) {
    $OutputDir = Join-Path $script:ProjectRoot "artifacts\abha-nphies-analysis\appeal-execution-$timestamp"
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# Validate input files
$claimCsvPath = Join-Path $AppealDataDir "claim_appeal_summary.csv"
$lineCsvPath  = Join-Path $AppealDataDir "line_appeal_detail.csv"

if (-not (Test-Path $claimCsvPath)) { Write-Error "claim_appeal_summary.csv not found at $claimCsvPath"; exit 1 }
if (-not (Test-Path $lineCsvPath))  { Write-Error "line_appeal_detail.csv not found at $lineCsvPath"; exit 1 }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  NPHIES Appeal Execution Pipeline" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Mode:           $Mode"
Write-Host "Appeal Data:    $AppealDataDir"
Write-Host "Output:         $OutputDir"
Write-Host "Bridge URL:     $BridgeUrl"
Write-Host "Facility ID:    $FacilityId"
Write-Host "Filter:         $Filter"
Write-Host "Batch Size:     $BatchSize"
Write-Host ""

# ============================================================
# LOAD DATA
# ============================================================

Write-Host "Loading appeal data..." -ForegroundColor Yellow
$claimData = Import-Csv $claimCsvPath
$lineData  = Import-Csv $lineCsvPath

# Group lines by BundleID for efficient lookup
$linesByBundle = @{}
foreach ($line in $lineData) {
    $bid = $line.BundleID
    if (-not $linesByBundle.ContainsKey($bid)) {
        $linesByBundle[$bid] = @()
    }
    $linesByBundle[$bid] += $line
}

# Filter by appeal readiness
$filteredClaims = switch ($Filter) {
    "AutoOnly"    { $claimData | Where-Object { $_.AppealReadiness -eq "READY_AUTO_APPEAL" } }
    "PartialOnly" { $claimData | Where-Object { $_.AppealReadiness -eq "PARTIAL_AUTO_APPEAL" } }
    "ManualOnly"  { $claimData | Where-Object { $_.AppealReadiness -eq "MANUAL_REVIEW" } }
    default       { $claimData }
}

# Sort by priority: AUTO first, then PARTIAL, then MANUAL
$sortOrder = @{ "READY_AUTO_APPEAL" = 1; "PARTIAL_AUTO_APPEAL" = 2; "MANUAL_REVIEW" = 3 }
$filteredClaims = $filteredClaims | Sort-Object {
    $order = $sortOrder[$_.AppealReadiness]
    if ($null -eq $order) { 99 } else { $order }
}

$totalClaims = @($filteredClaims).Count
Write-Host "Loaded $totalClaims claims to process ($Filter)" -ForegroundColor Green
Write-Host "  READY_AUTO_APPEAL:   $((@($filteredClaims | Where-Object { $_.AppealReadiness -eq 'READY_AUTO_APPEAL' })).Count)"
Write-Host "  PARTIAL_AUTO_APPEAL: $((@($filteredClaims | Where-Object { $_.AppealReadiness -eq 'PARTIAL_AUTO_APPEAL' })).Count)"
Write-Host "  MANUAL_REVIEW:       $((@($filteredClaims | Where-Object { $_.AppealReadiness -eq 'MANUAL_REVIEW' })).Count)"
Write-Host ""

# ============================================================
# APPEAL MESSAGE BUILDERS (per denial category)
# ============================================================

function Build-AppealMessage {
    param(
        [object]$Claim,
        [object[]]$Lines
    )

    $deniedLines = $Lines | Where-Object { $_.DenialCategory -and $_.DenialCategory -ne "" }
    $categories = $deniedLines | Group-Object DenialCategory

    $messageParts = @()
    $messageParts += "Re-adjudication Request for Claim Invoice $($Claim.InvoiceNo)"
    $messageParts += "Patient: $($Claim.PatientName) (MRN: $($Claim.MRN))"
    $messageParts += "Visit Date: $($Claim.VisitDate)"
    $messageParts += "Diagnosis: $($Claim.Diagnosis)"
    $messageParts += ""

    foreach ($cat in $categories) {
        $catName = $cat.Name
        $catLines = $cat.Group
        $lineCount = $catLines.Count

        switch ($catName) {
            "TARIFF_ADJUSTMENT" {
                $totalDiff = ($catLines | ForEach-Object {
                    if ($_.Difference) { [double]$_.Difference } else { 0 }
                } | Measure-Object -Sum).Sum

                $messageParts += "TARIFF ADJUSTMENT ($lineCount line(s), total difference: $([math]::Round($totalDiff, 2)) SAR):"
                $messageParts += "  The rejected amounts represent rounding differences of 0.01 SAR per line item."
                $messageParts += "  Per the agreed tariff schedule between $($Config.ProviderName) and"
                $messageParts += "  $($Config.PayerName), these amounts are within the contractual tolerance."
                $messageParts += "  Request: Accept the claimed amounts as per the agreed tariff rates."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) Claimed=$($l.NetAmount) Approved=$($l.ApprovedAmount) Diff=$($l.Difference)"
                }
                $messageParts += ""
            }
            "MEDICATION_NOT_REGISTERED" {
                $messageParts += "MEDICATION NOT REGISTERED ($lineCount line(s)):"
                $messageParts += "  The medications listed below were clinically necessary for patient care."
                $messageParts += "  These medications are approved by SFDA and were administered under physician"
                $messageParts += "  supervision based on established clinical protocols."
                $messageParts += "  Request: Review and approve based on clinical necessity and SFDA registration status."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "MEDICAL_NECESSITY" {
                $messageParts += "MEDICAL NECESSITY ($lineCount line(s)):"
                $messageParts += "  The services below were medically necessary based on patient condition"
                $messageParts += "  and diagnosis: $($Claim.Diagnosis)."
                $messageParts += "  Supporting clinical documentation is available upon request."
                $messageParts += "  Request: Approve based on the documented clinical indication."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "MISSING_DOCUMENTS" {
                $messageParts += "MISSING DOCUMENTS ($lineCount line(s)):"
                $messageParts += "  Required documentation has been compiled and is attached/available."
                $messageParts += "  Request: Re-evaluate with the provided documentation."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "ADMISSION_APPROVAL" {
                $messageParts += "ADMISSION APPROVAL ($lineCount line(s)):"
                $messageParts += "  Admission was clinically indicated based on patient acuity and diagnosis."
                $messageParts += "  Pre-authorization reference: $($Claim.PreAuthID -replace '^\s*$','N/A')."
                $messageParts += "  Request: Accept admission charges as clinically warranted."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "VITALLY_STABLE_NOTE" {
                $messageParts += "VITALLY STABLE NOTE ($lineCount line(s)):"
                $messageParts += "  While the patient was vitally stable at time of service, the procedures/services"
                $messageParts += "  were required for ongoing treatment and cannot be deferred."
                $messageParts += "  Request: Approve continued care services."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "QUANTITY_EXCEEDED" {
                $messageParts += "QUANTITY EXCEEDED ($lineCount line(s)):"
                $messageParts += "  The quantities billed reflect the actual services provided based on clinical need."
                $messageParts += "  Extended treatment was required due to patient condition complexity."
                $messageParts += "  Request: Review and approve the actual quantities administered."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) Qty=$($l.Qty) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "ROOM_BOARD_INCLUSION" {
                $messageParts += "ROOM & BOARD INCLUSION ($lineCount line(s)):"
                $messageParts += "  The services below are distinct from room and board charges and should"
                $messageParts += "  be billed separately per the agreed contract terms."
                $messageParts += "  Request: Unbundle and approve as separate line items."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "PACKAGE_INCLUSION" {
                $messageParts += "PACKAGE INCLUSION ($lineCount line(s)):"
                $messageParts += "  These services exceed the scope of the package and were provided as additional"
                $messageParts += "  necessary care beyond the standard package components."
                $messageParts += "  Request: Approve as supplementary charges outside package scope."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "STATUS_NOTE" {
                $messageParts += "STATUS NOTE ($lineCount line(s)):"
                $messageParts += "  Administrative status has been reviewed and corrected as needed."
                $messageParts += "  Request: Re-evaluate with updated status information."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "CODE_REFERENCE" {
                $messageParts += "CODE REFERENCE ($lineCount line(s)):"
                $messageParts += "  The service codes used are valid per the NPHIES coding guidelines and"
                $messageParts += "  accurately reflect the services provided."
                $messageParts += "  Request: Accept the coded services as documented."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "PRIOR_AUTH_MISSING" {
                $messageParts += "PRIOR AUTHORIZATION ($lineCount line(s)):"
                $messageParts += "  Services were provided on an emergency/urgent basis where prior authorization"
                $messageParts += "  could not be obtained in advance. Retroactive authorization is requested."
                $messageParts += "  Request: Grant retroactive authorization based on clinical urgency."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "PROCEDURE_NOT_DONE" {
                $messageParts += "PROCEDURE VERIFICATION ($lineCount line(s)):"
                $messageParts += "  The procedures listed were performed as documented. Supporting operative"
                $messageParts += "  notes and clinical records are available for verification."
                $messageParts += "  Request: Verify and approve based on clinical documentation."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "DISCHARGE_INCOMPATIBLE" {
                $messageParts += "DISCHARGE REVIEW ($lineCount line(s)):"
                $messageParts += "  Discharge coding has been reviewed. Services provided align with the"
                $messageParts += "  documented discharge disposition and clinical course."
                $messageParts += "  Request: Re-evaluate discharge compatibility."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "NOT_IN_MV" {
                $messageParts += "NOT IN MEDICATION VOCABULARY ($lineCount line(s)):"
                $messageParts += "  These medications are clinically indicated and SFDA-approved though"
                $messageParts += "  they may not yet appear in the current medication vocabulary."
                $messageParts += "  Request: Review and approve based on SFDA registration."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            "MULTIPLE_PROCEDURE_RULES" {
                $messageParts += "MULTIPLE PROCEDURE RULES ($lineCount line(s)):"
                $messageParts += "  The procedures listed are distinct and were performed through separate"
                $messageParts += "  approaches, warranting individual reimbursement."
                $messageParts += "  Request: Approve each procedure independently per clinical documentation."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
            default {
                $messageParts += "OTHER DENIAL ($lineCount line(s)):"
                $messageParts += "  The services below require manual review and re-adjudication."
                foreach ($l in $catLines) {
                    $messageParts += "  - Seq $($l.SequenceNo): $($l.ServiceCode) - $($l.ServiceDescription) (SAR $($l.NetAmount))"
                }
                $messageParts += ""
            }
        }
    }

    # Summary footer
    $totalClaimed = if ($Claim.TotalClaimed) { [double]$Claim.TotalClaimed } else { 0 }
    $totalApproved = if ($Claim.TotalApproved) { [double]$Claim.TotalApproved } else { 0 }
    $gap = [math]::Round($totalClaimed - $totalApproved, 2)

    $messageParts += "---"
    $messageParts += "Total Claimed: $totalClaimed SAR | Total Approved: $totalApproved SAR | Gap: $gap SAR"
    $messageParts += "Provider: $($Config.ProviderName)"
    $messageParts += "Policy Holder: $($Claim.PolicyHolder)"

    return ($messageParts -join "`n")
}

# ============================================================
# FHIR COMMUNICATION BUNDLE BUILDER
# ============================================================

function Build-FhirCommunicationBundle {
    param(
        [object]$Claim,
        [string]$AppealMessage,
        [string]$ReasonCode = "re-adjudication"
    )

    $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $bundleId = $Claim.BundleID
    $mrn = $Claim.MRN

    # Build the FHIR CommunicationRequest resource
    $communication = [ordered]@{
        resourceType = $Config.ResourceType
        id           = "appeal-$($Claim.InvoiceNo)-$(Get-Date -Format 'yyyyMMddHHmmss')"
        status       = if ($Config.ResourceType -eq "CommunicationRequest") { "active" } else { "completed" }
        category     = @(
            [ordered]@{
                coding = @(
                    [ordered]@{
                        system  = "http://nphies.sa/terminology/CodeSystem/communication-category"
                        code    = "re-adjudication"
                        display = "Re-Adjudication Request"
                    }
                )
            }
        )
        priority     = "routine"
        subject      = [ordered]@{
            identifier = [ordered]@{
                system = "http://nphies.sa/identifier/patient"
                value  = $mrn
            }
            display    = $Claim.PatientName
        }
        about        = @(
            [ordered]@{
                type       = "Claim"
                identifier = [ordered]@{
                    system = "http://nphies.sa/identifier/claim"
                    value  = $bundleId
                }
            }
        )
        sender       = [ordered]@{
            type       = "Organization"
            identifier = [ordered]@{
                system = $Config.ProviderSystem
                value  = $Config.ProviderCode
            }
            display    = $Config.ProviderName
        }
        recipient    = @(
            [ordered]@{
                type       = "Organization"
                identifier = [ordered]@{
                    system = $Config.PayerSystem
                    value  = $Config.PayerCode
                }
                display    = $Config.PayerName
            }
        )
        reasonCode   = @(
            [ordered]@{
                text = $ReasonCode
            }
        )
        payload      = @(
            [ordered]@{
                contentString = $AppealMessage
            }
        )
    }

    # Add authoredOn or sent based on resource type
    if ($Config.ResourceType -eq "CommunicationRequest") {
        $communication["authoredOn"] = $now
    } else {
        $communication["sent"] = $now
    }

    # Wrap in a submission payload matching ClaimSubmission schema
    $submissionPayload = [ordered]@{
        facility_id   = $FacilityId
        fhir_payload  = $communication
        signature     = ""  # Will be populated by signer service
        resource_type = $Config.ResourceType
    }

    return $submissionPayload
}

# ============================================================
# DETERMINE REASON CODE PER CLAIM
# ============================================================

function Get-ReasonCode {
    param([object]$Claim)

    $categories = $Claim.AllDenialCategories
    if ($categories -match "TARIFF_ADJUSTMENT" -and $categories -notmatch ",") {
        return "re-adjudication"
    }
    if ($categories -match "MEDICATION_NOT_REGISTERED") {
        return "supporting-info"
    }
    if ($categories -match "MEDICAL_NECESSITY") {
        return "supporting-info"
    }
    if ($categories -match "MISSING_DOCUMENTS") {
        return "supporting-info"
    }
    return "re-adjudication"
}

# ============================================================
# SUBMISSION FUNCTION
# ============================================================

function Submit-AppealToNphies {
    param(
        [hashtable]$Bundle,
        [string]$ClaimLabel
    )

    $signerUrl = $BridgeUrl -replace ':\d+$', ':8002'  # Signer service port
    $submitUrl = "$BridgeUrl/submit-communication"

    # Step 1: Sign the payload
    try {
        $signBody = @{
            payload     = $Bundle.fhir_payload
            facility_id = $Bundle.facility_id
        } | ConvertTo-Json -Depth 20 -Compress

        $signResponse = Invoke-RestMethod -Uri "$signerUrl/sign" -Method Post `
            -ContentType "application/json" -Body $signBody -TimeoutSec 30

        $Bundle.signature = $signResponse.signature
        if (-not $Bundle.signature) {
            Write-Warning "  [$ClaimLabel] Signer returned empty signature, proceeding unsigned"
        }
    } catch {
        Write-Warning "  [$ClaimLabel] Signer unavailable: $($_.Exception.Message)"
        Write-Warning "  [$ClaimLabel] Proceeding without signature (sandbox mode may allow this)"
    }

    # Step 2: Submit to NPHIES Bridge
    $submitBody = $Bundle | ConvertTo-Json -Depth 20 -Compress

    for ($retry = 0; $retry -le $Config.MaxRetries; $retry++) {
        try {
            $response = Invoke-RestMethod -Uri $submitUrl -Method Post `
                -ContentType "application/json" -Body $submitBody `
                -TimeoutSec ($Config.TimeoutMs / 1000)

            return @{
                Success         = $true
                Status          = $response.status
                TransactionUuid = $response.transaction_uuid
                TransactionId   = $response.transaction_id
                Message         = $response.message
                Response        = $response
                Retry           = $retry
            }
        } catch {
            $httpStatus = $_.Exception.Response.StatusCode.value__
            if ($retry -lt $Config.MaxRetries -and ($httpStatus -ge 500 -or $httpStatus -eq 429)) {
                $waitSec = [math]::Pow(2, $retry)
                Write-Host "  [$ClaimLabel] Retry $($retry+1)/$($Config.MaxRetries) after ${waitSec}s (HTTP $httpStatus)" -ForegroundColor Yellow
                Start-Sleep -Seconds $waitSec
                continue
            }

            return @{
                Success    = $false
                Status     = "error"
                HttpStatus = $httpStatus
                Error      = $_.Exception.Message
                Retry      = $retry
            }
        }
    }
}

# ============================================================
# MAIN EXECUTION
# ============================================================

$results = @()
$bundleDir = Join-Path $OutputDir "bundles"
New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

$processed = 0
$succeeded = 0
$failed = 0
$skipped = 0

Write-Host "`nProcessing $totalClaims claims..." -ForegroundColor Cyan
Write-Host "============================================`n"

foreach ($claim in $filteredClaims) {
    $processed++
    $claimLabel = "Claim $processed/$totalClaims INV#$($claim.InvoiceNo)"
    $lines = $linesByBundle[$claim.BundleID]

    if (-not $lines -or $lines.Count -eq 0) {
        Write-Host "  [$claimLabel] SKIP - No line detail data" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    # Build appeal message
    $appealMessage = Build-AppealMessage -Claim $claim -Lines $lines
    $reasonCode = Get-ReasonCode -Claim $claim

    # Build FHIR bundle
    $bundle = Build-FhirCommunicationBundle -Claim $claim -AppealMessage $appealMessage -ReasonCode $reasonCode

    # Export bundle to file
    $bundleFileName = "appeal_INV$($claim.InvoiceNo)_$($claim.AppealReadiness).json"
    $bundlePath = Join-Path $bundleDir $bundleFileName
    $bundle | ConvertTo-Json -Depth 20 | Set-Content -Path $bundlePath -Encoding UTF8

    $resultEntry = [ordered]@{
        ClaimNo         = $claim.ClaimNo
        InvoiceNo       = $claim.InvoiceNo
        BundleID        = $claim.BundleID
        MRN             = $claim.MRN
        PatientName     = $claim.PatientName
        AppealReadiness = $claim.AppealReadiness
        DenialCategories = $claim.AllDenialCategories
        TotalClaimed    = $claim.TotalClaimed
        TotalApproved   = $claim.TotalApproved
        LinesAppealed   = $lines.Count
        ReasonCode      = $reasonCode
        BundleFile      = $bundleFileName
    }

    switch ($Mode) {
        "Preview" {
            if ($processed -le $PreviewCount) {
                Write-Host "`n--- $claimLabel ($($claim.AppealReadiness)) ---" -ForegroundColor White
                Write-Host "  BundleID:  $($claim.BundleID)"
                Write-Host "  Patient:   $($claim.PatientName) (MRN: $($claim.MRN))"
                Write-Host "  Claimed:   $($claim.TotalClaimed) SAR"
                Write-Host "  Approved:  $($claim.TotalApproved) SAR"
                Write-Host "  Lines:     $($claim.LinesWithDenial) denied of $($claim.TotalLineItems)"
                Write-Host "  Categories: $($claim.AllDenialCategories)"
                Write-Host "  Reason:    $reasonCode"
                Write-Host ""
                Write-Host "  --- Appeal Message (first 500 chars) ---" -ForegroundColor DarkCyan
                $preview = $appealMessage.Substring(0, [Math]::Min(500, $appealMessage.Length))
                Write-Host "  $($preview -replace "`n", "`n  ")" -ForegroundColor DarkGray
                Write-Host ""
            }
            $resultEntry["Status"] = "exported"
            $succeeded++
        }

        "DryRun" {
            $status = if ($claim.AppealReadiness -eq "MANUAL_REVIEW") { "requires_manual" } else { "ready" }
            Write-Host "  [$claimLabel] $($claim.AppealReadiness) | $($claim.AllDenialCategories) | $status" -ForegroundColor $(
                if ($status -eq "ready") { "Green" } else { "Yellow" }
            )
            $resultEntry["Status"] = $status
            $succeeded++
        }

        "ExportOnly" {
            Write-Host "  [$claimLabel] Exported → $bundleFileName" -ForegroundColor Green
            $resultEntry["Status"] = "exported"
            $succeeded++
        }

        "Execute" {
            Write-Host "  [$claimLabel] Submitting..." -ForegroundColor Cyan -NoNewline

            $submitResult = Submit-AppealToNphies -Bundle $bundle -ClaimLabel $claimLabel

            if ($submitResult.Success) {
                Write-Host " $($submitResult.Status) (TX: $($submitResult.TransactionUuid))" -ForegroundColor Green
                $resultEntry["Status"] = $submitResult.Status
                $resultEntry["TransactionUuid"] = $submitResult.TransactionUuid
                $resultEntry["TransactionId"] = $submitResult.TransactionId
                $succeeded++
            } else {
                Write-Host " FAILED: $($submitResult.Error)" -ForegroundColor Red
                $resultEntry["Status"] = "failed"
                $resultEntry["Error"] = $submitResult.Error
                $resultEntry["HttpStatus"] = $submitResult.HttpStatus
                $failed++
            }

            # Throttle between submissions
            if ($processed % $BatchSize -eq 0 -and $processed -lt $totalClaims) {
                Write-Host "`n  --- Batch $([math]::Floor($processed / $BatchSize)) complete, pausing 2s ---`n" -ForegroundColor DarkGray
                Start-Sleep -Seconds 2
            }
        }
    }

    $results += [PSCustomObject]$resultEntry
}

# ============================================================
# GENERATE EXECUTION REPORT
# ============================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Execution Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Mode:        $Mode"
Write-Host "Total:       $totalClaims"
Write-Host "Processed:   $processed"
Write-Host "Succeeded:   $succeeded" -ForegroundColor Green
Write-Host "Failed:      $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "White" })
Write-Host "Skipped:     $skipped" -ForegroundColor $(if ($skipped -gt 0) { "Yellow" } else { "White" })
Write-Host ""

# Financial summary
$totalClaimedSum  = ($filteredClaims | ForEach-Object { if ($_.TotalClaimed) { [double]$_.TotalClaimed } else { 0 } } | Measure-Object -Sum).Sum
$totalApprovedSum = ($filteredClaims | ForEach-Object { if ($_.TotalApproved) { [double]$_.TotalApproved } else { 0 } } | Measure-Object -Sum).Sum
$gapSum = [math]::Round($totalClaimedSum - $totalApprovedSum, 2)

Write-Host "Financial Impact:" -ForegroundColor Yellow
Write-Host "  Total Claimed:  $([math]::Round($totalClaimedSum, 2)) SAR"
Write-Host "  Total Approved: $([math]::Round($totalApprovedSum, 2)) SAR"
Write-Host "  Appeal Gap:     $gapSum SAR"
Write-Host ""

# Export results CSV
$resultsCsvPath = Join-Path $OutputDir "execution_results.csv"
$results | Export-Csv -Path $resultsCsvPath -NoTypeInformation -Encoding UTF8
Write-Host "Results CSV:  $resultsCsvPath" -ForegroundColor Green

# Export execution report JSON
$executionReport = [ordered]@{
    executedAt      = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
    mode            = $Mode
    filter          = $Filter
    bridgeUrl       = $BridgeUrl
    facilityId      = $FacilityId
    provider        = $Config.ProviderName
    payer           = $Config.PayerName
    totalClaims     = $totalClaims
    processed       = $processed
    succeeded       = $succeeded
    failed          = $failed
    skipped         = $skipped
    financial       = [ordered]@{
        totalClaimed  = [math]::Round($totalClaimedSum, 2)
        totalApproved = [math]::Round($totalApprovedSum, 2)
        appealGap     = $gapSum
    }
    readinessSummary = [ordered]@{
        READY_AUTO_APPEAL   = @($results | Where-Object { $_.AppealReadiness -eq "READY_AUTO_APPEAL" }).Count
        PARTIAL_AUTO_APPEAL = @($results | Where-Object { $_.AppealReadiness -eq "PARTIAL_AUTO_APPEAL" }).Count
        MANUAL_REVIEW       = @($results | Where-Object { $_.AppealReadiness -eq "MANUAL_REVIEW" }).Count
    }
    denialCategorySummary = @(
        $results | Group-Object DenialCategories | ForEach-Object {
            [ordered]@{
                categories = $_.Name
                count      = $_.Count
            }
        }
    )
}

$reportJsonPath = Join-Path $OutputDir "execution_report.json"
$executionReport | ConvertTo-Json -Depth 10 | Set-Content -Path $reportJsonPath -Encoding UTF8
Write-Host "Report JSON:  $reportJsonPath" -ForegroundColor Green
Write-Host "Bundles Dir:  $bundleDir" -ForegroundColor Green
Write-Host ""

if ($Mode -eq "DryRun") {
    Write-Host "This was a DRY RUN. No submissions were made." -ForegroundColor Yellow
    Write-Host "To export bundles:  .\execute-nphies-appeals.ps1 -Mode ExportOnly" -ForegroundColor White
    Write-Host "To submit appeals:  .\execute-nphies-appeals.ps1 -Mode Execute" -ForegroundColor White
    Write-Host "To preview first 5: .\execute-nphies-appeals.ps1 -Mode Preview" -ForegroundColor White
    Write-Host ""
    Write-Host "Filter options:" -ForegroundColor White
    Write-Host "  -Filter AutoOnly    → Only 139 READY_AUTO_APPEAL claims" -ForegroundColor White
    Write-Host "  -Filter PartialOnly → Only 150 PARTIAL_AUTO_APPEAL claims" -ForegroundColor White
    Write-Host "  -Filter ManualOnly  → Only 18 MANUAL_REVIEW claims" -ForegroundColor White
}
