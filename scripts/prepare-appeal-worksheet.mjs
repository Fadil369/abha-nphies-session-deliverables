import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const CONFIG = {
  claimResponseWorkbook: path.resolve(ROOT, "MOH-JAN-ABHA", "claim_response_Abha_01012026_31012026_20260401_100719.xlsx"),
  gssWorkbook: path.resolve(ROOT, "MOH-JAN-ABHA", "GSS.xlsx"),
  outputRoot: path.resolve(ROOT, "artifacts", "abha-nphies-analysis"),
};

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function val(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function num(v) {
  const n = parseFloat(val(v));
  return isNaN(n) ? 0 : n;
}

function stripLinePrefix(pullDisplay) {
  return val(pullDisplay).replace(/^\d+-/, "").trim();
}

// Map PULL_DISPLAY denial reasons to appeal categories and strategies
function classifyDenial(reason) {
  const r = reason.toLowerCase();

  if (r.includes("adjusted as per the agreed tariff"))
    return {
      category: "TARIFF_ADJUSTMENT",
      appealType: "Contractual",
      strategy: "Appeal with agreed tariff schedule reference. Show that claimed amount matches the contracted rate. Most are 0.01 SAR rounding differences.",
      priority: "High",
      autoAppealable: true,
    };

  if (r.includes("medication") || r.includes("vaccine") || r.includes("not registred under moh"))
    return {
      category: "MEDICATION_NOT_REGISTERED",
      appealType: "Clinical + Regulatory",
      strategy: "Provide SFDA registration proof, or map to the equivalent MOH-registered medication code. If medication was administered under emergency/compassionate use, attach justification letter.",
      priority: "Medium",
      autoAppealable: false,
    };

  if (r.includes("not considered as medically necessary"))
    return {
      category: "MEDICAL_NECESSITY",
      appealType: "Clinical",
      strategy: "Attach clinical justification letter from treating physician explaining medical necessity. Include diagnosis, treatment plan, and why this service was required.",
      priority: "Medium",
      autoAppealable: false,
    };

  if (r.includes("missing documents") || r.includes("missing doc"))
    return {
      category: "MISSING_DOCUMENTS",
      appealType: "Documentation",
      strategy: "Resubmit with the required supporting documents: discharge summary, operative notes, lab reports, radiology reports as applicable.",
      priority: "High",
      autoAppealable: false,
    };

  if (r.includes("approval for addmission") || r.includes("discharge status not clear"))
    return {
      category: "ADMISSION_APPROVAL",
      appealType: "Administrative",
      strategy: "Provide admission approval document and clear discharge summary with status. Ensure admission dates and discharge dates are consistent.",
      priority: "Medium",
      autoAppealable: false,
    };

  if (r.includes("quantity limitation") || r.includes("exceeding the quantity"))
    return {
      category: "QUANTITY_EXCEEDED",
      appealType: "Clinical",
      strategy: "Provide clinical justification for the quantity exceeding standard limits. Include physician order and treatment protocol.",
      priority: "Medium",
      autoAppealable: false,
    };

  if (r.includes("room") && r.includes("board"))
    return {
      category: "ROOM_BOARD_INCLUSION",
      appealType: "Contractual",
      strategy: "Review contract terms for room & board bundling. If service is separately billable per contract, provide contract clause reference.",
      priority: "Low",
      autoAppealable: false,
    };

  if (r.includes("package deal") || r.includes("included in the package"))
    return {
      category: "PACKAGE_INCLUSION",
      appealType: "Contractual",
      strategy: "Review if service is correctly bundled in the package. If separately billable, provide package definition and terms.",
      priority: "Low",
      autoAppealable: false,
    };

  if (r.includes("prior approval") || r.includes("prior auth"))
    return {
      category: "PRIOR_AUTH_MISSING",
      appealType: "Administrative",
      strategy: "Provide pre-authorization reference number. If emergency, attach emergency admission documentation with justification for retrospective approval.",
      priority: "High",
      autoAppealable: false,
    };

  if (r.includes("discharge report") || r.includes("incompatible with the service"))
    return {
      category: "DISCHARGE_INCOMPATIBLE",
      appealType: "Clinical",
      strategy: "Review discharge summary against billed services. Correct any coding mismatches. Attach updated discharge report if needed.",
      priority: "Medium",
      autoAppealable: false,
    };

  if (r.includes("procedure billed is not done") || r.includes("itemprocedure billed"))
    return {
      category: "PROCEDURE_NOT_DONE",
      appealType: "Clinical",
      strategy: "Provide operative notes or procedure documentation proving the service was performed. If coding error, correct the service code.",
      priority: "High",
      autoAppealable: false,
    };

  if (r.includes("multiple procedure") || r.includes("payment rules"))
    return {
      category: "MULTIPLE_PROCEDURE_RULES",
      appealType: "Contractual",
      strategy: "Review multiple procedure discount rules. Appeal if procedures were performed in separate sessions or on different anatomical sites.",
      priority: "Medium",
      autoAppealable: false,
    };

  if (r.includes("vitally stable") || r.includes("q1000"))
    return {
      category: "VITALLY_STABLE_NOTE",
      appealType: "Clinical Review",
      strategy: "Clinical note indicates vitally stable patient. Review if this is a denial reason or clinical documentation. May need additional clinical context for severity justification.",
      priority: "Low",
      autoAppealable: false,
    };

  if (r.includes("not in mv"))
    return {
      category: "NOT_IN_MV",
      appealType: "Administrative",
      strategy: "Service code not found in master value list. Map to the correct NPHIES/MOH service code or provide justification for unlisted service.",
      priority: "Medium",
      autoAppealable: false,
    };

  if (/^(done in|died|started in|from )/.test(r))
    return {
      category: "STATUS_NOTE",
      appealType: "Administrative",
      strategy: "Administrative status note indicating patient outcome/transfer. Review if claim dates align with the noted status dates.",
      priority: "Low",
      autoAppealable: false,
    };

  if (/^[fp]\d{2,4}$/.test(r) || /^\d+(\.\d+)?$/.test(r))
    return {
      category: "CODE_REFERENCE",
      appealType: "Review",
      strategy: "Reference code or amount noted by reviewer. Cross-reference with payer's denial codebook for specific action required.",
      priority: "Low",
      autoAppealable: false,
    };

  return {
    category: "OTHER",
    appealType: "Manual Review",
    strategy: "Manual review required. Examine the specific denial text and prepare case-specific response.",
    priority: "Medium",
    autoAppealable: false,
  };
}

function main() {
  const outputDir = path.join(CONFIG.outputRoot, `appeal-prep-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // Read claim response workbook
  const wb = XLSX.readFile(CONFIG.claimResponseWorkbook, { raw: false, cellDates: false });
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"], { defval: "", raw: false }).map((row) => {
    const norm = {};
    for (const [key, value] of Object.entries(row)) {
      norm[normalizeHeader(key)] = val(value);
      norm[key] = val(value); // keep original keys too
    }
    return norm;
  });

  // Read GSS
  let gssMap = new Map();
  try {
    const gssWb = XLSX.readFile(CONFIG.gssWorkbook, { raw: false, cellDates: false });
    const gssRows = XLSX.utils.sheet_to_json(gssWb.Sheets[gssWb.SheetNames[0]], { defval: "", raw: false });
    for (const row of gssRows) {
      const bundleKey = val(row.CLAIM_BUNDLE_ID || row.claim_bundle_id || row["CLAIM_BUNDLE_ID_"] || "").toUpperCase();
      if (bundleKey) gssMap.set(bundleKey, row);
    }
  } catch { /* GSS optional */ }

  // Filter to denied/partial rows only
  const deniedRows = allRows.filter((r) => {
    const status = val(r.res_status || r.RES_STATUS).toUpperCase();
    return status === "PARTIAL" || status === "REJECTED";
  });

  console.log(`Total rows: ${allRows.length}`);
  console.log(`Denied/Partial rows: ${deniedRows.length}`);

  // Group by BUNDLE_ID (= one claim)
  const claimGroups = new Map();
  for (const row of deniedRows) {
    const bundle = val(row.bundle_id || row.BUNDLE_ID);
    if (!claimGroups.has(bundle)) claimGroups.set(bundle, []);
    claimGroups.get(bundle).push(row);
  }

  console.log(`Unique claims (bundles): ${claimGroups.size}`);

  // Build claim-level appeal worksheet
  const appealRows = [];
  const claimSummaries = [];
  let claimIndex = 0;

  for (const [bundleId, lines] of claimGroups) {
    claimIndex++;
    const first = lines[0];
    const mrn = val(first.med_rec_no || first.MED_REC_NO);
    const patientName = val(first.patient_name || first.PATIENT_NAME);
    const invoiceNo = val(first.invoice_number || first.INVOICE_NUMBER);
    const invoiceNet = num(first.invoice_net_amount || first.INVOICE_NET_AMOUNT);
    const episodeNo = val(first.episode_no || first.EPISODE_NO);
    const attendanceType = val(first.attendance_type || first.ATTENDANCE_TYPE);
    const diagnosis = val(first.diagnosis || first.DIAGNOSIS);
    const visitDate = val(first.visit_date || first.VISIT_DATE);
    const policyHolder = val(first.policy_holder_name || first.POLICY_HOLDER_NAME);
    const apiTransId = val(first.api_trans_id || first.API_TRANS_ID);

    const gssEntry = gssMap.get(bundleId.toUpperCase());
    const gssStatus = gssEntry ? val(gssEntry.GSS_STATUS || gssEntry.gss_status || "") : "N/A";

    // Analyze each line item
    const lineDetails = [];
    const denialCategories = new Map();
    let totalClaimed = 0;
    let totalApproved = 0;
    let totalRejected = 0;
    let linesWithApproval = 0;

    for (const line of lines) {
      const pullDisplay = val(line.pull_display || line.PULL_DISPLAY);
      const denialReason = stripLinePrefix(pullDisplay);
      const serviceCode = val(line.service_code || line.SERVICE_CODE);
      const serviceDesc = val(line.service_description || line.SERVICE_DESCRIPTION);
      const gross = num(line.gross || line.GROSS);
      const netAmount = num(line.net_amount || line.NET_AMOUNT);
      const approvedAmt = num(line.approved_amount || line.APPROVED_AMOUNT);
      const rejectedAmt = num(line["Rejected Amt"] || line.rejected_amt || 0);
      const preAuthId = val(line.pre_auth_id || line.PRE_AUTH_ID);
      const approvalStatus = val(line.approval_status || line.APPROVAL_STATUS);
      const sequenceNo = val(line.sequence_no || line.SEQUENCE_NO);
      const serviceDate = val(line.service_date || line.SERVICE_DATE);
      const submitMsg = val(line.submit_claim_message || line.SUBMIT_CLAIM_MESSAGE);
      const unitPrice = num(line.unit_price_stocked_uom || line.UNIT_PRICE_STOCKED_UOM);
      const qty = num(line.qty_stocked_uom || line.QTY_STOCKED_UOM);
      const outcome = val(line.outcome || line.OUTCOME);

      totalClaimed += netAmount || gross;
      totalApproved += approvedAmt;
      totalRejected += rejectedAmt;
      if (approvedAmt > 0) linesWithApproval++;

      const classification = denialReason ? classifyDenial(denialReason) : null;
      if (classification) {
        const cat = classification.category;
        if (!denialCategories.has(cat)) denialCategories.set(cat, { ...classification, count: 0, totalAmount: 0 });
        denialCategories.get(cat).count++;
        denialCategories.get(cat).totalAmount += rejectedAmt || (netAmount - approvedAmt);
      }

      // Per-line detail for the appeal worksheet
      appealRows.push({
        ClaimNo: claimIndex,
        BundleID: bundleId,
        MRN: mrn,
        PatientName: patientName,
        InvoiceNo: invoiceNo,
        EpisodeNo: episodeNo,
        AttendanceType: attendanceType,
        SequenceNo: sequenceNo,
        ServiceCode: serviceCode,
        ServiceDescription: serviceDesc,
        ServiceDate: serviceDate,
        Qty: qty,
        UnitPrice: unitPrice,
        Gross: gross,
        NetAmount: netAmount,
        ApprovedAmount: approvedAmt || "",
        RejectedAmount: rejectedAmt || "",
        Difference: approvedAmt ? +(netAmount - approvedAmt).toFixed(2) : "",
        PreAuthID: preAuthId,
        ApprovalStatus: approvalStatus,
        Outcome: outcome,
        PULL_DISPLAY: pullDisplay,
        DenialReason: denialReason,
        DenialCategory: classification?.category || "",
        AppealType: classification?.appealType || "",
        AppealStrategy: classification?.strategy || "",
        AppealPriority: classification?.priority || "",
        AutoAppealable: classification?.autoAppealable ? "YES" : "NO",
        SubmitClaimMessage: submitMsg,
        Diagnosis: diagnosis,
        GSSStatus: gssStatus,
      });
    }

    // Claim-level summary
    const categories = [...denialCategories.entries()].sort((a, b) => b[1].count - a[1].count);
    const primaryCategory = categories[0]?.[1]?.category || "UNKNOWN";
    const primaryStrategy = categories[0]?.[1]?.strategy || "";
    const allCategories = categories.map(([cat, info]) => `${cat}(${info.count})`).join(", ");
    const autoAppealableLines = categories.filter(([, info]) => info.autoAppealable).reduce((sum, [, info]) => sum + info.count, 0);
    const totalDeniedLines = lines.filter((l) => val(l.pull_display || l.PULL_DISPLAY) !== "").length;
    const noDenialLines = lines.length - totalDeniedLines;

    claimSummaries.push({
      ClaimNo: claimIndex,
      BundleID: bundleId,
      ApiTransID: apiTransId,
      MRN: mrn,
      PatientName: patientName,
      InvoiceNo: invoiceNo,
      EpisodeNo: episodeNo,
      AttendanceType: attendanceType,
      VisitDate: visitDate,
      Diagnosis: diagnosis,
      PolicyHolder: policyHolder,
      GSSStatus: gssStatus,
      TotalLineItems: lines.length,
      LinesWithDenial: totalDeniedLines,
      LinesNoDenial: noDenialLines,
      TotalClaimed: +totalClaimed.toFixed(2),
      TotalApproved: +totalApproved.toFixed(2),
      TotalRejected: +totalRejected.toFixed(2),
      InvoiceNetAmount: invoiceNet,
      LinesWithApprovalData: linesWithApproval,
      PrimaryDenialCategory: primaryCategory,
      AllDenialCategories: allCategories,
      AutoAppealableLines: autoAppealableLines,
      ManualReviewLines: totalDeniedLines - autoAppealableLines,
      PrimaryAppealStrategy: primaryStrategy,
      AppealReadiness: autoAppealableLines === totalDeniedLines && totalDeniedLines > 0
        ? "READY_FOR_AUTO_APPEAL"
        : autoAppealableLines > 0
          ? "PARTIAL_AUTO_APPEAL"
          : totalDeniedLines > 0
            ? "MANUAL_REVIEW_REQUIRED"
            : "NO_DENIAL_REASON",
    });
  }

  // Category-level summary
  const categorySummary = [];
  const catMap = new Map();
  for (const row of appealRows) {
    if (!row.DenialCategory) continue;
    if (!catMap.has(row.DenialCategory)) {
      catMap.set(row.DenialCategory, {
        Category: row.DenialCategory,
        AppealType: row.AppealType,
        LineCount: 0,
        ClaimCount: new Set(),
        TotalClaimed: 0,
        TotalApproved: 0,
        TotalRejected: 0,
        AutoAppealable: row.AutoAppealable,
        Priority: row.AppealPriority,
        Strategy: row.AppealStrategy,
      });
    }
    const entry = catMap.get(row.DenialCategory);
    entry.LineCount++;
    entry.ClaimCount.add(row.BundleID);
    entry.TotalClaimed += num(row.NetAmount) || num(row.Gross);
    entry.TotalApproved += num(row.ApprovedAmount);
    entry.TotalRejected += num(row.RejectedAmount);
  }
  for (const [, entry] of catMap) {
    categorySummary.push({
      ...entry,
      ClaimCount: entry.ClaimCount.size,
      TotalClaimed: +entry.TotalClaimed.toFixed(2),
      TotalApproved: +entry.TotalApproved.toFixed(2),
      TotalRejected: +entry.TotalRejected.toFixed(2),
    });
  }
  categorySummary.sort((a, b) => b.LineCount - a.LineCount);

  // Appeal readiness summary
  const readinessCounts = {};
  for (const claim of claimSummaries) {
    readinessCounts[claim.AppealReadiness] = (readinessCounts[claim.AppealReadiness] || 0) + 1;
  }

  // Write outputs
  const wbOut = XLSX.utils.book_new();

  // Sheet 1: Claim Summary (one row per claim)
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(claimSummaries), "Claim Summary");

  // Sheet 2: Line Detail (every denied service line with appeal strategy)
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(appealRows), "Line Detail");

  // Sheet 3: Category Summary
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(categorySummary), "Denial Categories");

  const xlsxPath = path.join(outputDir, "appeal_resubmission_worksheet.xlsx");
  XLSX.writeFile(wbOut, xlsxPath);

  // Also write CSVs
  const csvClaims = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(claimSummaries));
  fs.writeFileSync(path.join(outputDir, "claim_appeal_summary.csv"), csvClaims, "utf8");

  const csvLines = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(appealRows));
  fs.writeFileSync(path.join(outputDir, "line_appeal_detail.csv"), csvLines, "utf8");

  const csvCategories = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(categorySummary));
  fs.writeFileSync(path.join(outputDir, "denial_category_summary.csv"), csvCategories, "utf8");

  // JSON summary
  const summary = {
    generatedAt: new Date().toISOString(),
    source: CONFIG.claimResponseWorkbook,
    totalRows: allRows.length,
    deniedPartialRows: deniedRows.length,
    approvedRows: allRows.length - deniedRows.length,
    uniqueClaims: claimGroups.size,
    appealReadiness: readinessCounts,
    denialCategoryBreakdown: categorySummary.map((c) => ({
      category: c.Category,
      lines: c.LineCount,
      claims: c.ClaimCount,
      appealType: c.AppealType,
      autoAppealable: c.AutoAppealable,
      priority: c.Priority,
      totalClaimed: c.TotalClaimed,
      totalApproved: c.TotalApproved,
      totalRejected: c.TotalRejected,
    })),
  };
  fs.writeFileSync(path.join(outputDir, "appeal_summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");

  // Console output
  console.log(`\nOutput directory: ${outputDir}`);
  console.log(`\n=== APPEAL READINESS ===`);
  for (const [status, count] of Object.entries(readinessCounts)) {
    console.log(`  ${status}: ${count} claims`);
  }
  console.log(`\n=== DENIAL CATEGORIES (${categorySummary.length} types) ===`);
  for (const cat of categorySummary) {
    console.log(`  ${cat.Category}: ${cat.LineCount} lines across ${cat.ClaimCount} claims | ${cat.AppealType} | Auto: ${cat.AutoAppealable} | Priority: ${cat.Priority}`);
    console.log(`    Claimed: ${cat.TotalClaimed} | Approved: ${cat.TotalApproved} | Rejected: ${cat.TotalRejected}`);
  }
  console.log(`\nGenerated: ${xlsxPath}`);
}

main();
