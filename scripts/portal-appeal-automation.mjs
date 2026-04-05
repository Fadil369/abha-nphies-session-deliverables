#!/usr/bin/env node
/**
 * Portal Appeal Automation Script
 * 
 * Automates NPHIES CommunicationRequest submissions via the Oasis portal
 * for claims with "Partial Approve" status.
 * 
 * Designed to be used with the VS Code browser tools (Playwright).
 * Each function handles one step of the workflow.
 * 
 * Usage: Import and call processClaim() for each claim, or call
 *        processAllClaims() to iterate through the data file.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', 'artifacts');
const APPEAL_DATA_FILE = join(ARTIFACTS_DIR, 'appeal_portal_data.json');
const PROGRESS_FILE = join(ARTIFACTS_DIR, 'portal_appeal_progress.json');

// Load appeal data
function loadAppealData(filter = 'all') {
  const raw = readFileSync(APPEAL_DATA_FILE, 'utf-8');
  let appeals = JSON.parse(raw);
  
  if (filter === 'auto') {
    appeals = appeals.filter(a => a.Readiness === 'READY_AUTO_APPEAL');
  } else if (filter === 'partial') {
    appeals = appeals.filter(a => a.Readiness === 'PARTIAL_AUTO_APPEAL');
  } else if (filter === 'manual') {
    appeals = appeals.filter(a => a.Readiness === 'MANUAL_REVIEW');
  }
  
  return appeals;
}

// Load/save progress tracking
function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    completed: [],
    failed: [],
    skipped: [],
    inProgress: null
  };
}

function saveProgress(progress) {
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Get next unprocessed claim
function getNextClaim(appeals, progress) {
  const processedInvoices = new Set([
    ...progress.completed.map(c => c.invoice),
    ...progress.failed.map(c => c.invoice),
    ...progress.skipped.map(c => c.invoice)
  ]);
  
  return appeals.find(a => !processedInvoices.has(a.InvoiceNo));
}

// Generate the Playwright code for processing a single claim
function generatePlaywrightCode(invoiceNo, appealText, step) {
  const escapedText = appealText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
  
  switch (step) {
    case 'search':
      return `
// Step 1: Search for claim by invoice number
const invoiceInput = page.locator('[placeholder="Invoice"]');
await invoiceInput.click({ clickCount: 3 });
await invoiceInput.fill('${invoiceNo}');
await page.waitForTimeout(300);

// Click search button
await page.click('[id$="ff1:fi4:b13"]');
await page.waitForTimeout(3000);

// Verify claim loaded
const pageText = await page.evaluate(() => document.body.innerText);
const hasInvoice = pageText.includes('${invoiceNo}');
return { step: 'search', invoice: '${invoiceNo}', claimFound: hasInvoice };
`;
      
    case 'openSendComm':
      return `
// Step 2: Open Submit dropdown and click Send Communication
await page.click('[id*="oc4:oc2457:or8:oc19:b2::popEl"]');
await page.waitForTimeout(500);

// Click "Send Communication" menu item
const menuItem = page.locator('[role="menuitem"]:has-text("Send Communication")');
await menuItem.click();
await page.waitForTimeout(3000);

// Verify dialog opened
const hasIframe = await page.evaluate(() => {
  const iframes = document.querySelectorAll('iframe');
  return Array.from(iframes).some(f => f.src?.includes('adf.dialog-request'));
});
return { step: 'openSendComm', invoice: '${invoiceNo}', dialogOpened: hasIframe };
`;

    case 'checkInfoAndSend':
      return `
// Step 3: Check Info checkbox and click Send Communication (first attempt)
const iframeId = await page.evaluate(() => {
  const iframes = document.querySelectorAll('iframe');
  const dlgIframe = Array.from(iframes).find(f => f.src?.includes('adf.dialog-request'));
  return dlgIframe?.id;
});

if (!iframeId) return { step: 'checkInfoAndSend', error: 'dialog iframe not found' };

// Check Info checkbox
await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe.contentDocument;
  const infoCb = doc.querySelector('[id*="j_idt13:_0"]');
  if (infoCb && !infoCb.checked) infoCb.click();
}, iframeId);

await page.waitForTimeout(500);

// Click Send Communication button (first attempt - creates draft)
await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe.contentDocument;
  const sendBtns = doc.querySelectorAll('a[role="button"]');
  const sendBtn = Array.from(sendBtns).find(b => b.textContent?.trim() === 'Send Communication');
  if (sendBtn) sendBtn.click();
}, iframeId);

await page.waitForTimeout(4000);

// Check for error dialog and close it
const errorResult = await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe.contentDocument;
  const dialogs = doc.querySelectorAll('[role="dialog"]');
  for (const d of dialogs) {
    if (d.offsetHeight > 0) {
      const text = d.textContent?.trim();
      const okBtn = d.querySelector('a[role="button"]');
      if (okBtn) okBtn.click();
      return { hadDialog: true, text: text?.substring(0, 100) };
    }
  }
  return { hadDialog: false };
}, iframeId);

return { step: 'checkInfoAndSend', invoice: '${invoiceNo}', ...errorResult, iframeId };
`;

    case 'enterContentAndSend':
      return `
// Step 4: Enter appeal content and send (second attempt)
const iframeId2 = await page.evaluate(() => {
  const iframes = document.querySelectorAll('iframe');
  const dlgIframe = Array.from(iframes).find(f => f.src?.includes('adf.dialog-request'));
  return dlgIframe?.id;
});

if (!iframeId2) return { step: 'enterContentAndSend', error: 'dialog iframe not found' };

// Enter content text
const contentText = "${escapedText}";

await page.evaluate((args) => {
  const iframe = document.getElementById(args.fId);
  const doc = iframe.contentDocument;
  const textarea = doc.querySelector('textarea');
  if (textarea) {
    textarea.value = args.text;
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, { fId: iframeId2, text: contentText });

await page.waitForTimeout(500);

// Click Send Communication button (second attempt)
await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe.contentDocument;
  const sendBtns = doc.querySelectorAll('a[role="button"]');
  const sendBtn = Array.from(sendBtns).find(b => b.textContent?.trim() === 'Send Communication');
  if (sendBtn) sendBtn.click();
}, iframeId2);

await page.waitForTimeout(5000);

// Check for success or error
const result = await page.evaluate((fId) => {
  const iframe = document.getElementById(fId);
  const doc = iframe.contentDocument;
  const dialogs = doc.querySelectorAll('[role="dialog"]');
  for (const d of dialogs) {
    if (d.offsetHeight > 0) {
      const text = d.textContent?.trim();
      const isSuccess = text?.includes('Sent Successfully') || text?.includes('14220');
      const isError = text?.includes('Error') || text?.includes('14185');
      const okBtn = d.querySelector('a[role="button"]');
      if (okBtn) okBtn.click();
      return { success: isSuccess, error: isError, message: text?.substring(0, 150) };
    }
  }
  return { success: false, error: false, message: 'No dialog appeared' };
}, iframeId2);

return { step: 'enterContentAndSend', invoice: '${invoiceNo}', ...result };
`;

    case 'closeDialog':
      return `
// Step 5: Close the Send Communication dialog
const iframeId3 = await page.evaluate(() => {
  const iframes = document.querySelectorAll('iframe');
  const dlgIframe = Array.from(iframes).find(f => f.src?.includes('adf.dialog-request'));
  return dlgIframe?.id;
});

if (iframeId3) {
  await page.evaluate((fId) => {
    const iframe = document.getElementById(fId);
    const doc = iframe.contentDocument;
    const cancelLinks = doc.querySelectorAll('a');
    const cancelLink = Array.from(cancelLinks).find(l => l.textContent?.trim() === 'Cancel');
    if (cancelLink) cancelLink.click();
  }, iframeId3);
}
await page.waitForTimeout(2000);
return { step: 'closeDialog', invoice: '${invoiceNo}', closed: true };
`;

    default:
      return `return { error: 'Unknown step: ${step}' };`;
  }
}

// Print summary
function printSummary(progress) {
  console.log('\n=== Portal Appeal Submission Progress ===');
  console.log(`Started: ${progress.startedAt}`);
  console.log(`Last Updated: ${progress.lastUpdated}`);
  console.log(`Completed: ${progress.completed.length}`);
  console.log(`Failed: ${progress.failed.length}`);
  console.log(`Skipped: ${progress.skipped.length}`);
  
  if (progress.completed.length > 0) {
    console.log('\nLast 5 completed:');
    progress.completed.slice(-5).forEach(c => {
      console.log(`  INV ${c.invoice}: ${c.message || 'OK'}`);
    });
  }
  
  if (progress.failed.length > 0) {
    console.log('\nFailed claims:');
    progress.failed.forEach(f => {
      console.log(`  INV ${f.invoice}: ${f.error}`);
    });
  }
}

// Generate a batch Playwright script for processing N claims
function generateBatchScript(appeals, startIndex, batchSize = 5) {
  const batch = appeals.slice(startIndex, startIndex + batchSize);
  
  const claimConfigs = batch.map(a => ({
    invoice: a.InvoiceNo,
    content: a.Content?.replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"')
  }));
  
  return `
// Batch processing ${batch.length} claims (index ${startIndex}-${startIndex + batch.length - 1})
const claims = ${JSON.stringify(claimConfigs.map(c => ({ invoice: c.invoice })))};
const results = [];

for (const claim of claims) {
  const result = { invoice: claim.invoice, steps: [] };
  
  try {
    // Step 1: Search for claim
    const invoiceInput = page.locator('[placeholder="Invoice"]');
    await invoiceInput.click({ clickCount: 3 });
    await invoiceInput.fill(claim.invoice);
    await page.waitForTimeout(300);
    await page.click('[id$="ff1:fi4:b13"]');
    await page.waitForTimeout(3000);
    result.steps.push('searched');

    // Step 2: Open Send Communication
    await page.click('[id*="oc4:oc2457:or8:oc19:b2::popEl"]');
    await page.waitForTimeout(500);
    await page.click('[role="menuitem"]:has-text("Send Communication")');
    await page.waitForTimeout(3000);
    result.steps.push('dialog_opened');

    // Step 3: Check Info and first send
    const iframeId = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      const dlgIframe = Array.from(iframes).find(f => f.src?.includes('adf.dialog-request'));
      return dlgIframe?.id;
    });
    
    if (!iframeId) { result.error = 'no dialog iframe'; results.push(result); continue; }

    await page.evaluate((fId) => {
      const doc = document.getElementById(fId).contentDocument;
      const cb = doc.querySelector('[id*="j_idt13:_0"]');
      if (cb && !cb.checked) cb.click();
    }, iframeId);

    await page.evaluate((fId) => {
      const doc = document.getElementById(fId).contentDocument;
      const btns = doc.querySelectorAll('a[role="button"]');
      const btn = Array.from(btns).find(b => b.textContent?.trim() === 'Send Communication');
      if (btn) btn.click();
    }, iframeId);
    await page.waitForTimeout(4000);

    // Close error dialog
    await page.evaluate((fId) => {
      const doc = document.getElementById(fId).contentDocument;
      const dialogs = doc.querySelectorAll('[role="dialog"]');
      for (const d of dialogs) {
        if (d.offsetHeight > 0) {
          const ok = d.querySelector('a[role="button"]');
          if (ok) ok.click();
        }
      }
    }, iframeId);
    await page.waitForTimeout(1000);
    result.steps.push('first_send');

    // Step 4: Enter content and send again
    // Content will be filled in the textarea
    const contentForClaim = appealContents[claim.invoice] || 'Re-adjudication requested per agreed tariff schedule.';
    
    await page.evaluate((args) => {
      const doc = document.getElementById(args.fId).contentDocument;
      const ta = doc.querySelector('textarea');
      if (ta) { ta.value = args.text; ta.dispatchEvent(new Event('change', {bubbles:true})); }
    }, { fId: iframeId, text: contentForClaim });
    await page.waitForTimeout(500);

    await page.evaluate((fId) => {
      const doc = document.getElementById(fId).contentDocument;
      const btns = doc.querySelectorAll('a[role="button"]');
      const btn = Array.from(btns).find(b => b.textContent?.trim() === 'Send Communication');
      if (btn) btn.click();
    }, iframeId);
    await page.waitForTimeout(5000);

    // Check result
    const sendResult = await page.evaluate((fId) => {
      const doc = document.getElementById(fId).contentDocument;
      const dialogs = doc.querySelectorAll('[role="dialog"]');
      for (const d of dialogs) {
        if (d.offsetHeight > 0) {
          const text = d.textContent?.trim();
          const ok = d.querySelector('a[role="button"]');
          if (ok) ok.click();
          return { success: text?.includes('Successfully'), message: text?.substring(0, 100) };
        }
      }
      return { success: false, message: 'No dialog' };
    }, iframeId);
    
    result.success = sendResult.success;
    result.message = sendResult.message;
    result.steps.push('second_send');

    // Step 5: Close dialog
    await page.evaluate((fId) => {
      const doc = document.getElementById(fId).contentDocument;
      const links = doc.querySelectorAll('a');
      const cancel = Array.from(links).find(l => l.textContent?.trim() === 'Cancel');
      if (cancel) cancel.click();
    }, iframeId);
    await page.waitForTimeout(2000);
    result.steps.push('closed');

  } catch (e) {
    result.error = e.message;
  }
  
  results.push(result);
}

return results;
`;
}

// Main exports for use
export {
  loadAppealData,
  loadProgress,
  saveProgress,
  getNextClaim,
  generatePlaywrightCode,
  generateBatchScript,
  printSummary
};

// CLI mode
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2] || 'status';
  const filter = process.argv[3] || 'auto';
  
  switch (action) {
    case 'status': {
      const progress = loadProgress();
      const appeals = loadAppealData(filter);
      console.log(`Total ${filter} appeals: ${appeals.length}`);
      printSummary(progress);
      const next = getNextClaim(appeals, progress);
      if (next) console.log(`\nNext claim to process: INV ${next.InvoiceNo}`);
      break;
    }
    case 'next': {
      const progress = loadProgress();
      const appeals = loadAppealData(filter);
      const next = getNextClaim(appeals, progress);
      if (next) {
        console.log(JSON.stringify({ invoice: next.InvoiceNo, content: next.Content, readiness: next.Readiness }));
      } else {
        console.log('No more claims to process');
      }
      break;
    }
    case 'generate': {
      const step = process.argv[4] || 'search';
      const invoice = process.argv[5];
      const progress = loadProgress();
      const appeals = loadAppealData(filter);
      const appeal = invoice 
        ? appeals.find(a => a.InvoiceNo === invoice)
        : getNextClaim(appeals, progress);
      if (appeal) {
        console.log(generatePlaywrightCode(appeal.InvoiceNo, appeal.Content, step));
      }
      break;
    }
    case 'complete': {
      const invoice = process.argv[4];
      const message = process.argv[5] || 'OK';
      if (invoice) {
        const progress = loadProgress();
        progress.completed.push({ invoice, message, at: new Date().toISOString() });
        saveProgress(progress);
        console.log(`Marked INV ${invoice} as completed`);
      }
      break;
    }
    case 'fail': {
      const invoice = process.argv[4];
      const error = process.argv[5] || 'Unknown error';
      if (invoice) {
        const progress = loadProgress();
        progress.failed.push({ invoice, error, at: new Date().toISOString() });
        saveProgress(progress);
        console.log(`Marked INV ${invoice} as failed`);
      }
      break;
    }
    default:
      console.log('Usage: node portal-appeal-automation.mjs [status|next|generate|complete|fail] [auto|partial|manual|all]');
  }
}
