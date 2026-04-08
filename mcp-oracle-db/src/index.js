/**
 * mcp-oracle-portal  v3.1
 * Multi-branch MCP Server for Oasis+ portal network — BrainSAIT
 *
 * Each branch (hospital) has its own Oasis+ URL and portal base path.
 * The server maintains one authenticated Playwright browser session per branch.
 *
 * Built-in branches:
 *   • abha    — 172.19.1.1          /Oasis   (Hayat National Hospital – ABHA)
 *   • riyadh  — 128.1.1.185         /prod    (Al-Hayat National Hospital – Riyadh)
 *   • madinah — 172.25.11.26        /Oasis   (Hospital – Madinah)
 *   • unaizah — 10.0.100.105        /prod    (Hospital – Unaizah)
 *   • khamis  — 172.30.0.77         /prod    (Hospital – Khamis)
 *   • jizan   — 172.17.4.84         /prod    (Hospital – Jizan)
 *
 * All tools accept an optional `branch` parameter (default: "abha").
 * Credentials: each branch env var (e.g. ABHA_USER) overrides PORTAL_USER.
 *
 * Tools:
 *   • portal_list_branches      — List all configured branches and their status
 *   • portal_search_patient     — Search patient by MRN or name
 *   • portal_get_claims         — Get claims (filter by invoice/status/dates/payer)
 *   • portal_get_claim_detail   — Open a specific invoice and return full details
 *   • portal_submit_appeal      — Submit a communication/appeal for a claim
 *   • portal_get_approvals      — List approvals by patient or date range
 *   • portal_check_eligibility  — Run eligibility check for a patient
 */

import "dotenv/config";
import { chromium } from "playwright";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Branch registry ────────────────────────────────────────────────────────────
/**
 * Built-in branch definitions for all BrainSAIT Oasis+ hospital portals.
 * Each branch may override user/pass independently; falls back to shared env vars.
 *
 * Credential resolution order (highest → lowest priority):
 *   1. <BRANCH>_USER / <BRANCH>_PASS  (e.g. ABHA_USER, RIYADH_PASS)
 *   2. PORTAL_USER / PORTAL_PASS      (shared fallback)
 *   3. "U36113"                        (default — password same as username)
 *
 * basePath: the path prefix after the host  (e.g. /Oasis or /prod)
 * homeUrl:  full URL for the Home page after login
 * loginUrl: full URL for the Login page (GET redirects here when unauthenticated)
 */
const DEFAULT_BRANCHES = {
  abha: {
    label:    "Hayat National Hospital – ABHA",
    host:     "172.19.1.1",
    basePath: "/Oasis",
    homeUrl:  "http://172.19.1.1/Oasis/faces/Home",
    loginUrl: "http://172.19.1.1/Oasis/faces/Login.jsf",
    user:     process.env.ABHA_USER    ?? process.env.PORTAL_USER ?? "U36113",
    pass:     process.env.ABHA_PASS    ?? process.env.PORTAL_PASS ?? "U36113",
  },
  riyadh: {
    label:    "Al-Hayat National Hospital – Riyadh",
    host:     "128.1.1.185",
    basePath: "/prod",
    homeUrl:  "https://128.1.1.185/prod/faces/Home",
    loginUrl: "https://128.1.1.185/prod/faces/Login.jsf",
    user:     process.env.RIYADH_USER  ?? process.env.PORTAL_USER ?? "U36113",
    pass:     process.env.RIYADH_PASS  ?? process.env.PORTAL_PASS ?? "U36113",
  },
  madinah: {
    label:    "Hospital – Madinah",
    host:     "172.25.11.26",
    basePath: "/Oasis",
    homeUrl:  "http://172.25.11.26/Oasis/faces/Home",
    loginUrl: "http://172.25.11.26/Oasis/faces/Login.jsf",
    user:     process.env.MADINAH_USER ?? process.env.PORTAL_USER ?? "U36113",
    pass:     process.env.MADINAH_PASS ?? process.env.PORTAL_PASS ?? "U36113",
  },
  unaizah: {
    label:    "Hospital – Unaizah",
    host:     "10.0.100.105",
    basePath: "/prod",
    homeUrl:  "http://10.0.100.105/prod/faces/Home",
    loginUrl: "http://10.0.100.105/prod/faces/Login.jsf",
    user:     process.env.UNAIZAH_USER ?? process.env.PORTAL_USER ?? "U36113",
    pass:     process.env.UNAIZAH_PASS ?? process.env.PORTAL_PASS ?? "U36113",
  },
  khamis: {
    label:    "Hospital – Khamis",
    host:     "172.30.0.77",
    basePath: "/prod",
    homeUrl:  "http://172.30.0.77/prod/faces/Home",
    loginUrl: "http://172.30.0.77/prod/faces/Login.jsf",
    user:     process.env.KHAMIS_USER  ?? process.env.PORTAL_USER ?? "U36113",
    pass:     process.env.KHAMIS_PASS  ?? process.env.PORTAL_PASS ?? "U36113",
  },
  jizan: {
    label:    "Hospital – Jizan",
    host:     "172.17.4.84",
    basePath: "/prod",
    homeUrl:  "http://172.17.4.84/prod/faces/Home",
    loginUrl: "http://172.17.4.84/prod/faces/Login.jsf",
    user:     process.env.JIZAN_USER   ?? process.env.PORTAL_USER ?? "U36113",
    pass:     process.env.JIZAN_PASS   ?? process.env.PORTAL_PASS ?? "U36113",
  },
};

// Allow additional branches to be injected at runtime via BRANCHES_JSON env var.
// Format: { "jeddah": { "host": "172.x.x.x", "basePath": "/prod", ... } }
// All 6 built-in branches (abha, riyadh, madinah, unaizah, khamis, jizan) are pre-configured.
let BRANCHES = { ...DEFAULT_BRANCHES };
if (process.env.BRANCHES_JSON) {
  try {
    const extra = JSON.parse(process.env.BRANCHES_JSON);
    for (const [k, v] of Object.entries(extra)) {
      BRANCHES[k] = {
        user: process.env.PORTAL_USER ?? "U36113",
        pass: process.env.PORTAL_PASS ?? "U36113",
        ...v,
        homeUrl:  v.homeUrl  ?? `http://${v.host}${v.basePath}/faces/Home`,
        loginUrl: v.loginUrl ?? `http://${v.host}${v.basePath}/faces/Login.jsf`,
      };
    }
  } catch (e) {
    console.error("WARNING: BRANCHES_JSON parse error —", e.message);
  }
}

const HEADLESS = (process.env.HEADLESS ?? "true") === "true";
const TIMEOUT  = parseInt(process.env.TIMEOUT_MS ?? "30000", 10);

// ─── Per-branch browser sessions ───────────────────────────────────────────────
// Map<branchKey, { browser, page }>
const _sessions = new Map();

function getBranchConfig(branch) {
  const cfg = BRANCHES[branch];
  if (!cfg) throw new Error(`Unknown branch "${branch}". Known: ${Object.keys(BRANCHES).join(", ")}`);
  return cfg;
}

async function getPage(branch = "abha") {
  const cfg = getBranchConfig(branch);

  const existing = _sessions.get(branch);
  if (existing?.page && !existing.page.isClosed()) return existing.page;

  const browser = await chromium.launch({ 
    headless: HEADLESS,
    // Allow self-signed certificates on internal IP-based portals (e.g. Riyadh HTTPS)
    args: ["--ignore-certificate-errors"],
    executablePath: process.env.CHROME_PATH ?? undefined,
  });
  // Ignore HTTPS cert errors at context level too (covers self-signed IP certs)
  const ctx  = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  await page.goto(cfg.loginUrl, { waitUntil: "networkidle", timeout: 60000 }).catch(()=>{});
  if (!page.url().includes("Home")) {
      await page.fill('[placeholder*="user" i]', cfg.user).catch(()=>{});
      await page.fill('[placeholder*="pass" i]', cfg.pass).catch(()=>{});
      await page.locator('a:has-text("Login"), button:has-text("Login"), button:has-text("Sign in")').first().click().catch(()=>{});
      await page.waitForURL(/Home/, { timeout: 60000 }).catch(()=>{});
  }

  // ── Handle OS-572: "Previous session(s) already found" ────────────────────
  // Oracle shows this confirmation dialog immediately after login (or page load).
  // We must click "Yes" to cancel the lingering session and proceed.
  const sessionDlg = page.locator('text=Previous session').first();
  if (await sessionDlg.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.error(`[${branch}] OS-572 detected — dismissing previous session dialog`);
    // Try Yes / OK buttons inside the dialog
    const yesBtn = page.locator(
      'button:has-text("Yes"), a:has-text("Yes"), button:has-text("OK"), a:has-text("OK")'
    ).first();
    await yesBtn.click().catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  }

  _sessions.set(branch, { browser, page });
  console.error(`✓ [${branch}] Logged in as ${cfg.user} — ${cfg.homeUrl}`);
  return page;
}

/** Navigate to a portal task-flow on the given branch */
async function navigate(branch, taskFlowId) {
  const cfg  = getBranchConfig(branch);
  const page = await getPage(branch);

  if (!page.url().includes("Home")) {
    await page.goto(cfg.homeUrl, { waitUntil: "networkidle", timeout: TIMEOUT });
  }
  // Use exact placeholder to avoid selecting wrong search boxes
  const searchBox = page.locator('input[placeholder*="Search Tasks" i], input[placeholder*="Search Tasks"]').first();
  if (await searchBox.isVisible({ timeout: 5000 }).catch(() => false)) {
    await searchBox.fill(taskFlowId);
    const item = page.locator(`[title="${taskFlowId}"]`).first();
    if (await item.isVisible({ timeout: 3000 }).catch(() => false)) {
      await item.click();
    } else {
      await searchBox.press("Enter");
    }
  }
  
  // Explicitly wait for the task flow tab to appear
  const tabName = taskFlowId === "OIC_NPHIES_CLAIM_REJECTION" ? "NPHIES Claim Rejection" : taskFlowId;
  const tab = page.locator(`[title="${tabName}"]`).first();
  await tab.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
  // Allow time for ADF iframe to load
  await page.waitForTimeout(3000);
}

/** Extract a table from the current page as array of row-objects */
async function extractTable(page, maxRows = 100) {
  const rows = await page.locator("table tr").all();
  if (rows.length === 0) return [];
  const headerCells = await rows[0].locator("th, td").allTextContents();
  const headers = headerCells.map(h => h.trim());
  const results = [];
  for (let i = 1; i < Math.min(rows.length, maxRows + 1); i++) {
    const cells = await rows[i].locator("td").allTextContents();
    const trimmed = cells.map(c => c.trim());
    if (trimmed.some(c => c)) {
      results.push(Object.fromEntries(headers.map((h, j) => [h || `col${j}`, trimmed[j] ?? ""])));
    }
  }
  return results;
}

// Reusable branch param schema
const branchParam = z.string().default("abha")
  .describe(`Branch key (default "abha"). Use portal_list_branches for all options.`);

// ─── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({ name: "mcp-oracle-portal", version: "3.0.0" });

// ── portal_list_branches ───────────────────────────────────────────────────────
server.tool(
  "portal_list_branches",
  {},
  async () => {
    const info = Object.entries(BRANCHES).map(([key, cfg]) => {
      const session = _sessions.get(key);
      return {
        key,
        label:         cfg.label ?? key,
        host:          cfg.host,
        homeUrl:       cfg.homeUrl,
        sessionActive: !!(session?.page && !session.page.isClosed()),
      };
    });
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

// ── portal_search_patient ──────────────────────────────────────────────────────
server.tool(
  "portal_search_patient",
  {
    branch:    branchParam,
    mrn:       z.string().optional().describe("Medical Record Number"),
    name:      z.string().optional().describe("Patient name (partial match)"),
    invoiceNo: z.string().optional().describe("Invoice / Transaction number"),
  },
  async ({ branch, mrn, name, invoiceNo }) => {
    const page = await getPage(branch);
    try {
      await navigate(branch, "PATIENTSEARCHTF");
      if (mrn) {
        const f = page.locator('input[id*="mrn" i], [placeholder*="mrn" i]').first();
        if (await f.isVisible({ timeout: 3000 })) await f.fill(mrn);
      }
      if (name) {
        const f = page.locator('input[id*="name" i], [placeholder*="name" i]').first();
        if (await f.isVisible({ timeout: 3000 })) await f.fill(name);
      }
      if (invoiceNo) {
        const f = page.locator('input[id*="invoice" i], [placeholder*="invoice" i]').first();
        if (await f.isVisible({ timeout: 3000 })) await f.fill(invoiceNo);
      }
      await page.locator('button:has-text("Search"), a:has-text("Search")').first().click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const results = await extractTable(page);
      return { content: [{ type: "text", text: JSON.stringify({ branch, count: results.length, patients: results }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `ERROR [${branch}]: ${err.message}` }] };
    }
  }
);

// ── portal_get_claims ──────────────────────────────────────────────────────────
server.tool(
  "portal_get_claims",
  {
    branch:     branchParam,
    invoiceNo:  z.string().optional().describe("Invoice / Transaction number"),
    status:     z.string().optional().describe("Status filter (e.g. Rejected, Queued In Nphies, Partial)"),
    dateFrom:   z.string().optional().describe("Date from YYYY-MM-DD"),
    dateTo:     z.string().optional().describe("Date to YYYY-MM-DD"),
    payer:      z.string().optional().describe("Payer/purchaser name filter"),
    maxResults: z.number().int().min(1).max(200).default(50),
  },
  async ({ branch, invoiceNo, status, dateFrom, dateTo, payer, maxResults }) => {
    const page = await getPage(branch);
    try {
      await navigate(branch, "MANAGECLAIMS");
      if (invoiceNo) {
        const f = page.locator('input[id*="invoice" i], [placeholder*="invoice" i]').first();
        if (await f.isVisible({ timeout: 3000 })) { await f.clear(); await f.fill(invoiceNo); }
      }
      if (dateFrom) {
        const f = page.locator('[id*="startDate" i], [id*="fromDate" i], [id*="dateFrom" i]').first();
        if (await f.isVisible({ timeout: 3000 })) await f.fill(dateFrom);
      }
      if (dateTo) {
        const f = page.locator('[id*="endDate" i], [id*="toDate" i], [id*="dateTo" i]').first();
        if (await f.isVisible({ timeout: 3000 })) await f.fill(dateTo);
      }
      await page.locator('button:has-text("Search"), a:has-text("Search")').first().click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      let results = await extractTable(page, maxResults);
      if (status) results = results.filter(r => JSON.stringify(r).toLowerCase().includes(status.toLowerCase()));
      if (payer)  results = results.filter(r => JSON.stringify(r).toLowerCase().includes(payer.toLowerCase()));
      return { content: [{ type: "text", text: JSON.stringify({ branch, count: results.length, claims: results }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `ERROR [${branch}]: ${err.message}` }] };
    }
  }
);

// ── portal_get_claim_detail ────────────────────────────────────────────────────
server.tool(
  "portal_get_claim_detail",
  {
    branch:    branchParam,
    invoiceNo: z.string().describe("Invoice / Transaction number to open"),
  },
  async ({ branch, invoiceNo }) => {
    const page = await getPage(branch);
    try {
      await navigate(branch, "MANAGECLAIMS");
      const f = page.locator('input[id*="invoice" i], [placeholder*="invoice" i]').first();
      if (await f.isVisible({ timeout: 5000 })) { await f.clear(); await f.fill(invoiceNo); }
      await page.locator('button:has-text("Search"), a:has-text("Search")').first().click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const link = page.locator(`td:has-text("${invoiceNo}")`).first();
      if (await link.isVisible({ timeout: 5000 })) {
        await link.click();
        await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      }
      const content = await page.evaluate(() => {
        const fields = {};
        document.querySelectorAll("label").forEach(lbl => {
          const sib = lbl.nextElementSibling?.textContent?.trim();
          if (sib) fields[lbl.textContent.trim()] = sib;
        });
        const tables = [];
        document.querySelectorAll("table").forEach(t => {
          const rows = [];
          t.querySelectorAll("tr").forEach(r => {
            const cells = [...r.querySelectorAll("th,td")].map(c => c.textContent?.trim());
            if (cells.some(Boolean)) rows.push(cells);
          });
          if (rows.length) tables.push(rows);
        });
        return { fields, tables };
      });
      return { content: [{ type: "text", text: JSON.stringify({ branch, invoiceNo, ...content }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `ERROR [${branch}]: ${err.message}` }] };
    }
  }
);

// ── portal_submit_appeal ───────────────────────────────────────────────────────
server.tool(
  "portal_submit_appeal",
  {
    branch:        branchParam,
    invoiceNo:     z.string().describe("Invoice / Transaction number"),
    appealMessage: z.string().describe("Full appeal/communication text to submit"),
    dryRun:        z.boolean().default(true).describe("If true, compose but do NOT click Submit"),
  },
  async ({ branch, invoiceNo, appealMessage, dryRun }) => {
    const page = await getPage(branch);
    try {
      // Ensure we are on the Home page (which hosts the invoice search module)
      const cfg = getBranchConfig(branch);
      if (!page.url().includes("Home")) {
        await page.goto(cfg.homeUrl, { waitUntil: "networkidle", timeout: TIMEOUT });
        await page.waitForTimeout(2000);
      }

      // ── Step 1: Fill invoice number and search ────────────────────────────
      // The invoice input lives directly on the Home page ADF content area.
      const invoiceInput = page.locator('input[placeholder="Invoice"], input[placeholder*="invoice" i]').first();
      await invoiceInput.waitFor({ state: "visible", timeout: 15000 });
      await invoiceInput.clear();
      await invoiceInput.fill(invoiceNo);

      // Click the Search button (known Oracle ADF id pattern or text fallback)
      const searchBtn = page.locator('[id$="ff1:fi4:b13"], button:has-text("Search"), a:has-text("Search")').first();
      await searchBtn.click();
      await page.waitForTimeout(5000);

      // ── Step 2: Open row context menu ─────────────────────────────────────
      const rowMenu = page.locator('[id*="oc2457"][id*="popEl"], [id*="popEl"]').first();
      if (await rowMenu.isVisible({ timeout: 8000 })) {
        await rowMenu.click();
      } else {
        // Fallback: click the first result row
        await page.locator(`td:has-text("${invoiceNo}")`).first().click({ timeout: 8000 });
      }
      await page.waitForTimeout(2000);

      // ── Step 3: Click "Send Communication" in context menu or toolbar ─────
      await page.locator('text=Send Communication').first().click({ timeout: 8000 });
      await page.waitForTimeout(6000);

      // ── Step 4: Work inside the ADF dialog frame ──────────────────────────
      // Oracle opens a popup dialog in either a real iframe or the parent page.
      let dialogFrame = page.frames().find(f => f.url().includes("adf.dialog-request"));
      const ctx = dialogFrame ? dialogFrame : page;

      // If the dialog shows an initial "Send Communication" button/error, handle it
      const initSend = ctx.locator('text=Send Communication').first();
      if (await initSend.isVisible({ timeout: 3000 }).catch(() => false)) {
        await initSend.click().catch(() => {});
        await page.waitForTimeout(3000);
        const okBtn0 = ctx.locator('button:has-text("OK"), a:has-text("OK")').first();
        if (await okBtn0.isVisible({ timeout: 2000 }).catch(() => false)) await okBtn0.click();
        await page.waitForTimeout(2000);
        // Re-fetch frame after potential navigation
        dialogFrame = page.frames().find(f => f.url().includes("adf.dialog-request"));
      }

      const finalCtx = dialogFrame ? dialogFrame : page;

      // Select the "Info" radio (avoids Error-only submissions)
      const infoRadio = finalCtx.locator('input[id*="j_idt13:_0"], input[type="radio"]').first();
      if (await infoRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
        await infoRadio.click().catch(() => {});
      }

      // Fill the message textarea
      const textarea = finalCtx.locator('textarea[id*="it3::content"], textarea').first();
      await textarea.waitFor({ state: "visible", timeout: 8000 });
      await textarea.fill(appealMessage);

      if (dryRun) {
        return { content: [{ type: "text", text: JSON.stringify({ branch, dryRun: true, invoiceNo, status: "READY_TO_SUBMIT", note: "Set dryRun=false to actually submit" }) }] };
      }

      // ── Step 5: Final submit ──────────────────────────────────────────────
      await finalCtx.locator('text=Send Communication').last().click();
      await page.waitForTimeout(5000);

      // Dismiss final OK
      const finalOk = finalCtx.locator('button:has-text("OK"), a:has-text("OK")').first();
      if (await finalOk.isVisible({ timeout: 3000 }).catch(() => false)) await finalOk.click();

      return { content: [{ type: "text", text: JSON.stringify({ branch, invoiceNo, status: "SUBMITTED", confirmation: "Communication sent successfully" }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `ERROR [${branch}]: ${err.message}` }] };
    }
  }
);

// ── portal_get_approvals ───────────────────────────────────────────────────────
server.tool(
  "portal_get_approvals",
  {
    branch:      branchParam,
    invoiceNo:   z.string().optional().describe("Invoice number"),
    patientName: z.string().optional().describe("Patient name"),
    status:      z.string().optional().describe("Status filter"),
    maxResults:  z.number().int().min(1).max(200).default(50),
  },
  async ({ branch, invoiceNo, patientName, status, maxResults }) => {
    const page = await getPage(branch);
    try {
      await navigate(branch, "MANAGEAPPROVALSTF");
      if (invoiceNo) {
        const f = page.locator('input[id*="invoice" i], [placeholder*="invoice" i]').first();
        if (await f.isVisible({ timeout: 3000 })) await f.fill(invoiceNo);
      }
      if (patientName) {
        const f = page.locator('[placeholder*="patient" i], [placeholder*="name" i]').first();
        if (await f.isVisible({ timeout: 3000 })) await f.fill(patientName);
      }
      const sb = page.locator('button:has-text("Search"), a:has-text("Search")').first();
      if (await sb.isVisible({ timeout: 3000 })) {
        await sb.click();
        await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      }
      let results = await extractTable(page, maxResults);
      if (status) results = results.filter(r => JSON.stringify(r).toLowerCase().includes(status.toLowerCase()));
      return { content: [{ type: "text", text: JSON.stringify({ branch, count: results.length, approvals: results }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `ERROR [${branch}]: ${err.message}` }] };
    }
  }
);

// ── portal_check_eligibility ───────────────────────────────────────────────────
server.tool(
  "portal_check_eligibility",
  {
    branch: branchParam,
    mrn:    z.string().describe("Patient Medical Record Number"),
  },
  async ({ branch, mrn }) => {
    const page = await getPage(branch);
    try {
      await navigate(branch, "CHECKELIGIBILITYTF");
      const mf = page.locator('[placeholder*="mrn" i], [id*="mrn" i]').first();
      if (await mf.isVisible({ timeout: 5000 })) await mf.fill(mrn);
      await page.locator('button:has-text("Check"), a:has-text("Check"), button:has-text("Verify")').first().click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const resultText = await page.locator('[class*="eligib"], [class*="result"]').first()
        .textContent({ timeout: 5000 }).catch(() => "");
      const tableData = await extractTable(page);
      return { content: [{ type: "text", text: JSON.stringify({ branch, mrn, result: resultText, detail: tableData }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `ERROR [${branch}]: ${err.message}` }] };
    }
  }
);

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  for (const [key, session] of _sessions) {
    await session.browser?.close().catch(() => {});
    console.error(`✓ [${key}] browser closed`);
  }
  process.exit(0);
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

// ─── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`mcp-oracle-portal v3 started — ${Object.keys(BRANCHES).join(", ")} branches configured`);
