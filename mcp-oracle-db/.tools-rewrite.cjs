// One-time helper: rewrites src/index.js tools section to multi-branch version
const fs = require("fs");
const path = require("path");
const target = path.join(__dirname, "src/index.js");

const src = fs.readFileSync(target, "utf8");
const MARKER = `const server = new McpServer({ name: "mcp-oracle-portal", version: "3.0.0" });`;
const idx = src.indexOf(MARKER);
if (idx === -1) { console.error("marker not found"); process.exit(1); }

const head = src.slice(0, idx + MARKER.length);

const tools = `

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
      return { content: [{ type: "text", text: \`ERROR [\${branch}]: \${err.message}\` }] };
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
      return { content: [{ type: "text", text: \`ERROR [\${branch}]: \${err.message}\` }] };
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
      const link = page.locator(\`td:has-text("\${invoiceNo}")\`).first();
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
      return { content: [{ type: "text", text: \`ERROR [\${branch}]: \${err.message}\` }] };
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
      await navigate(branch, "CLAIMREJECTION");
      const f = page.locator('input[id*="invoice" i], [placeholder*="invoice" i]').first();
      if (await f.isVisible({ timeout: 5000 })) { await f.clear(); await f.fill(invoiceNo); }
      await page.locator('button:has-text("Search"), a:has-text("Search")').first().click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const row = page.locator(\`td:has-text("\${invoiceNo}")\`).first();
      if (await row.isVisible({ timeout: 5000 })) await row.click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const sendBtn = page.locator('a:has-text("Send Communication"), button:has-text("Send Communication")').first();
      if (!await sendBtn.isVisible({ timeout: 7000 }))
        return { content: [{ type: "text", text: \`ERROR [\${branch}]: Send Communication not visible for \${invoiceNo}\` }] };
      await sendBtn.click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const ta = page.locator("textarea, [contenteditable='true']").first();
      if (await ta.isVisible({ timeout: 5000 })) await ta.fill(appealMessage);
      if (dryRun)
        return { content: [{ type: "text", text: JSON.stringify({ branch, dryRun: true, invoiceNo, status: "READY_TO_SUBMIT", note: "Set dryRun=false to actually submit" }) }] };
      await page.locator('button:has-text("Submit"), a:has-text("Submit")').last().click();
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
      const confirm = await page.locator('[class*="success"], [class*="confirm"]').first()
        .textContent({ timeout: 5000 }).catch(() => "submitted — check portal for Communication ID");
      return { content: [{ type: "text", text: JSON.stringify({ branch, invoiceNo, status: "SUBMITTED", confirmation: confirm }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: \`ERROR [\${branch}]: \${err.message}\` }] };
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
      return { content: [{ type: "text", text: \`ERROR [\${branch}]: \${err.message}\` }] };
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
      return { content: [{ type: "text", text: \`ERROR [\${branch}]: \${err.message}\` }] };
    }
  }
);

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  for (const [key, session] of _sessions) {
    await session.browser?.close().catch(() => {});
    console.error(\`✓ [\${key}] browser closed\`);
  }
  process.exit(0);
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

// ─── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(\`mcp-oracle-portal v3 started — \${Object.keys(BRANCHES).join(", ")} branches configured\`);
`;

fs.writeFileSync(target, head + tools, "utf8");
const lineCount = (head + tools).split("\n").length;
console.log("Written OK — total lines:", lineCount);
