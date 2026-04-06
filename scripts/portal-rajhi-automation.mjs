#!/usr/bin/env node
/**
 * Al-Rajhi Appeal Portal Automation
 * ====================================
 * Submits re-adjudication CommunicationRequests via the NPHIES Oasis portal
 * for the Al-Rajhi Riyadh batch BAT-2026-NB-00004295-OT.
 *
 * Portal:   https://portal.nphies.sa  (same ADF-based Oasis UI as MOH)
 * Workflow: Search by Transaction ID → "Send Communication" → paste text → Submit
 *
 * Usage:
 *   node scripts/portal-rajhi-automation.mjs status
 *   node scripts/portal-rajhi-automation.mjs next [auto|limit|oracle|manual|all]
 *   node scripts/portal-rajhi-automation.mjs generate <transactionId>
 *   node scripts/portal-rajhi-automation.mjs complete <transactionId>
 *   node scripts/portal-rajhi-automation.mjs fail <transactionId> [reason]
 *   node scripts/portal-rajhi-automation.mjs skip <transactionId>
 *   node scripts/portal-rajhi-automation.mjs reset
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PORTAL_DATA_FILE  = join(ROOT, 'artifacts', 'rajhi_portal_data.json');
const PROGRESS_FILE     = join(ROOT, 'artifacts', 'rajhi_portal_progress.json');
const ORACLE_QUEUE_FILE = join(ROOT, 'outputs', 'rajhi-appeal-prep', 'oracle_doc_queue.csv');

const PORTAL_URL = 'https://portal.nphies.sa';

// ─── Data loading ──────────────────────────────────────────────────────────
function loadPortalData(filter = 'all') {
  const data = JSON.parse(readFileSync(PORTAL_DATA_FILE, 'utf-8'));
  switch (filter) {
    case 'auto':   return data.filter(d => d.Readiness === 'READY_AUTO_APPEAL' && d.FinalStatus === 'PORTAL_READY');
    case 'limit':  return data.filter(d => d.FinalStatus === 'LIMIT_ONLY');
    case 'oracle': return data.filter(d => ['ORACLE_ONLY','ORACLE_AND_LIMIT'].includes(d.FinalStatus));
    case 'manual': return data.filter(d => d.FinalStatus === 'MANUAL_REVIEW');
    case 'ready':  return data.filter(d => ['PORTAL_READY','LIMIT_ONLY'].includes(d.FinalStatus));
    default:       return data;
  }
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    batch: 'BAT-2026-NB-00004295-OT',
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    completed: [],
    failed: [],
    skipped: [],
    oraclePending: [],
    inProgress: null
  };
}

function saveProgress(p) {
  p.lastUpdated = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function getNext(data, progress) {
  const done = new Set([
    ...progress.completed.map(c => c.txn),
    ...progress.failed.map(c => c.txn),
    ...progress.skipped.map(c => c.txn),
  ]);
  return data.find(d => !done.has(d.InvoiceNo));
}

// ─── Playwright code generators ───────────────────────────────────────────
function escapeText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function genSearchStep(txnId) {
  return `
// STEP 1: Navigate to NPHIES portal and search for Transaction ID
// Portal: ${PORTAL_URL}
// Transaction ID: ${txnId}

// Ensure you are logged in. If not, navigate and log in first.
const invoiceInput = page.locator('[placeholder="Invoice"]');
if (await invoiceInput.isVisible()) {
  await invoiceInput.fill('${txnId}');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
} else {
  // Try search box variant
  const searchInput = page.locator('input[type="text"]').first();
  await searchInput.fill('${txnId}');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
}

// Verify claim found
const pageText = await page.evaluate(() => document.body.innerText);
const found = pageText.includes('${txnId}');
console.log('Claim found:', found);
`.trim();
}

function genSendCommunicationStep(txnId, content) {
  const esc = escapeText(content);
  return `
// STEP 2: Open "Send Communication" dialog for txn ${txnId}
const menuItem = page.locator('[role="menuitem"]:has-text("Send Communication")');
if (await menuItem.isVisible()) {
  await menuItem.click();
  await page.waitForTimeout(1500);
} else {
  // Right-click the claim row to get context menu
  const claimRow = page.locator('tr').filter({ hasText: '${txnId}' }).first();
  await claimRow.click({ button: 'right' });
  await page.waitForTimeout(800);
  const ctxMenu = page.locator('[role="menuitem"]:has-text("Send Communication")');
  await ctxMenu.click();
  await page.waitForTimeout(1500);
}

// STEP 3: Detect ADF dialog iframe
const iframeId = await page.evaluate(() => {
  const iframes = document.querySelectorAll('iframe');
  const dlg = Array.from(iframes).find(f => f.src?.includes('adf.dialog-request'));
  return dlg ? dlg.id : null;
});
console.log('Dialog iframe ID:', iframeId);

// STEP 4: Tick "Info" checkbox inside iframe
await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe.contentDocument;
  const infoCb = doc.querySelector('[id*="j_idt13:_0"]');
  if (infoCb) infoCb.click();
}, iframeId);
await page.waitForTimeout(500);

// STEP 5: Fill textarea with appeal content
const contentText = "${esc}";
await page.evaluate((args) => {
  const iframe = document.getElementById(args.fId);
  const doc = iframe.contentDocument;
  const textarea = doc.querySelector('textarea');
  if (textarea) {
    textarea.value = args.text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, { fId: iframeId, text: contentText });
await page.waitForTimeout(800);

// STEP 6: Click "Send Communication" button inside iframe
const sendResult = await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe.contentDocument;
  const sendBtns = doc.querySelectorAll('a[role="button"]');
  const sendBtn = Array.from(sendBtns).find(b => b.textContent?.trim() === 'Send Communication');
  if (sendBtn) { sendBtn.click(); return 'CLICKED'; }
  return 'NOT_FOUND';
}, iframeId);
console.log('Send button:', sendResult);
await page.waitForTimeout(2000);

// STEP 7: Check for success/error
const errorResult = await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe?.contentDocument;
  if (!doc) return { status: 'DIALOG_CLOSED' };
  const dialogs = doc.querySelectorAll('[role="dialog"]');
  for (const d of dialogs) {
    const text = d.textContent?.trim();
    const okBtn = d.querySelector('a[role="button"]');
    return { status: 'ERROR', message: text, hasOkBtn: !!okBtn };
  }
  return { status: 'SUCCESS' };
}, iframeId);
console.log('Result:', errorResult);
`.trim();
}

// ─── Commands ──────────────────────────────────────────────────────────────
const [,, cmd, arg1, arg2] = process.argv;

if (cmd === 'status') {
  const all = loadPortalData('all');
  const prog = loadProgress();
  const done = new Set(prog.completed.map(c => c.txn));
  const failed = new Set(prog.failed.map(c => c.txn));
  const skipped = new Set(prog.skipped.map(c => c.txn));
  const byStatus = {};
  for (const d of all) {
    byStatus[d.FinalStatus] = (byStatus[d.FinalStatus] || 0) + 1;
  }
  console.log(`\nAL-RAJHI PORTAL SUBMISSION STATUS`);
  console.log(`Batch: ${prog.batch}`);
  console.log(`Started: ${prog.startedAt}`);
  console.log(`─────────────────────────────────`);
  console.log(`Total bundles:   ${all.length}`);
  for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`);
  console.log(`─────────────────────────────────`);
  console.log(`Submitted:  ${prog.completed.length}`);
  console.log(`Failed:     ${prog.failed.length}`);
  console.log(`Skipped:    ${prog.skipped.length}`);
  console.log(`Remaining:  ${all.length - prog.completed.length - prog.failed.length - prog.skipped.length}`);
  if (prog.inProgress) console.log(`In Progress: txn=${prog.inProgress}`);
  process.exit(0);
}

if (cmd === 'next') {
  const filter = arg1 || 'ready';
  const data = loadPortalData(filter);
  const prog = loadProgress();
  const next = getNext(data, prog);
  if (!next) {
    console.log(`No more bundles in filter: ${filter}`);
    process.exit(0);
  }
  console.log(`\nNEXT BUNDLE (filter: ${filter})`);
  console.log(`Transaction ID: ${next.InvoiceNo}`);
  console.log(`Bundle ID:      ${next.BundleID}`);
  console.log(`Readiness:      ${next.Readiness}`);
  console.log(`Final Status:   ${next.FinalStatus}`);
  console.log(`Flags:          ${next.Flags}`);
  console.log(`Net Amount:     SAR ${next.NetAmount}`);
  console.log(`Claim Type:     ${next.ClaimType}`);
  console.log(`Codes:          ${next.Codes}`);
  console.log(`\n>>> STEP 1: Search\n`);
  console.log(genSearchStep(next.InvoiceNo));
  console.log(`\n>>> STEP 2: Send Communication\n`);
  console.log(genSendCommunicationStep(next.InvoiceNo, next.Content));
  // Mark as in progress
  prog.inProgress = next.InvoiceNo;
  saveProgress(prog);
  process.exit(0);
}

if (cmd === 'generate') {
  const txn = arg1;
  const all = loadPortalData('all');
  const item = all.find(d => d.InvoiceNo === txn);
  if (!item) { console.error(`Transaction ID ${txn} not found`); process.exit(1); }
  console.log(`\n=== PLAYWRIGHT CODE FOR TXN ${txn} ===\n`);
  console.log('// --- SEARCH ---');
  console.log(genSearchStep(txn));
  console.log('\n// --- SEND COMMUNICATION ---');
  console.log(genSendCommunicationStep(txn, item.Content));
  process.exit(0);
}

if (cmd === 'complete') {
  const txn = arg1;
  const prog = loadProgress();
  if (!prog.completed.find(c => c.txn === txn)) {
    prog.completed.push({ txn, completedAt: new Date().toISOString() });
  }
  if (prog.inProgress === txn) prog.inProgress = null;
  saveProgress(prog);
  console.log(`✅ Marked txn=${txn} as COMPLETE (${prog.completed.length} total)`);
  process.exit(0);
}

if (cmd === 'fail') {
  const txn = arg1;
  const reason = arg2 || 'Unknown error';
  const prog = loadProgress();
  if (!prog.failed.find(c => c.txn === txn)) {
    prog.failed.push({ txn, reason, failedAt: new Date().toISOString() });
  }
  if (prog.inProgress === txn) prog.inProgress = null;
  saveProgress(prog);
  console.log(`❌ Marked txn=${txn} as FAILED: ${reason}`);
  process.exit(0);
}

if (cmd === 'skip') {
  const txn = arg1;
  const prog = loadProgress();
  if (!prog.skipped.find(c => c.txn === txn)) {
    prog.skipped.push({ txn, skippedAt: new Date().toISOString() });
  }
  if (prog.inProgress === txn) prog.inProgress = null;
  saveProgress(prog);
  console.log(`⏭  Marked txn=${txn} as SKIPPED`);
  process.exit(0);
}

if (cmd === 'reset') {
  writeFileSync(PROGRESS_FILE, JSON.stringify({
    batch: 'BAT-2026-NB-00004295-OT',
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    completed: [], failed: [], skipped: [], oraclePending: [], inProgress: null
  }, null, 2));
  console.log('Progress reset.');
  process.exit(0);
}

if (cmd === 'oracle-list') {
  console.log('\nBundles needing Oracle doc extraction:');
  console.log('These must be fetched from oracle-abha.brainsait.org before submission.\n');
  const all = loadPortalData('oracle');
  for (const d of all) {
    console.log(`  txn=${d.InvoiceNo}  type=${d.ClaimType}  codes=${d.Codes}  net=SAR ${d.NetAmount}`);
    console.log(`  Bundle: ${d.BundleID}`);
    console.log(`  Flags:  ${d.Flags}`);
    console.log();
  }
  process.exit(0);
}

// Default: show usage
console.log(`
Al-Rajhi Portal Automation – ${PORTAL_URL}
Batch: BAT-2026-NB-00004295-OT

Usage:
  node scripts/portal-rajhi-automation.mjs status
  node scripts/portal-rajhi-automation.mjs next [ready|auto|limit|oracle|manual|all]
  node scripts/portal-rajhi-automation.mjs generate <transactionId>
  node scripts/portal-rajhi-automation.mjs complete <transactionId>
  node scripts/portal-rajhi-automation.mjs fail <transactionId> [reason]
  node scripts/portal-rajhi-automation.mjs skip <transactionId>
  node scripts/portal-rajhi-automation.mjs oracle-list
  node scripts/portal-rajhi-automation.mjs reset

Workflow:
  1. Run 'next ready'         → get first PORTAL_READY bundle + Playwright code
  2. Open ${PORTAL_URL}
  3. Run generated Playwright code in integrated browser
  4. Run 'complete <txn>'     → mark done, move to next
  5. For ORACLE bundles: fetch docs from oracle-abha.brainsait.org first
`);
