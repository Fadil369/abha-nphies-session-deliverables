import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = process.cwd();
const CONFIG = {
  rawWorkbook: path.resolve(ROOT, "MOH-JAN-ABHA", "MINISTRY_OF_HEALTH_MOH-187_2026-01_Ts2026-04-01_09-54-05_Sid3172.xlsx"),
  validationWorkbook: path.resolve(ROOT, "MOH-JAN-ABHA", "claim_response_Abha_01012026_31012026_20260401_100719.xlsx"),
  gssWorkbook: path.resolve(ROOT, "MOH-JAN-ABHA", "GSS.xlsx"),
  oracleReport: path.resolve(ROOT, "artifacts", "oracle-portal", "run-2026-02-16T06-40-24-236Z", "claims_processing_report.json"),
  validationQueue: path.resolve(ROOT, "artifacts", "oracle-portal", "run-2026-02-16T06-40-24-236Z", "validation_queue.json"),
  outputRoot: path.resolve(ROOT, "artifacts", "abha-nphies-analysis"),
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeKeyPart(value) {
  return normalizeValue(value).toUpperCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = normalizeValue(value);
    if (text) return text;
  }
  return "";
}

function readWorkbookRows(filePath, preferredSheet) {
  const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false });
  const sheetName = preferredSheet || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet '${preferredSheet}' not found in ${filePath}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return rows.map((row, index) => {
    const normalized = { __row_number: index + 2 };
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = normalizeValue(value);
    }
    return normalized;
  });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getMatchKey(row) {
  return [
    normalizeKeyPart(row.api_trans_id),
    normalizeKeyPart(row.bundle_id),
    normalizeKeyPart(row.invoice_number),
    normalizeKeyPart(row.service_code),
    normalizeKeyPart(row.service_date),
    normalizeKeyPart(row.net_amount),
  ].join("|");
}

function getClaimGroupKey(row) {
  return [normalizeKeyPart(row.api_trans_id), normalizeKeyPart(row.bundle_id)].join("|");
}

function getInvoiceMrnKey(invoiceNumber, mrn) {
  return [normalizeKeyPart(invoiceNumber), normalizeKeyPart(mrn)].join("|");
}

function getBundleKey(bundleId) {
  return normalizeKeyPart(bundleId);
}

function getRejectionCodes(text) {
  const matches = String(text ?? "").match(/[A-Z]{2}-\d-\d+/g) ?? [];
  return [...new Set(matches.map((code) => code.trim().toUpperCase()))];
}

function getServiceModule(serviceType, serviceDescription, diagnosis, codes) {
  const text = `${serviceType} ${serviceDescription} ${diagnosis} ${codes.join(" ")}`.toLowerCase();
  if (codes.includes("CV-4-10")) return "SFDA module";
  if (/(ct|x\s*-?ray|mri|radiology|imaging|ultrasound|scan)/.test(text)) return "Radiology module";
  if (/(consult|icu|progress|clinical|wound toilet|room|board|procedure|operative|visit)/.test(text)) return "Progress Notes/Documents Panel";
  if (/(device|implant|stent|catheter|drug|medication|tablet|capsule|vial|injection|sfda)/.test(text)) return "Laboratory or SFDA module";
  if (/(lab|laboratory|culture|cbc|chemistry)/.test(text)) return "Laboratory module";
  return "Manual Oracle review";
}

function getExpectedDocuments(mrn, serviceModule, codes) {
  const docs = new Set();
  const add = (name) => name && docs.add(name);

  if (codes.includes("SE-1-8") || codes.includes("MN-1-1")) {
    if (serviceModule === "Radiology module") {
      add(`${mrn}_Radiology_Reports.pdf`);
      add(`${mrn}_Imaging_Studies.pdf`);
    } else if (serviceModule === "Progress Notes/Documents Panel") {
      add(`${mrn}_Clinical_Notes.pdf`);
      add(`${mrn}_Progress_Notes.pdf`);
      add(`${mrn}_Procedure_Notes.pdf`);
      add(`${mrn}_Operative_Reports.pdf`);
    } else if (serviceModule === "Laboratory module") {
      add(`${mrn}_Laboratory_Results.pdf`);
      add(`${mrn}_Lab_Reports.pdf`);
    } else {
      add(`${mrn}_Clinical_Notes.pdf`);
      add(`${mrn}_Medical_Justification_Letter.pdf`);
    }
  }

  if (codes.includes("BE-1-4") || codes.includes("BE-1-6")) {
    add(`${mrn}_Prior_Authorization.pdf`);
    add(`${mrn}_Medical_Justification_Letter.pdf`);
  }

  if (codes.includes("AD-3-3")) {
    add(`${mrn}_Procedure_Notes.pdf`);
    add(`${mrn}_Medical_Justification_Letter.pdf`);
  }

  if (codes.includes("CV-4-10")) {
    add(`${mrn}_SFDA_Mapping_Certificate.pdf`);
    add(`${mrn}_Medical_Justification_Letter.pdf`);
  }

  return [...docs];
}

function getNphiesAction(codes, hasMixedEpisodeOutcomes) {
  if (codes.includes("SE-1-8") || codes.includes("MN-1-1") || codes.includes("CV-4-10")) {
    return "Action 1: Resubmit with Supporting Info";
  }
  if (codes.includes("BE-1-4") || codes.includes("BE-1-6") || codes.includes("AD-3-3")) {
    return "Action 2: Communication - Contractual Appeal";
  }
  if (hasMixedEpisodeOutcomes) {
    return "Action 3: New Claim - Prior Linkage";
  }
  return "Manual Review";
}

function getRelationshipTag(action) {
  return action === "Action 3: New Claim - Prior Linkage" ? "prior" : "";
}

function getPortalVerificationStatus(codes, serviceModule, collectedDocuments) {
  if (collectedDocuments.length > 0) return "Oracle artifact evidence found";
  if (codes.includes("BE-1-4") || codes.includes("BE-1-6")) {
    return "Portal reachable; patient approval limit pending live verification";
  }
  if (codes.includes("SE-1-8") || codes.includes("MN-1-1") || codes.includes("CV-4-10")) {
    return `Oracle module mapped; live document retrieval pending from ${serviceModule}`;
  }
  if (codes.includes("AD-3-3")) {
    return "Communication review pending separate-procedure medical necessity evidence";
  }
  return "Manual portal review required";
}

function getAppealProbability(codes, action) {
  if (codes.includes("BE-1-4") || codes.includes("BE-1-6") || codes.includes("AD-3-3")) return "High";
  if (codes.includes("SE-1-8") || codes.includes("MN-1-1") || codes.includes("CV-4-10")) return "Low";
  if (action === "Action 3: New Claim - Prior Linkage") return "High";
  return "Low";
}

function getJustificationText({ action, codes, serviceDescription, episodeNo, portalStatus, expectedDocuments, detailedNote, claimNetAmount, gssStatus }) {
  const codeSummary = codes.length ? codes.join(", ") : "No structured rejection code found";
  const documentSummary = expectedDocuments.length ? expectedDocuments.join(", ") : "No document template generated";
  const noteSummary = detailedNote || "No detailed note was present in claim_response_Abha.";
  if (action === "Action 1: Resubmit with Supporting Info") {
    return `Resubmit claim item for episode ${episodeNo} and service '${serviceDescription}'. Rejection codes: ${codeSummary}. Oracle evidence path: ${portalStatus}. Supporting documents to collect or attach: ${documentSummary}. Clinical note: ${noteSummary}`;
  }
  if (action === "Action 2: Communication - Contractual Appeal") {
    return `Raise contractual appeal for episode ${episodeNo} and service '${serviceDescription}'. Rejection codes: ${codeSummary}. Claim net amount: ${claimNetAmount}. GSS status: ${gssStatus}. Portal review status: ${portalStatus}. Supporting narrative: ${noteSummary}`;
  }
  if (action === "Action 3: New Claim - Prior Linkage") {
    return `Create a new linked claim item with relationship tag prior for episode ${episodeNo} and service '${serviceDescription}'. Rejection codes: ${codeSummary}. Mixed outcomes inside the same episode indicate prior linkage or add-on submission handling. Supporting narrative: ${noteSummary}`;
  }
  return `Manual review required for episode ${episodeNo} and service '${serviceDescription}'. Rejection codes: ${codeSummary}. Portal review status: ${portalStatus}. Note: ${noteSummary}`;
}

function writeCsv(filePath, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  fs.writeFileSync(filePath, csv, "utf8");
}

function writeWorkbook(filePath, rows, sheetName) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);
}

function main() {
  const outputDir = path.join(CONFIG.outputRoot, `run-${timestampId()}`);
  ensureDir(outputDir);

  const rawRows = readWorkbookRows(CONFIG.rawWorkbook, "Raw");
  const validationRows = readWorkbookRows(CONFIG.validationWorkbook, "Sheet1");
  const gssRows = readWorkbookRows(CONFIG.gssWorkbook, "GSS.csv");

  const oracleReport = readJson(CONFIG.oracleReport, { claims: [] });
  const validationQueue = readJson(CONFIG.validationQueue, []);

  const oracleByInvoiceMrn = new Map();
  for (const claim of oracleReport.claims ?? []) {
    const key = getInvoiceMrnKey(claim.invoiceNumber, claim.mrn);
    const documents = (claim.attachmentAudit ?? [])
      .filter((item) => item.status === "matched")
      .map((item) => normalizeValue(item.fileName))
      .filter(Boolean);
    oracleByInvoiceMrn.set(key, {
      oracleFound: Boolean(claim.oracleFound),
      nphiesReady: Boolean(claim.nphiesReady),
      documents,
    });
  }

  const gateByInvoiceMrn = new Map();
  for (const item of validationQueue) {
    const key = getInvoiceMrnKey(item.invoiceNumber, item.mrn);
    gateByInvoiceMrn.set(key, {
      status: normalizeValue(item.status),
      oracleFound: Boolean(item.oracleFound),
      nphiesReady: Boolean(item.nphiesReady),
      missingAttachmentTypes: Array.isArray(item.missingAttachmentTypes) ? item.missingAttachmentTypes : [],
    });
  }

  const validationByKey = new Map();
  const validationByGroup = new Map();
  const validationRowsTracked = validationRows.map((row, index) => ({ ...row, __match_index: index, __used: false }));
  for (const row of validationRowsTracked) {
    const key = getMatchKey(row);
    if (!validationByKey.has(key)) validationByKey.set(key, []);
    validationByKey.get(key).push(row);

    const groupKey = getClaimGroupKey(row);
    if (!validationByGroup.has(groupKey)) validationByGroup.set(groupKey, []);
    validationByGroup.get(groupKey).push(row);
  }

  const gssByBundle = new Map();
  for (const row of gssRows) {
    const key = getBundleKey(firstNonEmpty(row.claim_bundle_id, row.claim_bundle_id_));
    if (key) gssByBundle.set(key, row);
  }

  const mergedRows = [];
  let validationFallbackMisses = 0;
  for (let index = 0; index < rawRows.length; index += 1) {
    const rawRow = rawRows[index];
    let validationRow = null;
    const candidate = validationRowsTracked[index];
    if (candidate && !candidate.__used && normalizeKeyPart(candidate.api_trans_id) === normalizeKeyPart(rawRow.api_trans_id)) {
      validationRow = candidate;
    } else {
      const key = getMatchKey(rawRow);
      const pool = validationByKey.get(key) ?? [];
      validationRow = pool.find((row) => !row.__used) ?? null;
      if (!validationRow) {
        const groupKey = getClaimGroupKey(rawRow);
        const groupPool = (validationByGroup.get(groupKey) ?? []).filter((row) => !row.__used);
        validationRow =
          groupPool.find((row) =>
            normalizeKeyPart(row.service_code) === normalizeKeyPart(rawRow.service_code) &&
            normalizeKeyPart(row.service_description) === normalizeKeyPart(rawRow.service_description) &&
            normalizeKeyPart(row.invoice_number) === normalizeKeyPart(rawRow.invoice_number),
          ) ??
          groupPool.find((row) =>
            normalizeKeyPart(row.service_code) === normalizeKeyPart(rawRow.service_code) &&
            normalizeKeyPart(row.invoice_number) === normalizeKeyPart(rawRow.invoice_number),
          ) ??
          groupPool.find((row) => normalizeKeyPart(row.service_code) === normalizeKeyPart(rawRow.service_code)) ??
          groupPool[0] ??
          null;
      }
      if (!validationRow) validationFallbackMisses += 1;
    }

    if (validationRow) {
      validationRow.__used = true;
    }

    const status = firstNonEmpty(validationRow?.res_status, rawRow.res_status).toUpperCase();
    const outcome = firstNonEmpty(validationRow?.outcome, rawRow.outcome).toUpperCase();
    const rawMessage = firstNonEmpty(rawRow.submit_claim_message, validationRow?.submit_claim_message);
    const detailedNote = firstNonEmpty(validationRow?.notes, validationRow?.submit_claim_message, rawRow.notes);
    const bundleId = firstNonEmpty(rawRow.bundle_id, validationRow?.bundle_id);
    mergedRows.push({
      raw: rawRow,
      validation: validationRow ?? {},
      resStatus: status,
      outcome,
      rawMessage,
      detailedNote,
      codes: getRejectionCodes(`${rawMessage} ${detailedNote}`),
      mrn: firstNonEmpty(rawRow.med_rec_no, validationRow?.med_rec_no),
      invoiceNumber: firstNonEmpty(rawRow.invoice_number, validationRow?.invoice_number, rawRow.invoice_no, validationRow?.invoice_no),
      bundleId,
      gss: gssByBundle.get(getBundleKey(bundleId)) ?? {},
    });
  }

  const episodeMap = new Map();
  for (const row of mergedRows) {
    const episodeKey = [normalizeKeyPart(row.raw.episode_no), normalizeKeyPart(row.mrn), normalizeKeyPart(row.bundleId)].join("|");
    const entry = episodeMap.get(episodeKey) ?? { hasApproved: false, hasPartialOrRejected: false };
    if (row.resStatus === "APPROVED" || row.outcome === "APPROVED") entry.hasApproved = true;
    if (["PARTIAL", "REJECTED"].includes(row.resStatus) || ["PARTIAL", "REJECTED"].includes(row.outcome)) entry.hasPartialOrRejected = true;
    episodeMap.set(episodeKey, entry);
  }

  const analysisRows = [];
  const payloadRows = [];
  const portalQueue = [];
  const portalQueueSeen = new Set();
  const actionCounts = {};
  const rejectionCodeCounts = {};
  let oracleArtifactMatches = 0;

  for (const row of mergedRows) {
    if (!["PARTIAL", "REJECTED"].includes(row.resStatus) && !["PARTIAL", "REJECTED"].includes(row.outcome)) {
      continue;
    }

    const serviceModule = getServiceModule(
      firstNonEmpty(row.raw.service_type, row.validation.service_type),
      firstNonEmpty(row.raw.service_description, row.validation.service_description),
      firstNonEmpty(row.raw.diagnosis, row.validation.diagnosis),
      row.codes,
    );
    const expectedDocuments = getExpectedDocuments(row.mrn, serviceModule, row.codes);
    const invoiceMrnKey = getInvoiceMrnKey(row.invoiceNumber, row.mrn);
    const oracleEvidence = oracleByInvoiceMrn.get(invoiceMrnKey) ?? null;
    const gateEvidence = gateByInvoiceMrn.get(invoiceMrnKey) ?? null;
    const collectedDocuments = oracleEvidence?.documents ?? [];
    if (oracleEvidence) oracleArtifactMatches += 1;

    const episodeKey = [normalizeKeyPart(row.raw.episode_no), normalizeKeyPart(row.mrn), normalizeKeyPart(row.bundleId)].join("|");
    const episodeSummary = episodeMap.get(episodeKey) ?? { hasApproved: false, hasPartialOrRejected: false };
    const action = getNphiesAction(row.codes, episodeSummary.hasApproved && episodeSummary.hasPartialOrRejected);
    const relationshipTag = getRelationshipTag(action);
    const portalStatus = getPortalVerificationStatus(row.codes, serviceModule, collectedDocuments);
    const claimNetAmount = firstNonEmpty(row.gss.total_claim_net_amount, row.raw.invoice_net_amount, row.validation.invoice_net_amount, row.raw.net_amount, row.validation.net_amount);
    const gssStatus = firstNonEmpty(row.gss.gss_status, "Missing");
    const appealProbability = getAppealProbability(row.codes, action);
    const claimItemSequence = firstNonEmpty(row.validation.sequence_no, row.raw.__row_number);
    const oracleEvidenceStatus = firstNonEmpty(gateEvidence?.status, oracleEvidence?.nphiesReady ? "READY" : "No current Oracle artifact match");
    const justification = getJustificationText({
      action,
      codes: row.codes,
      serviceDescription: firstNonEmpty(row.raw.service_description, row.validation.service_description),
      episodeNo: firstNonEmpty(row.raw.episode_no, row.validation.episode_no),
      portalStatus,
      expectedDocuments,
      detailedNote: row.detailedNote,
      claimNetAmount,
      gssStatus,
    });

    for (const code of row.codes) {
      rejectionCodeCounts[code] = (rejectionCodeCounts[code] ?? 0) + 1;
    }
    actionCounts[action] = (actionCounts[action] ?? 0) + 1;

    const analysisRow = {
      BundleID: row.bundleId,
      ApiTransID: firstNonEmpty(row.raw.api_trans_id, row.validation.api_trans_id),
      EpisodeNo: firstNonEmpty(row.raw.episode_no, row.validation.episode_no),
      MRN: row.mrn,
      PatientName: firstNonEmpty(row.raw.patient_name, row.validation.patient_name),
      ServiceCode: firstNonEmpty(row.raw.service_code, row.validation.service_code),
      ServiceDescription: firstNonEmpty(row.raw.service_description, row.validation.service_description),
      PrimaryRejectionCode: firstNonEmpty(row.codes[0]),
      AllRejectionCodes: row.codes.join(", "),
      ClaimStatus: row.resStatus,
      Outcome: row.outcome,
      RawMessage: row.rawMessage,
      DetailedNote: row.detailedNote,
      PortalVerificationStatus: portalStatus,
      GSSStatus: gssStatus,
      ClaimNetAmount: claimNetAmount,
      LineNetAmount: firstNonEmpty(row.raw.net_amount, row.validation.net_amount),
      PatientApprovalLimit: "",
      AppealProbability: appealProbability,
      ServiceModule: serviceModule,
      CollectedDocFilenames: collectedDocuments.join(" | "),
      ExpectedDocFilenames: expectedDocuments.join(" | "),
      NPHIESAction: action,
      NPHIESRelationshipTag: relationshipTag,
      ClaimItemSequence: claimItemSequence,
      OracleEvidenceStatus: oracleEvidenceStatus,
      JustificationContent: justification,
    };
    analysisRows.push(analysisRow);

    if (action !== "Manual Review") {
      payloadRows.push({
        BundleID: analysisRow.BundleID,
        ApiTransID: analysisRow.ApiTransID,
        EpisodeNo: analysisRow.EpisodeNo,
        MRN: analysisRow.MRN,
        PatientName: analysisRow.PatientName,
        NPHIESAction: action,
        RelationshipTag: relationshipTag,
        ClaimItemSequence: claimItemSequence,
        contentString: justification,
        ExpectedDocFilenames: expectedDocuments,
        PortalVerificationStatus: portalStatus,
        GSSStatus: gssStatus,
      });
    }

    if (row.codes.includes("BE-1-4") || row.codes.includes("BE-1-6")) {
      const portalQueueKey = [analysisRow.BundleID, analysisRow.ApiTransID, analysisRow.EpisodeNo, analysisRow.MRN].join("|");
      if (!portalQueueSeen.has(portalQueueKey)) {
        portalQueueSeen.add(portalQueueKey);
        portalQueue.push({
          BundleID: analysisRow.BundleID,
          ApiTransID: analysisRow.ApiTransID,
          EpisodeNo: analysisRow.EpisodeNo,
          MRN: analysisRow.MRN,
          PatientName: analysisRow.PatientName,
          ClaimNetAmount: claimNetAmount,
          GSSStatus: gssStatus,
          RejectionCodes: row.codes.join(", "),
          SearchInstruction: "Login to Oracle portal, search patient by MRN or Patient ID, and capture Patient Approval Limit for contractual appeal validation.",
        });
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceRowCounts: {
      raw: rawRows.length,
      validation: validationRows.length,
      gss: gssRows.length,
    },
    filteredRowCount: analysisRows.length,
    actionablePayloadCount: payloadRows.length,
    portalLimitQueueCount: portalQueue.length,
    validationFallbackMisses,
    oracleArtifactMatches,
    actionCounts,
    rejectionCodeCounts,
    notes: [
      "The current Oracle artifact run does not materially overlap the MOH Abha workbook, so collected document filenames stay blank unless a direct invoice/MRN match exists.",
      "Patient approval limits are not present in the offline artifacts. BE-1-4 and BE-1-6 rows are queued for live portal verification.",
      "The Oracle portal login page is reachable from this environment, but this analysis is offline and rule-based.",
    ],
  };

  writeCsv(path.join(outputDir, "master_claim_actions.csv"), analysisRows);
  writeWorkbook(path.join(outputDir, "master_claim_actions.xlsx"), analysisRows, "Actions");
  writeCsv(path.join(outputDir, "portal_limit_check_queue.csv"), portalQueue);
  fs.writeFileSync(path.join(outputDir, "actionable_claims_payload.json"), `${JSON.stringify({ metadata: { generatedAt: new Date().toISOString(), totalActionableRows: payloadRows.length }, actionableClaims: payloadRows }, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "analysis_summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Output directory: ${outputDir}`);
  console.log(`Filtered rows: ${analysisRows.length}`);
  console.log(`Actionable payload rows: ${payloadRows.length}`);
  console.log(`Portal limit queue rows: ${portalQueue.length}`);
}

main();