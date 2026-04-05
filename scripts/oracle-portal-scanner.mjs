/**
 * oracle-portal-scanner.mjs  v1.0
 * Scans 289 patients from portal_limit_check_queue.csv
 * 
 * For each MRN:
 *  1. Search patient by MRN
 *  2. Capture patient demographics (name, DOB, PatientID, NationalID, Doctor, Status)
 *  3. Open Patient Details → capture Insurance section (purchaser, policy, dates, contract)
 *  4. Open Patient Visits → capture all episode visits
 *  5. Save everything to CSV + JSON
 *
 * Usage:
 *   node scripts/oracle-portal-scanner.mjs [--start 0] [--limit 289] [--headless true]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// CLI args
const argv = process.argv.slice(2);
const arg = (flag, def) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : def; };
const START = parseInt(arg("--start", "0"), 10);
const LIMIT = parseInt(arg("--limit", "289"), 10);
const HEADLESS = arg("--headless", "true") === "true";
const RESUME_DIR = arg("--resume", "");

const ORACLE_URL = "https://oracle-abha.brainsait.org/Oasis/faces/Home";
const ORACLE_HTTP_URL = "http://oracle-abha.brainsait.org/Oasis/faces/Home"; // After login, session lives on HTTP
const USER = "U36113";
const PASS = "U36113";
const QUEUE_CSV = resolve("outputs/portal_limit_check_queue.csv");

// Output directory - resume from existing or create new
let OUT_DIR;
if (RESUME_DIR) {
  OUT_DIR = resolve(RESUME_DIR);
} else {
  // Auto-detect latest checkpoint to resume from
  const { readdirSync } = await import("fs").then(m => m.default || m);
  const scanDirs = readdirSync(resolve("outputs"))
    .filter(d => d.startsWith("oracle-scan-"))
    .sort()
    .reverse();
  const resumable = scanDirs.find(d => existsSync(join(resolve("outputs"), d, "checkpoint.json")));
  if (resumable) {
    OUT_DIR = resolve(`outputs/${resumable}`);
    console.log(`Resuming from: ${resumable}`);
  } else {
    const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    OUT_DIR = resolve(`outputs/oracle-scan-${TS}`);
  }
}
mkdirSync(OUT_DIR, { recursive: true });
const CHECKPOINT_FILE = join(OUT_DIR, "checkpoint.json");
const RESULTS_FILE = join(OUT_DIR, "scan_results.json");
const RESULTS_CSV = join(OUT_DIR, "scan_results.csv");

// Parse CSV queue
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map(line => {
    const vals = [];
    let inQuote = false, current = "";
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { vals.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    vals.push(current.trim());
    const obj = {};
    header.forEach((h, i) => { obj[h.trim()] = vals[i] || ""; });
    return obj;
  });
}

const queue = parseCSV(readFileSync(QUEUE_CSV, "utf8"));
console.log(`Queue loaded: ${queue.length} patients`);

// Checkpoint
let checkpoint = { processed: [], results: [] };
if (existsSync(CHECKPOINT_FILE)) {
  try {
    checkpoint = JSON.parse(readFileSync(CHECKPOINT_FILE, "utf8"));
    console.log(`Checkpoint: ${checkpoint.processed.length} already processed`);
  } catch { /* fresh start */ }
}

// Filter to pending
const pending = queue.filter(q => !checkpoint.processed.includes(q.MRN)).slice(START, START + LIMIT);
console.log(`Pending: ${pending.length} patients to scan\n`);

if (!pending.length) {
  console.log("All patients already scanned.");
  process.exit(0);
}

// === Browser helpers ===
async function login(page) {
  await page.goto(ORACLE_URL, { waitUntil: "networkidle", timeout: 30000 });
  const userInput = page.locator('input[placeholder="Enter your user name"]');
  await userInput.click();
  await page.keyboard.type(USER, { delay: 20 });
  await page.locator('input[type="password"]').click();
  await page.keyboard.type(PASS, { delay: 20 });
  await page.locator("a#login").click({ force: true });
  await page.waitForTimeout(3000);
  
  // Handle session conflict
  const yesBtn = page.locator('a:has-text("Yes"), button:has-text("Yes")').first();
  if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await yesBtn.click({ force: true });
    await page.waitForTimeout(5000);
  }
  if (page.url().includes("Login")) {
    await page.waitForTimeout(5000);
    if (page.url().includes("Login")) {
      await page.locator("a#login").click({ force: true });
      await page.waitForTimeout(3000);
      const yb2 = page.locator('a:has-text("Yes")').first();
      if (await yb2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await yb2.click({ force: true });
        await page.waitForTimeout(5000);
      }
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  return !page.url().includes("Login");
}

// Navigate to Patient Search on a fresh page
async function openPatientSearch(page) {
  await page.mouse.click(285, 38);
  await page.waitForTimeout(1500);
  const items = await page.getByText("Patient Search", { exact: true }).all();
  for (const item of items) {
    if (await item.isVisible().catch(() => false)) {
      await item.click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  const sf = page.locator('input[placeholder="Search IDs, Phones and Names "]');
  await sf.waitFor({ state: "visible", timeout: 10000 });
}

async function searchPatient(page, mrn) {
  const searchField = page.locator('input[placeholder="Search IDs, Phones and Names "]');
  await searchField.click({ force: true });
  await searchField.fill("");
  await page.keyboard.type(mrn, { delay: 20 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

function extractPatientCard(text) {
  // Parse the patient search result card
  const result = {
    patientName: "",
    patientId: "",
    mrn: "",
    dateOfBirth: "",
    age: "",
    status: "",
    doctor: "",
    lastVisitDate: "",
    registerDate: "",
    mobileNo: "",
    motherName: "",
  };

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("Patient ID") || l.startsWith("Patient Id")) {
      result.patientId = l.replace(/Patient\s*I[Dd]\s*/, "").trim();
    } else if (l.startsWith("MRN")) {
      result.mrn = l.replace(/MRN\s*/, "").trim();
    } else if (l.startsWith("Date of Birth") || l.startsWith("Date Of Birth")) {
      result.dateOfBirth = l.replace(/Date\s*[Oo]f\s*Birth\s*/, "").trim();
    } else if (l.startsWith("Age")) {
      result.age = l.replace(/Age\s*/, "").trim();
    } else if (l.match(/^(ACTIVE|INACTIVE|DISABLED)/)) {
      result.status = l;
    } else if (l.startsWith("Doctor")) {
      result.doctor = lines[i + 1] || "";
    } else if (l.startsWith("Last Visit Date")) {
      result.lastVisitDate = l.replace(/Last Visit Date\s*/, "").trim();
    } else if (l.startsWith("Register Date")) {
      result.registerDate = l.replace(/Register Date\s*/, "").trim();
    } else if (l.startsWith("Mobile No")) {
      result.mobileNo = l.replace(/Mobile No\s*/, "").trim();
    } else if (l.startsWith("Mother Name")) {
      result.motherName = l.replace(/Mother Name\s*/, "").trim();
    }
  }

  // Patient name: look for a name line that's near MRN/PatientID,
  // not the hospital name ("Hayat National Hospital")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^[A-Z][a-z]+ [A-Z]/) && 
        !lines[i].includes("Hospital") && !lines[i].includes("Hayat") &&
        !lines[i].includes("Search") && !lines[i].includes("Register") &&
        !lines[i].includes("Module") && !lines[i].includes("Default")) {
      result.patientName = lines[i].replace(/[♂♀]/g, "").trim();
      break;
    }
  }

  return result;
}

function extractInsurance(text) {
  // Find Insurance section
  const insurIdx = text.indexOf("Insurance");
  if (insurIdx < 0) return [];

  const section = text.substring(insurIdx);
  const records = [];
  
  // Pattern: lines with "From :" and "To :" indicate insurance records
  const lines = section.split("\n").map(l => l.trim()).filter(Boolean);
  let current = null;
  
  for (const l of lines) {
    if (l.match(/^(Adt|Opd|Contacts|Disabilities|Extra Info)/i) && !l.startsWith("Adt Cash") && !l.startsWith("Adt (")) {
      if (l.startsWith("Contacts") || l.startsWith("Disabilities") || l.startsWith("Extra Info")) break;
    }
    if (l.match(/^(Adt|Opd)/i)) {
      if (current) records.push(current);
      current = { type: l, purchaser: "", fromDate: "", toDate: "" };
    } else if (current) {
      if (l.match(/^From\s*:/i)) {
        current.fromDate = l.replace(/From\s*:\s*/i, "");
      } else if (l.match(/^To\s*:/i)) {
        current.toDate = l.replace(/To\s*:\s*/i, "");
      } else if (!l.match(/^\+|Clear|Add/) && !current.purchaser) {
        current.purchaser = l;
      }
    }
  }
  if (current) records.push(current);
  return records;
}

function extractVisits(text) {
  const visits = [];
  // Match episode patterns: number + type
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(/^(\d+)\s+(Admission|Outpatint Visit|Daycase|Emergency|External)/i);
    if (match) {
      const visit = {
        episodeNo: match[1],
        type: match[2],
        outcome: lines[i].replace(match[0], "").trim(),
        specialty: "",
        consultant: "",
        startDate: "",
        endDate: "",
      };
      // Next lines have specialty, consultant, dates
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        if (lines[j].match(/Dept$/)) visit.specialty = lines[j];
        else if (lines[j].match(/^\d{2}-\d{2}-\d{4}/)) {
          const dates = lines[j].match(/(\d{2}-\d{2}-\d{4}\s*\d{2}:\d{2})/g) || [];
          if (dates.length >= 1) visit.startDate = dates[0];
          if (dates.length >= 2) visit.endDate = dates[1];
        }
        else if (lines[j].match(/^[A-Z][a-z]+ [A-Z]/) && !visit.consultant) {
          visit.consultant = lines[j];
        }
      }
      visits.push(visit);
    }
    i++;
  }
  return visits;
}

// Save results
function saveCheckpoint() {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function saveResults() {
  writeFileSync(RESULTS_FILE, JSON.stringify(checkpoint.results, null, 2));

  // CSV
  if (checkpoint.results.length === 0) return;
  const headers = [
    "MRN", "PatientName", "PatientID", "NationalID", "DOB", "Age", "Status", 
    "Doctor", "LastVisitDate", "RegisterDate", "MobileNo",
    "InsuranceType1", "Purchaser1", "InsFrom1", "InsTo1",
    "InsuranceType2", "Purchaser2", "InsFrom2", "InsTo2",
    "EpisodeCount", "LatestEpisode", "LatestType", "LatestDate",
    "ClaimNetAmount", "RejectionCodes", "ScanStatus"
  ];
  const rows = checkpoint.results.map(r => {
    const ins1 = r.insurance?.[0] || {};
    const ins2 = r.insurance?.[1] || {};
    const latestVisit = r.visits?.[0] || {};
    return [
      r.mrn, r.patientName, r.patientId, r.nationalId || "", r.dateOfBirth, r.age, r.status,
      r.doctor, r.lastVisitDate, r.registerDate, r.mobileNo,
      ins1.type || "", ins1.purchaser || "", ins1.fromDate || "", ins1.toDate || "",
      ins2.type || "", ins2.purchaser || "", ins2.fromDate || "", ins2.toDate || "",
      r.visits?.length || 0, latestVisit.episodeNo || "", latestVisit.type || "", latestVisit.startDate || "",
      r.claimNetAmount || "", r.rejectionCodes || "", r.scanStatus || ""
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  writeFileSync(RESULTS_CSV, headers.join(",") + "\n" + rows.join("\n"));
}

// === MAIN ===
async function main() {
  const browser = await chromium.launch({
    headless: HEADLESS,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--ignore-certificate-errors", "--disable-web-security"],
  });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 2000 } });

  // Phase 1: Login on initial page to establish session cookies
  console.log("Logging in...");
  let page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  if (!(await login(page))) {
    console.error("Login failed");
    await browser.close();
    process.exit(1);
  }
  const homeUrl = page.url(); // Capture HTTP URL (session lives on HTTP)
  await page.close();
  console.log("Logged in. Starting scan...\n");

  let errorCount = 0;

  for (let idx = 0; idx < pending.length; idx++) {
    const patient = pending[idx];
    const mrn = patient.MRN;
    const progress = `[${idx + 1}/${pending.length}]`;

    try {
      console.log(`${progress} Scanning MRN ${mrn} (${patient.PatientName})...`);

      // Open a fresh page per patient (resets ADF task flow state)
      page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      await page.goto(homeUrl, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);

      // Handle session conflict dialog
      const yesBtn = page.locator('a:has-text("Yes"), button:has-text("Yes")').first();
      if (await yesBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await yesBtn.click({ force: true });
        await page.waitForTimeout(3000);
      }

      // Check if session expired (shows login page)
      if (page.url().includes("Login")) {
        console.log(`  Re-logging in...`);
        if (!(await login(page))) throw new Error("Re-login failed");
      }

      // Navigate to Patient Search
      await openPatientSearch(page);

      // Search by MRN
      await searchPatient(page, mrn);

      // Extract patient card data
      const bodyText = await page.locator("body").innerText();
      const card = extractPatientCard(bodyText);

      // If no patient found
      if (!card.mrn && !bodyText.includes(mrn)) {
        console.log(`  -> NOT FOUND`);
        checkpoint.results.push({
          mrn,
          patientName: patient.PatientName,
          scanStatus: "NOT_FOUND",
          claimNetAmount: patient.ClaimNetAmount,
          rejectionCodes: patient.RejectionCodes,
          insurance: [],
          visits: [],
        });
        checkpoint.processed.push(mrn);
        saveCheckpoint();
        await page.close();
        continue;
      }

      // === Patient Details → Insurance + National ID ===
      let insurance = [];
      let nationalId = "";
      const detailsBtn = page.getByText("Patient Details", { exact: true }).first();
      if (await detailsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await detailsBtn.click({ force: true });
        await page.waitForTimeout(6000);
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

        const detailText = await page.locator("body").innerText();
        insurance = extractInsurance(detailText);

        const natMatch = detailText.match(/National\s*Id\s*(\d+)/i);
        if (natMatch) nationalId = natMatch[1];
      }
      await page.close();

      // === Patient Visits → Open new page, re-search, get visits ===
      let visits = [];
      page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      await page.goto(homeUrl, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const yb2 = page.locator('a:has-text("Yes"), button:has-text("Yes")').first();
      if (await yb2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await yb2.click({ force: true });
        await page.waitForTimeout(3000);
      }
      // Re-login if session expired on new page
      if (page.url().includes("Login")) {
        if (await login(page)) {
          // Update homeUrl in case it changed
        }
      }
      try {
        await openPatientSearch(page);
        await searchPatient(page, mrn);

        const visitsBtn = page.getByText("Patient Visits", { exact: true }).first();
        if (await visitsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await visitsBtn.click({ force: true });
          await page.waitForTimeout(6000);
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

          const visitsText = await page.locator("body").innerText();
          visits = extractVisits(visitsText);
        }
      } catch (visitErr) {
        // Visits extraction failed — continue with empty visits
      }
      await page.close();

      // Build result — use queue patient name (card extraction unreliable for names)
      const result = {
        mrn: card.mrn || mrn,
        patientName: patient.PatientName,
        patientId: card.patientId,
        nationalId,
        dateOfBirth: card.dateOfBirth,
        age: card.age,
        status: card.status,
        doctor: card.doctor,
        lastVisitDate: card.lastVisitDate,
        registerDate: card.registerDate,
        mobileNo: card.mobileNo,
        insurance,
        visits,
        claimNetAmount: patient.ClaimNetAmount,
        rejectionCodes: patient.RejectionCodes,
        scanStatus: "OK",
      };

      console.log(`  -> ${patient.PatientName} | PatID=${card.patientId} | NatID=${nationalId} | Ins=${insurance.length} | Visits=${visits.length}`);

      checkpoint.results.push(result);
      checkpoint.processed.push(mrn);
      errorCount = 0;

      // Save every 5 patients
      if ((idx + 1) % 5 === 0) {
        saveCheckpoint();
        saveResults();
        console.log(`  [checkpoint saved: ${checkpoint.processed.length} total]\n`);
      }

    } catch (err) {
      console.error(`  -> ERROR: ${err.message.substring(0, 150)}`);
      errorCount++;
      
      checkpoint.results.push({
        mrn,
        patientName: patient.PatientName,
        scanStatus: `ERROR: ${err.message.substring(0, 100)}`,
        claimNetAmount: patient.ClaimNetAmount,
        rejectionCodes: patient.RejectionCodes,
        insurance: [],
        visits: [],
      });
      checkpoint.processed.push(mrn);
      saveCheckpoint();

      // Close page on error
      await page.close().catch(() => {});

      if (errorCount >= 5) {
        console.log("5 consecutive errors — re-establishing session...");
        page = await ctx.newPage();
        page.setDefaultTimeout(20000);
        try {
          await login(page);
          await page.close();
        } catch { /* will retry on next iteration */ }
        errorCount = 0;
      }
    }
  }

  // Final save
  saveCheckpoint();
  saveResults();

  const okCount = checkpoint.results.filter(r => r.scanStatus === "OK").length;
  const errCount = checkpoint.results.filter(r => r.scanStatus !== "OK").length;
  console.log(`\n=== SCAN COMPLETE ===`);
  console.log(`Total: ${checkpoint.results.length} | OK: ${okCount} | Errors: ${errCount}`);
  console.log(`Results: ${RESULTS_CSV}`);
  console.log(`JSON: ${RESULTS_FILE}`);

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
