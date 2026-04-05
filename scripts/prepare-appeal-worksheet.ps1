<#
  Appeal Resubmission Worksheet Generator
  Processes claim_response_Abha CSV to build claim-by-claim appeal preparation
#>
param(
  [string]$CsvPath = "artifacts\abha-nphies-analysis\run-20260405-113532\tmp-csv\claim_response_Abha_01012026_31012026_20260401_100719-Sheet1.csv",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$root = "c:\Users\inma4\Downloads\New folder\oracle-scanner-extracted\oracle-scanner"
Set-Location $root

if (-not $OutputDir) {
  $ts = (Get-Date).ToString("yyyy-MM-ddTHH-mm-ss")
  $OutputDir = Join-Path $root "artifacts\abha-nphies-analysis\appeal-prep-$ts"
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "Loading CSV..."
$csv = Import-Csv (Join-Path $root $CsvPath)
Write-Host "Total rows: $($csv.Count)"

# --- Denial classification function ---
function Get-DenialClassification($reason) {
  $r = $reason.ToLower()
  if ($r -match "adjusted as per the agreed tariff") {
    return @{ Category="TARIFF_ADJUSTMENT"; AppealType="Contractual"; Strategy="Appeal with agreed tariff schedule reference. Most are 0.01 SAR rounding differences."; Priority="High"; Auto="YES" }
  }
  if ($r -match "medication|vaccine|not registred under moh") {
    return @{ Category="MEDICATION_NOT_REGISTERED"; AppealType="Clinical + Regulatory"; Strategy="Provide SFDA registration proof or map to equivalent MOH-registered medication code."; Priority="Medium"; Auto="NO" }
  }
  if ($r -match "not considered as medically necessary") {
    return @{ Category="MEDICAL_NECESSITY"; AppealType="Clinical"; Strategy="Attach clinical justification letter from treating physician explaining medical necessity."; Priority="Medium"; Auto="NO" }
  }
  if ($r -match "missing documents|missing doc") {
    return @{ Category="MISSING_DOCUMENTS"; AppealType="Documentation"; Strategy="Resubmit with required supporting documents: discharge summary, operative notes, lab/radiology reports."; Priority="High"; Auto="NO" }
  }
  if ($r -match "approval for addmission|discharge status not clear") {
    return @{ Category="ADMISSION_APPROVAL"; AppealType="Administrative"; Strategy="Provide admission approval document and clear discharge summary with admission/discharge dates."; Priority="Medium"; Auto="NO" }
  }
  if ($r -match "quantity limitation|exceeding the quantity") {
    return @{ Category="QUANTITY_EXCEEDED"; AppealType="Clinical"; Strategy="Provide clinical justification for quantity exceeding standard limits with physician order."; Priority="Medium"; Auto="NO" }
  }
  if ($r -match "room" -and $r -match "board") {
    return @{ Category="ROOM_BOARD_INCLUSION"; AppealType="Contractual"; Strategy="Review contract terms for room & board bundling. Provide contract clause if separately billable."; Priority="Low"; Auto="NO" }
  }
  if ($r -match "package deal|included in the package") {
    return @{ Category="PACKAGE_INCLUSION"; AppealType="Contractual"; Strategy="Review if service is correctly bundled. Provide package definition if separately billable."; Priority="Low"; Auto="NO" }
  }
  if ($r -match "prior approval|prior auth") {
    return @{ Category="PRIOR_AUTH_MISSING"; AppealType="Administrative"; Strategy="Provide pre-authorization reference. If emergency, attach emergency documentation for retrospective approval."; Priority="High"; Auto="NO" }
  }
  if ($r -match "discharge report|incompatible with the service") {
    return @{ Category="DISCHARGE_INCOMPATIBLE"; AppealType="Clinical"; Strategy="Review discharge summary against billed services. Correct coding mismatches. Attach updated discharge report."; Priority="Medium"; Auto="NO" }
  }
  if ($r -match "procedure billed is not done|itemprocedure billed") {
    return @{ Category="PROCEDURE_NOT_DONE"; AppealType="Clinical"; Strategy="Provide operative notes proving the service was performed. Correct service code if coding error."; Priority="High"; Auto="NO" }
  }
  if ($r -match "multiple procedure|payment rules") {
    return @{ Category="MULTIPLE_PROCEDURE_RULES"; AppealType="Contractual"; Strategy="Appeal if procedures were in separate sessions or on different anatomical sites."; Priority="Medium"; Auto="NO" }
  }
  if ($r -match "vitally stable|q1000") {
    return @{ Category="VITALLY_STABLE_NOTE"; AppealType="Clinical Review"; Strategy="Clinical note (vitally stable). Review if severity justification needed."; Priority="Low"; Auto="NO" }
  }
  if ($r -match "not in mv") {
    return @{ Category="NOT_IN_MV"; AppealType="Administrative"; Strategy="Service code not in master value list. Map to correct NPHIES/MOH code."; Priority="Medium"; Auto="NO" }
  }
  if ($r -match "^(done in|died|started in|from )") {
    return @{ Category="STATUS_NOTE"; AppealType="Administrative"; Strategy="Administrative status note. Review if claim dates align with noted dates."; Priority="Low"; Auto="NO" }
  }
  if ($r -match "^[fp]\d{2,4}$" -or $r -match "^\d+(\.\d+)?$") {
    return @{ Category="CODE_REFERENCE"; AppealType="Review"; Strategy="Reference code/amount. Cross-reference with payer denial codebook."; Priority="Low"; Auto="NO" }
  }
  return @{ Category="OTHER"; AppealType="Manual Review"; Strategy="Manual review required. Examine specific denial text."; Priority="Medium"; Auto="NO" }
}

# --- Process claims ---
$denied = $csv | Where-Object { $_.RES_STATUS -ne "APPROVED" }
Write-Host "Denied/Partial rows: $($denied.Count)"

$claimGroups = $denied | Group-Object BUNDLE_ID
Write-Host "Unique claims: $($claimGroups.Count)"

$lineDetails = [System.Collections.ArrayList]::new()
$claimSummaries = [System.Collections.ArrayList]::new()
$claimNo = 0

foreach ($group in $claimGroups) {
  $claimNo++
  $lines = $group.Group
  $first = $lines[0]
  $bundleId = $group.Name

  $totalClaimed = 0; $totalApproved = 0; $totalRejected = 0; $linesWithApproval = 0
  $denialCats = @{}
  $totalDenied = 0; $autoAppealable = 0

  foreach ($line in $lines) {
    $pd = $line.PULL_DISPLAY.Trim()
    $reason = if ($pd) { ($pd -replace '^\d+-','').Trim() } else { "" }
    $gross = [double]($line.GROSS -replace '[^\d.]','')
    $net = [double]($line.NET_AMOUNT -replace '[^\d.]','')
    $approved = if ($line.APPROVED_AMOUNT.Trim()) { [double]($line.APPROVED_AMOUNT -replace '[^\d.]','') } else { 0 }
    $rejected = if ($line.'Rejected Amt'.Trim()) { [double]($line.'Rejected Amt' -replace '[^\d.]','') } else { 0 }

    $totalClaimed += if ($net) { $net } else { $gross }
    $totalApproved += $approved
    $totalRejected += $rejected
    if ($approved -gt 0) { $linesWithApproval++ }

    $cls = if ($reason) { Get-DenialClassification $reason } else { $null }
    if ($cls) {
      $totalDenied++
      if (-not $denialCats.ContainsKey($cls.Category)) { $denialCats[$cls.Category] = @{Count=0; Info=$cls} }
      $denialCats[$cls.Category].Count++
      if ($cls.Auto -eq "YES") { $autoAppealable++ }
    }

    $diff = if ($approved -gt 0) { [math]::Round($net - $approved, 2) } else { "" }

    [void]$lineDetails.Add([PSCustomObject]@{
      ClaimNo = $claimNo
      BundleID = $bundleId
      MRN = $first.MED_REC_NO
      PatientName = $first.PATIENT_NAME
      InvoiceNo = $first.INVOICE_NUMBER
      EpisodeNo = $first.EPISODE_NO
      AttendanceType = $first.ATTENDANCE_TYPE
      SequenceNo = $line.SEQUENCE_NO
      ServiceCode = $line.SERVICE_CODE
      ServiceDescription = $line.SERVICE_DESCRIPTION
      ServiceDate = $line.SERVICE_DATE
      Qty = $line.QTY_STOCKED_UOM
      UnitPrice = $line.UNIT_PRICE_STOCKED_UOM
      Gross = $line.GROSS
      NetAmount = $line.NET_AMOUNT
      ApprovedAmount = $line.APPROVED_AMOUNT
      RejectedAmount = $line.'Rejected Amt'
      Difference = $diff
      PreAuthID = $line.PRE_AUTH_ID
      ApprovalStatus = $line.APPROVAL_STATUS
      Outcome = $line.OUTCOME
      PULL_DISPLAY = $pd
      DenialReason = $reason
      DenialCategory = if ($cls) { $cls.Category } else { "" }
      AppealType = if ($cls) { $cls.AppealType } else { "" }
      AppealStrategy = if ($cls) { $cls.Strategy } else { "" }
      AppealPriority = if ($cls) { $cls.Priority } else { "" }
      AutoAppealable = if ($cls) { $cls.Auto } else { "" }
      SubmitClaimMessage = $line.SUBMIT_CLAIM_MESSAGE
      Diagnosis = $first.DIAGNOSIS
    })
  }

  $catSorted = $denialCats.GetEnumerator() | Sort-Object { $_.Value.Count } -Desc
  $primaryCat = if ($catSorted) { $catSorted[0].Key } else { "UNKNOWN" }
  $allCats = ($catSorted | ForEach-Object { "$($_.Key)($($_.Value.Count))" }) -join ", "
  $manualLines = $totalDenied - $autoAppealable

  $readiness = if ($autoAppealable -eq $totalDenied -and $totalDenied -gt 0) { "READY_AUTO_APPEAL" }
               elseif ($autoAppealable -gt 0) { "PARTIAL_AUTO_APPEAL" }
               elseif ($totalDenied -gt 0) { "MANUAL_REVIEW" }
               else { "NO_DENIAL_REASON" }

  [void]$claimSummaries.Add([PSCustomObject]@{
    ClaimNo = $claimNo
    BundleID = $bundleId
    ApiTransID = $first.API_TRANS_ID
    MRN = $first.MED_REC_NO
    PatientName = $first.PATIENT_NAME
    InvoiceNo = $first.INVOICE_NUMBER
    EpisodeNo = $first.EPISODE_NO
    AttendanceType = $first.ATTENDANCE_TYPE
    VisitDate = $first.VISIT_DATE
    Diagnosis = ($first.DIAGNOSIS).Substring(0, [Math]::Min(200, $first.DIAGNOSIS.Length))
    PolicyHolder = $first.POLICY_HOLDER_NAME
    TotalLineItems = $lines.Count
    LinesWithDenial = $totalDenied
    LinesNoDenial = $lines.Count - $totalDenied
    TotalClaimed = [math]::Round($totalClaimed, 2)
    TotalApproved = [math]::Round($totalApproved, 2)
    TotalRejected = [math]::Round($totalRejected, 2)
    InvoiceNetAmount = $first.INVOICE_NET_AMOUNT
    LinesWithApprovalData = $linesWithApproval
    PrimaryDenialCategory = $primaryCat
    AllDenialCategories = $allCats
    AutoAppealableLines = $autoAppealable
    ManualReviewLines = $manualLines
    AppealReadiness = $readiness
  })
}

# --- Category summary ---
$catSummary = $lineDetails | Where-Object { $_.DenialCategory } | Group-Object DenialCategory | ForEach-Object {
  $grp = $_.Group
  $first = $grp[0]
  [PSCustomObject]@{
    Category = $_.Name
    LineCount = $_.Count
    ClaimCount = ($grp | Select-Object -Unique BundleID).Count
    AppealType = $first.AppealType
    AutoAppealable = $first.AutoAppealable
    Priority = $first.AppealPriority
    TotalClaimed = [math]::Round(($grp | ForEach-Object { [double]($_.NetAmount -replace '[^\d.]','') } | Measure-Object -Sum).Sum, 2)
    TotalApproved = [math]::Round(($grp | Where-Object { $_.ApprovedAmount.Trim() } | ForEach-Object { [double]($_.ApprovedAmount -replace '[^\d.]','') } | Measure-Object -Sum).Sum, 2)
    Strategy = $first.AppealStrategy
  }
} | Sort-Object LineCount -Desc

# --- Write outputs ---
Write-Host "`n=== WRITING OUTPUTS ==="

# CSV files
$claimSummaries | Export-Csv (Join-Path $OutputDir "claim_appeal_summary.csv") -NoTypeInformation -Encoding UTF8
$lineDetails | Export-Csv (Join-Path $OutputDir "line_appeal_detail.csv") -NoTypeInformation -Encoding UTF8
$catSummary | Export-Csv (Join-Path $OutputDir "denial_category_summary.csv") -NoTypeInformation -Encoding UTF8

# JSON summary
$readinessCounts = $claimSummaries | Group-Object AppealReadiness | ForEach-Object { @{ $_.Name = $_.Count } }
$summaryJson = @{
  generatedAt = (Get-Date).ToString("o")
  totalRows = $csv.Count
  deniedPartialRows = $denied.Count
  approvedRows = $csv.Count - $denied.Count
  uniqueClaims = $claimGroups.Count
  appealReadiness = $readinessCounts
  denialCategories = @($catSummary | ForEach-Object {
    @{
      category = $_.Category; lines = $_.LineCount; claims = $_.ClaimCount
      appealType = $_.AppealType; auto = $_.AutoAppealable; priority = $_.Priority
      totalClaimed = $_.TotalClaimed; totalApproved = $_.TotalApproved
    }
  })
} | ConvertTo-Json -Depth 5
Set-Content (Join-Path $OutputDir "appeal_summary.json") $summaryJson -Encoding UTF8

# --- Print results ---
Write-Host "`n=== APPEAL READINESS ==="
$claimSummaries | Group-Object AppealReadiness | Sort-Object Count -Desc | ForEach-Object { Write-Host "  $($_.Name): $($_.Count) claims" }

Write-Host "`n=== DENIAL CATEGORIES ==="
$catSummary | ForEach-Object {
  Write-Host "  $($_.Category): $($_.LineCount) lines / $($_.ClaimCount) claims | $($_.AppealType) | Auto: $($_.AutoAppealable) | Priority: $($_.Priority)"
  Write-Host "    Claimed: $($_.TotalClaimed) | Approved: $($_.TotalApproved)"
}

Write-Host "`nOutput: $OutputDir"
