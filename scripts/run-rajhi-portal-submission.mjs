#!/usr/bin/env node
/**
 * NPHIES Portal – Full Auto Submission Runner
 * ============================================
 * Submits all PORTAL_READY Al-Rajhi bundles automatically once logged in.
 *
 * Prerequisites:
 *   1. Log into https://portal.nphies.sa in the integrated browser
 *   2. Navigate to the Claims/Communication section
 *   3. Run: node scripts/run-rajhi-portal-submission.mjs
 *
 * The script reads artifacts/rajhi_portal_data.json and
 * updates artifacts/rajhi_portal_progress.json after each submission.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PORTAL_DATA  = join(ROOT, 'artifacts', 'rajhi_portal_data.json');
const PROGRESS     = join(ROOT, 'artifacts', 'rajhi_portal_progress.json');
const PORTAL_URL   = 'https://portal.nphies.sa';

// Submission filters — change to include more groups
const INCLUDE_STATUSES = ['PORTAL_READY', 'LIMIT_ONLY'];
// Set to true to run all including oracle bundles (after docs attached)
const INCLUDE_ORACLE = false;
// Delay between submissions (ms)
const BETWEEN_DELAY = 3000;

function loadProgress() {
  if (existsSync(PROGRESS)) return JSON.parse(readFileSync(PROGRESS, 'utf-8'));
  return { batch: 'BAT-2026-NB-00004295-OT', started: new Date().toISOString(),
           completed: [], failed: [], skipped: [], inProgress: null, lastUpdated: null };
}

function saveProgress(p) {
  p.lastUpdated = new Date().toISOString();
  writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
}

async function submitClaim(page, item) {
  const txn = item.InvoiceNo;
  console.log(`\n[${txn}] Starting submission...`);

  // ── 1. Search for the transaction ──────────────────────────────────────
  let found = false;
  try {
    const inv = page.locator('[placeholder="Invoice"]');
    if (await inv.isVisible({ timeout: 3000 })) {
      await inv.fill(txn);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    } else {
      const box = page.locator('input[type="text"]').first();
      await box.fill(txn);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
    const bodyText = await page.evaluate(() => document.body.innerText);
    found = bodyText.includes(txn);
  } catch (e) {
    console.error(`  [${txn}] Search error: ${e.message}`);
    return { txn, status: 'FAILED', reason: `Search error: ${e.message}` };
  }

  if (!found) {
    console.error(`  [${txn}] Claim not found in portal search`);
    return { txn, status: 'FAILED', reason: 'Claim not found in search' };
  }
  console.log(`  [${txn}] Found ✓`);

  // ── 2. Open Send Communication ─────────────────────────────────────────
  let iframeId = null;
  try {
    const menuItem = page.locator('[role="menuitem"]:has-text("Send Communication")');
    if (await menuItem.isVisible({ timeout: 2000 })) {
      await menuItem.click();
    } else {
      const row = page.locator('tr').filter({ hasText: txn }).first();
      await row.click({ button: 'right' });
      await page.waitForTimeout(500);
      await page.locator('[role="menuitem"]:has-text("Send Communication")').click();
    }
    await page.waitForTimeout(1500);

    iframeId = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      const dlg = Array.from(iframes).find(f => f.src?.includes('adf.dialog-request'));
      return dlg?.id || null;
    });
  } catch (e) {
    return { txn, status: 'FAILED', reason: `Menu open error: ${e.message}` };
  }

  if (!iframeId) {
    return { txn, status: 'FAILED', reason: 'ADF dialog iframe not found' };
  }
  console.log(`  [${txn}] Dialog opened (iframe: ${iframeId}) ✓`);

  // ── 3. Tick Info checkbox ──────────────────────────────────────────────
  await page.evaluate((fId) => {
    const doc = document.getElementById(fId)?.contentDocument;
    const cb = doc?.querySelector('[id*="j_idt13:_0"]');
    if (cb) cb.click();
  }, iframeId);
  await page.waitForTimeout(500);

  // ── 4. Fill content textarea ───────────────────────────────────────────
  await page.evaluate((args) => {
    const doc = document.getElementById(args.fId)?.contentDocument;
    const ta = doc?.querySelector('textarea');
    if (ta) {
      ta.value = args.text;
      ta.dispatchEvent(new Event('input',  { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { fId: iframeId, text: item.Content });
  await page.waitForTimeout(800);
  console.log(`  [${txn}] Content filled ✓`);

  // ── 5. Click Send Communication ────────────────────────────────────────
  const sendResult = await page.evaluate((fId) => {
    const doc = document.getElementById(fId)?.contentDocument;
    const btn = Array.from(doc?.querySelectorAll('a[role="button"]') || [])
                     .find(b => b.textContent?.trim() === 'Send Communication');
    if (btn) { btn.click(); return 'CLICKED'; }
    return 'NOT_FOUND';
  }, iframeId);

  if (sendResult !== 'CLICKED') {
    return { txn, status: 'FAILED', reason: 'Send button not found in dialog' };
  }
  await page.waitForTimeout(2500);

  // ── 6. Check for errors ────────────────────────────────────────────────
  const check = await page.evaluate((fId) => {
    const doc = document.getElementById(fId)?.contentDocument;
    if (!doc) return { status: 'DIALOG_CLOSED' };
    for (const d of doc.querySelectorAll('[role="dialog"]')) {
      const msg = d.textContent?.trim();
      const btn = d.querySelector('a[role="button"]');
      if (btn) btn.click(); // dismiss error
      return { status: 'ERROR', message: msg };
    }
    return { status: 'SUCCESS' };
  }, iframeId);

  if (check.status === 'ERROR') {
    console.error(`  [${txn}] Portal error: ${check.message}`);
    return { txn, status: 'FAILED', reason: check.message };
  }

  console.log(`  [${txn}] SUBMITTED ✓`);
  return { txn, status: 'SUCCESS' };
}

async function main() {
  const allData = JSON.parse(readFileSync(PORTAL_DATA, 'utf-8'));
  const prog = loadProgress();
  const done = new Set([
    ...prog.completed.map(c => c.txn),
    ...prog.failed.map(c => c.txn),
    ...prog.skipped.map(c => c.txn),
  ]);

  // Filter to submittable items
  const queue = allData.filter(d => {
    if (done.has(d.InvoiceNo)) return false;
    if (INCLUDE_ORACLE) return true;
    if (d.NeedsOracle) { console.log(`SKIP [${d.InvoiceNo}] – needs Oracle doc first`); return false; }
    return INCLUDE_STATUSES.includes(d.FinalStatus);
  });

  console.log(`\nAL-RAJHI PORTAL SUBMISSION RUNNER`);
  console.log(`Total in queue:  ${queue.length}`);
  console.log(`Already done:    ${done.size}`);
  console.log(`Portal URL:      ${PORTAL_URL}`);
  console.log('─'.repeat(50));

  if (queue.length === 0) {
    console.log('Nothing left to submit!');
    process.exit(0);
  }

  // Connect to already-open Chrome with the user logged in
  let browser, page;
  try {
    // Try to connect to existing Chrome (if launched with --remote-debugging-port=9222)
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    const pages = contexts[0]?.pages() || [];
    page = pages.find(p => p.url().includes('portal.nphies.sa')) || pages[0];
    if (!page) throw new Error('No portal page open');
    console.log('Connected to existing Chrome session ✓');
  } catch (cdpErr) {
    // Fall back to launching a new browser
    console.log('Launching new browser (you will need to log in)...');
    browser = await chromium.launch({ headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto(PORTAL_URL);
    console.log('Please log in to https://portal.nphies.sa and press ENTER to continue...');
    await new Promise(r => process.stdin.once('data', r));
  }

  // Process queue
  let submitted = 0, errored = 0;
  for (const item of queue) {
    prog.inProgress = item.InvoiceNo;
    saveProgress(prog);

    const result = await submitClaim(page, item);

    if (result.status === 'SUCCESS') {
      prog.completed.push({ txn: result.txn, submittedAt: new Date().toISOString() });
      submitted++;
    } else {
      prog.failed.push({ txn: result.txn, reason: result.reason, failedAt: new Date().toISOString() });
      errored++;
    }
    prog.inProgress = null;
    saveProgress(prog);

    if (item !== queue[queue.length - 1]) await page.waitForTimeout(BETWEEN_DELAY);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`SUBMISSION COMPLETE`);
  console.log(`Submitted:   ${submitted}`);
  console.log(`Errors:      ${errored}`);
  console.log(`Total done:  ${prog.completed.length}/${allData.length}`);
  console.log(`Progress:    ${PROGRESS}`);

  if (!process.env.KEEP_BROWSER) await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
