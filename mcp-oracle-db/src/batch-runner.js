/**
 * batch-runner.js
 * ───────────────
 * Direct Oracle appeal submission runner for Al-Rajhi claims.
 * Opens the Riyadh Oracle portal, allows manual login if needed, then submits appeals
 * using the same invoice search and Send Communication flow as the portal tool.
 *
 * Usage: node src/batch-runner.js [--limit N] [--dry-run] [--skip-failed]
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, "..");

dotenv.config({ path: path.join(PACKAGE_ROOT, ".env") });

const DATA_PATH = path.join(WORKSPACE_ROOT, "artifacts", "rajhi_portal_data.json");
const PROGRESS_PATH = path.join(WORKSPACE_ROOT, "artifacts", "rajhi_portal_progress.json");
const TXN_MAP_PATH = path.join(WORKSPACE_ROOT, "artifacts", "txn_invoice_mapping.json");
const ORACLE_HOME_URL = "http://oracle-riyadh.brainsait.org/prod/faces/Home";
const ORACLE_LOGIN_URL = "http://oracle-riyadh.brainsait.org/prod/faces/Login.jsf";
const ORACLE_USER = process.env.RIYADH_USER ?? process.env.PORTAL_USER ?? "";
const ORACLE_PASS = process.env.RIYADH_PASS ?? process.env.PORTAL_PASS ?? "";
const DEFAULT_PERIOD = "FEB - 2026";
const DEFAULT_PERIOD_START = "01-02-2026";
const DEFAULT_PERIOD_END = "28-02-2026";
const DEFAULT_PAYER = "183- AL RAJHI TAKAFUL INSURANCE(1001)";
const ORACLE_PROFILE_DIR = process.env.ORACLE_PROFILE_DIR || path.join(PACKAGE_ROOT, ".playwright-profile");
const HYDRATION_MARKER = path.join(WORKSPACE_ROOT, "artifacts", "oracle_profile_hydrated");

const SELECTORS = {
  claimsTab: 'button:has-text("Claims Submission")',
  period: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or4:oc10:oc11:or23:oc6:ff2:fi3:periodId::content"]',
  periodStart: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or4:oc10:oc11:or23:oc6:ff2:fi3:id2::content"]',
  periodEnd: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or4:oc10:oc11:or23:oc6:ff2:fi3:id3::content"]',
  payer: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or4:oc10:oc11:or23:oc7:ff3:fi1:payerId::content"]',
  statNo: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or4:oc10:oc11:or28:oc53:ff15:fi26:it7::content"]',
  invoice: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or4:oc10:oc11:or28:oc17:ff13:fi20:it1::content"]',
  leftFilter: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or1:oc11444:oc14:ff5:fi5:it2::content"]',
  actionsButton: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or1:oc4:oc2457:or8:oc19:b1"]',
};

const TXN_MAP = existsSync(TXN_MAP_PATH)
  ? JSON.parse(readFileSync(TXN_MAP_PATH, "utf-8")).mapping ?? {}
  : {};

const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");

const LIMIT = limitIndex >= 0 ? parseInt(args[limitIndex + 1] || "3", 10) : 3;
const DRY_RUN = args.includes("--dry-run");
const SKIP_FAILED = args.includes("--skip-failed");

function loadProgress() {
  if (existsSync(PROGRESS_PATH)) {
    return JSON.parse(readFileSync(PROGRESS_PATH, "utf-8"));
  }

  return {
    batch: "BAT-2026-NB-00004295-OT",
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    completed: [],
    failed: [],
    skipped: [],
    oraclePending: [],
    inProgress: null,
  };
}

function saveProgress(progress) {
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

function removeTxnFromProgress(progress, txn) {
  progress.completed = progress.completed.filter(entry => entry.txn !== txn);
  progress.failed = progress.failed.filter(entry => entry.txn !== txn);
  progress.skipped = progress.skipped.filter(entry => entry.txn !== txn);
}

function buildQueue(allData, progress) {
  const completed = new Set(progress.completed.map(entry => entry.txn));
  const skipped = new Set(progress.skipped.map(entry => entry.txn));
  const failed = new Set(progress.failed.map(entry => entry.txn));

  return allData
    .filter(item => item.FinalStatus === "PORTAL_READY")
    .filter(item => !completed.has(item.InvoiceNo))
    .filter(item => !skipped.has(item.InvoiceNo))
    .filter(item => (SKIP_FAILED ? !failed.has(item.InvoiceNo) : true))
    .slice(0, LIMIT);
}

function getClaimMapping(txn) {
  return TXN_MAP[String(txn)] ?? null;
}

async function waitForManualLogin(page) {
  console.log("\nPlease log in to the Riyadh Oracle portal in the browser window,");
  console.log("make sure you reach the claims screen or Home page, then press ENTER here to continue...");
  await new Promise(resolve => process.stdin.once("data", resolve));
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
}

async function waitForManualHydration(page) {
  console.log("\nFirst-time setup: please open the hamburger menu in the browser and click 'Claims Submission' once.");
  console.log("After clicking Claims Submission (so the ADF menu handlers attach), press ENTER here to continue...");
  await new Promise(resolve => process.stdin.once("data", resolve));
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
}

async function dismissPreviousSessionDialog(page) {
  const sessionDialog = page.locator("text=Previous session").first();
  if (await sessionDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
    const yesButton = page.locator('button:has-text("Yes"), a:has-text("Yes"), button:has-text("OK"), a:has-text("OK")').first();
    await yesButton.click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  }
}

async function dismissBlockingDialog(page) {
  const dialogText = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], div[id^="d"]'))
      .filter(el => (el.offsetWidth || el.offsetHeight || el.getClientRects().length))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);
    return dialogs[0] ?? null;
  }).catch(() => null);

  if (!dialogText) {
    return null;
  }

  const okButton = page.locator('button:has-text("OK"), a:has-text("OK"), button:has-text("Yes"), a:has-text("Yes")').first();
  if (await okButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await okButton.click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  return dialogText;
}

async function tryAutoLogin(page) {
  if (!page.url().includes("Login.jsf")) {
    return true;
  }

  if (!ORACLE_USER || !ORACLE_PASS) {
    return false;
  }

  const usernameInput = page.locator('input[id="it1::content"], input[placeholder*="user" i]').first();
  const passwordInput = page.locator('input[id="it2::content"], input[type="password"]').first();
  const loginButton = page.locator('a#login, a:has-text("Login"), button:has-text("Login")').first();

  await usernameInput.waitFor({ state: "visible", timeout: 15000 });
  await usernameInput.fill(ORACLE_USER);
  await passwordInput.fill(ORACLE_PASS);
  await loginButton.click();
  await page.waitForTimeout(5000);
  await dismissPreviousSessionDialog(page);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  return !page.url().includes("Login.jsf");
}

async function navigateToClaimsSubmission(page) {
  const periodInput = page.locator(SELECTORS.period).first();
  if (await periodInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  // Try search-based navigation first (use actual search box from current UI)
  // Try multiple search box selectors: Work Entities, main search, or generic
  const searchBoxSelectors = [
    'input[placeholder*="Search Work Entities" i]',
    'input[placeholder*="Search Work Entities"]',
    'input[id*="wrk_ent_srch"]',
    'input[placeholder*="Search..." i]',
    'input[id="pt1:r1:0:os-mainmenu-search::content"]'
  ];
  
  for (const selector of searchBoxSelectors) {
    const searchBox = page.locator(selector).first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`    → Using search box (${selector}) to navigate to Claims Submission...`);
      await searchBox.fill("CLAIMSSUBMISSIONTF");
      await page.waitForTimeout(1000);
      
      const searchItem = page.locator('[title="CLAIMSSUBMISSIONTF"]').first();
      if (await searchItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchItem.click();
      } else {
        await searchBox.press("Enter");
      }
      
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      
      if (await periodInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log("    ✓ Successfully navigated via search box");
        return;
      }
    }
  }

  // Fallback: try the tab-based approach
  const claimsTab = page.locator(SELECTORS.claimsTab).first();
  if (await claimsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("    → Clicking Claims Submission tab...");
    await claimsTab.click().catch(() => {});
    if (await periodInput.waitFor({ state: "visible", timeout: 15000 }).catch(() => false)) {
      console.log("    ✓ Successfully navigated via tab");
      return;
    }
  }

  // Fallback: try menu utils
  await page.evaluate(() => {
    window.OasisMenuUtil?.navigateTo?.("CLAIMSSUBMISSIONTF");
  }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  if (await periodInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("    ✓ Successfully navigated via OasisMenuUtil");
    return;
  }

  // Final DOM-based fallback: find any treeview/menu item whose visible
  // text contains "Claims Submission" (or title == CLAIMSSUBMISSIONTF) and click it.
  const domClicked = await page.evaluate(() => {
    try {
      const candidates = Array.from(document.querySelectorAll('.os-treeview-item, .os-treeview-item-content, .os-treeview-item-text'));
      for (const el of candidates) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const title = el.getAttribute && el.getAttribute('title');
        if (text.includes('Claims Submission') || title === 'CLAIMSSUBMISSIONTF') {
          const clickable = el.closest('.os-treeview-item') || el;
          const button = clickable.querySelector('div, a, span') || clickable;
          if (button) {
            button.click();
            return true;
          }
        }
      }
    } catch (e) {
      return false;
    }
    return false;
  }).catch(() => false);

  if (domClicked) {
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  if (!(await periodInput.isVisible({ timeout: 5000 }).catch(() => false))) {
    // Try waiting for the menu utilities to become available and invoke them.
    await page.waitForFunction(() => !!(window.MainMenuUtils || window.OasisMenuUtil), { timeout: 10000 }).catch(() => {});

    const invoked = await page.evaluate(() => {
      try {
        if (window.MainMenuUtils && typeof window.MainMenuUtils.navigateTo === 'function') {
          try { window.MainMenuUtils.navigateTo('CLAIMSSUBMISSIONTF'); } catch(e) { /* ignore */ }
        }
        if (window.OasisMenuUtil && typeof window.OasisMenuUtil.navigateTo === 'function') {
          try { window.OasisMenuUtil.navigateTo('CLAIMSSUBMISSIONTF'); } catch(e) { /* ignore */ }
        }
        return true;
      } catch (e) {
        return false;
      }
    }).catch(() => false);

    if (invoked) {
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // If still not visible, dispatch real MouseEvents on the matching menu node
    if (!(await periodInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      // As a pragmatic fallback, click the hamburger menu button to force menu render
      try {
        const ham = page.locator('[id="pt1:OasisHedarToolBar:hamburgerBtn"]');
        if (await ham.isVisible({ timeout: 2000 }).catch(() => false)) {
          await ham.click().catch(() => {});
          await page.waitForTimeout(800);
        }
      } catch (e) {
        // ignore
      }
      const dispatched = await page.evaluate(() => {
        try {
          const nodes = Array.from(document.querySelectorAll('.os-treeview-item, .os-treeview-item-content, .os-treeview-item-text'));
          const match = nodes.find(el => ((el.textContent||'').replace(/\s+/g,' ').trim().includes('Claims Submission')) || (el.getAttribute && el.getAttribute('title') === 'CLAIMSSUBMISSIONTF'));
          if (!match) return false;
          const clickable = match.closest('.os-treeview-item') || match;
          const rect = clickable.getBoundingClientRect();
          const opts = { bubbles: true, cancelable: true, composed: true, view: window };
          clickable.dispatchEvent(new MouseEvent('mousedown', opts));
          clickable.dispatchEvent(new MouseEvent('mouseup', opts));
          clickable.dispatchEvent(new MouseEvent('click', opts));
          return true;
        } catch (e) {
          return false;
        }
      }).catch(() => false);

      if (dispatched) {
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2500);
      }
    }
    // capture a diagnostic snapshot for debugging fresh-session failures
    try {
      const outHtml = path.join(WORKSPACE_ROOT, "artifacts", `claims_nav_failed_${Date.now()}.html`);
      const outPng = path.join(WORKSPACE_ROOT, "artifacts", `claims_nav_failed_${Date.now()}.png`);
      const html = await page.content().catch(() => null);
      if (html) writeFileSync(outHtml, html);
      await page.screenshot({ path: outPng, fullPage: true }).catch(() => {});
      console.warn(`Saved navigation diagnostics: ${outHtml}, ${outPng}`);
    } catch (err) {
      console.warn('Failed to write navigation diagnostics', err?.message || err);
    }

    throw new Error("Claims Submission menu item is not available");
  }
}

async function ensureOracleReady(page) {
  if (page.url().includes("Login.jsf")) {
    const loggedIn = await tryAutoLogin(page);
    if (!loggedIn) {
      await waitForManualLogin(page);
    }
  }

  await dismissPreviousSessionDialog(page);

  // One-time manual hydration: if the profile hasn't been hydrated, pause and
  // ask the operator to click Claims Submission once so ADF attaches menu handlers.
  try {
    if (!existsSync(HYDRATION_MARKER)) {
      if (!existsSync(path.join(WORKSPACE_ROOT, "artifacts"))) mkdirSync(path.join(WORKSPACE_ROOT, "artifacts"), { recursive: true });
      await waitForManualHydration(page);
      try { writeFileSync(HYDRATION_MARKER, new Date().toISOString()); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // ignore hydration errors and continue
  }

  if (page.url().includes("Login.jsf")) {
    throw new Error("Oracle login is still required");
  }

  await navigateToClaimsSubmission(page);
  await page.locator(SELECTORS.period).first().waitFor({ state: "visible", timeout: 15000 });
}

async function setClaimFilters(page, claimMap) {
  const period = page.locator(SELECTORS.period).first();
  const periodStart = page.locator(SELECTORS.periodStart).first();
  const periodEnd = page.locator(SELECTORS.periodEnd).first();
  const payer = page.locator(SELECTORS.payer).first();
  const statNo = page.locator(SELECTORS.statNo).first();
  const invoice = page.locator(SELECTORS.invoice).first();
  const leftFilter = page.locator(SELECTORS.leftFilter).first();

  if ((await period.inputValue().catch(() => "")) !== DEFAULT_PERIOD) {
    await period.fill(DEFAULT_PERIOD);
    await period.press("Tab").catch(() => {});
  }
  if ((await periodStart.inputValue().catch(() => "")) !== DEFAULT_PERIOD_START) {
    await periodStart.fill(DEFAULT_PERIOD_START);
    await periodStart.press("Tab").catch(() => {});
  }
  if ((await periodEnd.inputValue().catch(() => "")) !== DEFAULT_PERIOD_END) {
    await periodEnd.fill(DEFAULT_PERIOD_END);
    await periodEnd.press("Tab").catch(() => {});
  }
  if (!(await payer.inputValue().catch(() => "")).includes("AL RAJHI TAKAFUL")) {
    await payer.fill(DEFAULT_PAYER);
    await payer.press("Tab").catch(() => {});
  }

  await statNo.fill(claimMap.stat);
  await statNo.press("Tab").catch(() => {});
  await invoice.fill("");
  await leftFilter.fill("").catch(() => {});
  await page.waitForTimeout(1000);
}

async function openRejectedList(page) {
  const rejectedLink = page.locator('a:has-text("Rejected")').first();
  await rejectedLink.waitFor({ state: "visible", timeout: 15000 });
  await rejectedLink.click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function selectClaimByTxn(page, txn, claimMap) {
  const rowIds = await page.evaluate(() => Array.from(document.querySelectorAll('td[id$=":c5"]')).map(el => el.id).filter(Boolean));
  if (!rowIds.length) {
    throw new Error(`No rejected claim rows found for stat ${claimMap.stat}`);
  }

  for (const rowId of rowIds) {
    const row = page.locator(`[id="${rowId}"]`).first();
    if (!(await row.isVisible({ timeout: 1000 }).catch(() => false))) {
      continue;
    }

    await row.click();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const matched = await page.evaluate(({ invoiceNo, txnId }) => {
      const text = document.body.innerText || "";
      return text.includes(`Invoice No : ${invoiceNo}`) && new RegExp(`\\n${txnId}\\n`).test(text);
    }, { invoiceNo: claimMap.inv, txnId: String(txn) });

    if (matched) {
      return;
    }
  }

  throw new Error(`Unable to locate txn ${txn} on invoice ${claimMap.inv}`);
}

async function clickActionMenuItem(page, label) {
  const actionsButton = page.locator(SELECTORS.actionsButton).first();
  await actionsButton.waitFor({ state: "visible", timeout: 10000 });
  await actionsButton.click();
  await page.waitForTimeout(1000);

  const clicked = await page.evaluate(itemLabel => {
    const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(el => (el.textContent || '').includes(itemLabel));
    if (!item) {
      return false;
    }
    item.click();
    return true;
  }, label);

  if (!clicked) {
    throw new Error(`${label} is not available in the Actions menu`);
  }

  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function submitClaim(page, item) {
  const txn = item.InvoiceNo;
  console.log(`\n[${txn}] Starting Oracle submission...`);

  try {
    const claimMap = getClaimMapping(txn);
    if (!claimMap) {
      throw new Error(`No invoice mapping found for txn ${txn}`);
    }

    await ensureOracleReady(page);

    await setClaimFilters(page, claimMap);
    await openRejectedList(page);
    await selectClaimByTxn(page, txn, claimMap);
    await clickActionMenuItem(page, "Send Communication");

    const blockingDialog = await dismissBlockingDialog(page);
    if (blockingDialog && /Attribute Period Start >= is required/i.test(blockingDialog)) {
      throw new Error(blockingDialog);
    }

    await page.waitForTimeout(3000);

    let dialogFrame = page.frames().find(frame => frame.url().includes("adf.dialog-request"));
    let context = dialogFrame ?? page;

    const initialSend = context.locator("text=Send Communication").first();
    if (await initialSend.isVisible({ timeout: 3000 }).catch(() => false)) {
      await initialSend.click().catch(() => {});
      await page.waitForTimeout(3000);
      const initialOk = context.locator('button:has-text("OK"), a:has-text("OK")').first();
      if (await initialOk.isVisible({ timeout: 2000 }).catch(() => false)) {
        await initialOk.click().catch(() => {});
      }
      await page.waitForTimeout(2000);
      dialogFrame = page.frames().find(frame => frame.url().includes("adf.dialog-request"));
      context = dialogFrame ?? page;
    }

    const infoRadio = context.locator('input[id*="j_idt13:_0"], input[type="radio"]').first();
    if (await infoRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
      await infoRadio.click().catch(() => {});
    }

    const textarea = context.locator('textarea:not([disabled]), textarea[id*="it3::content"]').first();
    await textarea.waitFor({ state: "visible", timeout: 8000 });
    await textarea.fill(item.Content);

    if (DRY_RUN) {
      return { txn, status: "READY_TO_SUBMIT", confirmation: "Dry run reached populated Send Communication dialog" };
    }

    await context.locator("text=Send Communication").last().click();
    await page.waitForTimeout(5000);

    const finalOk = context.locator('button:has-text("OK"), a:has-text("OK")').first();
    if (await finalOk.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finalOk.click().catch(() => {});
    }

    return { txn, status: "SUBMITTED", confirmation: "Communication sent successfully" };
  } catch (error) {
    return { txn, status: "FAILED", reason: error.message };
  }
}

async function main() {
  const allData = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  const progress = loadProgress();
  const queue = buildQueue(allData, progress);

  console.log("\nAL-RAJHI ORACLE APPEAL BATCH RUNNER");
  console.log(`Portal:        ${ORACLE_HOME_URL}`);
  console.log(`Queue size:    ${queue.length} (limit: ${LIMIT})`);
  console.log(`Completed:     ${progress.completed.length}`);
  console.log(`Failed saved:  ${progress.failed.length}`);
  console.log(`Mode:          ${DRY_RUN ? "DRY RUN" : "LIVE SUBMIT"}`);
  console.log(`Retry failed:  ${SKIP_FAILED ? "no" : "yes"}`);
  console.log("─".repeat(50));

  if (queue.length === 0) {
    console.log("Nothing to submit!");
    process.exit(0);
  }

  // use a persistent Playwright profile so fresh sessions reuse authenticated state
  const profileDir = ORACLE_PROFILE_DIR;
  try {
    if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });
  } catch (err) {
    console.warn('Could not create profile dir', profileDir, err?.message || err);
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    viewport: { width: 1280, height: 900 },
  });

  // prefer existing page in persistent context (keeps Home state)
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(ORACLE_HOME_URL, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});

  if (page.url().includes("Login.jsf")) {
    await page.goto(ORACLE_LOGIN_URL, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  }

  let submitted = 0;
  let errored = 0;

  try {
    for (const item of queue) {
      progress.inProgress = item.InvoiceNo;
      saveProgress(progress);

      const result = await submitClaim(page, item);
      removeTxnFromProgress(progress, item.InvoiceNo);

      if (result.status === "SUBMITTED" || result.status === "READY_TO_SUBMIT") {
        progress.completed.push({
          txn: result.txn,
          communicationId: result.confirmation,
          submittedAt: new Date().toISOString(),
          status: result.status,
        });
        submitted += 1;
        console.log(`  [${result.txn}] ${result.status} ✓`);
      } else {
        progress.failed.push({
          txn: result.txn,
          reason: result.reason,
          failedAt: new Date().toISOString(),
        });
        errored += 1;
        console.log(`  [${result.txn}] FAILED: ${result.reason}`);
      }

      progress.inProgress = null;
      saveProgress(progress);

      if (item !== queue[queue.length - 1]) {
        await page.waitForTimeout(3000);
      }
    }
  } finally {
    if (!process.env.KEEP_BROWSER) {
      await context.close().catch(() => {});
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("SUBMISSION COMPLETE");
  console.log(`Submitted:  ${submitted}`);
  console.log(`Errors:     ${errored}`);
  console.log(`Progress:   ${PROGRESS_PATH}`);
}

main().catch(error => {
  console.error("Fatal:", error.message);
  process.exit(1);
});
