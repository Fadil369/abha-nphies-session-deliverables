import { chromium } from "playwright";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(PACKAGE_ROOT, ".env") });

const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_PROFILE_DIR = path.join(PACKAGE_ROOT, ".playwright-profile");
const DEFAULT_PROFILE_CLONE_DIR = path.join(PACKAGE_ROOT, "tmp", "documents-panel-profiles");
const DEFAULT_OUTPUT_DIR = path.join(PACKAGE_ROOT, "tmp", "documents-panel-probe");
const DEFAULT_TEMPLATE_FILE = "C:\\trans\\MEDREP.docx";

const BRANCH = {
  label: "Al-Hayat National Hospital - Riyadh",
  protocol: "https",
  cfHost: "oracle-riyadh.brainsait.org",
  directIp: "128.1.1.185",
  basePath: "/prod",
  user: process.env.RIYADH_USER ?? process.env.PORTAL_USER ?? "",
  pass: process.env.RIYADH_PASS ?? process.env.PORTAL_PASS ?? "",
};

const SEARCH_BOX_SELECTORS = [
  'input[placeholder*="Search Work Entities" i]',
  'input[placeholder*="Search Work Entities"]',
  'input[id*="wrk_ent_srch"]',
  'input[placeholder*="Search Tasks" i]',
  'input[placeholder*="Search..." i]',
  'input[id="pt1:r1:0:os-mainmenu-search::content"]',
];

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function coerceBoolean(value, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return String(value).toLowerCase() === "true";
}

function buildStamp() {
  return new Date().toISOString().replace(/[.:]/g, "-");
}

function cloneProfileDir(sourceDir, cloneRoot) {
  const targetDir = path.join(cloneRoot, buildStamp());
  mkdirSync(cloneRoot, { recursive: true });

  cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: sourcePath => {
      const baseName = path.basename(sourcePath);
      if (["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile"].includes(baseName)) {
        return false;
      }
      if (["Cache", "Code Cache", "GPUCache", "ShaderCache", "Crashpad"].includes(baseName)) {
        return false;
      }
      return true;
    },
  });

  return targetDir;
}

async function dismissPreviousSessionDialog(page, timeoutMs) {
  const dialog = page.locator("text=Previous session").first();
  if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
    const okButton = page.locator('button:has-text("Yes"), a:has-text("Yes"), button:has-text("OK"), a:has-text("OK")').first();
    await okButton.click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  }
}

async function tryPortalLogin(page, timeoutMs) {
  const userField = page.locator('[placeholder*="user" i], input[name*="user" i], input[id*="user" i]').first();
  const passField = page.locator('[placeholder*="pass" i], input[type="password"], input[name*="pass" i]').first();
  const loginButton = page.locator('a:has-text("Login"), button:has-text("Login"), button:has-text("Sign in")').first();

  if (!(await userField.isVisible({ timeout: 3000 }).catch(() => false))) {
    return !page.url().includes("Login.jsf");
  }

  if (!BRANCH.user || !BRANCH.pass) {
    return false;
  }

  await userField.fill(BRANCH.user).catch(() => {});
  await passField.fill(BRANCH.pass).catch(() => {});

  if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginButton.click().catch(() => {});
  } else {
    await passField.press("Enter").catch(() => {});
  }

  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await dismissPreviousSessionDialog(page, timeoutMs);

  return !page.url().includes("Login.jsf");
}

async function openMainMenu(page) {
  const hamburger = page.locator('[id="pt1:OasisHedarToolBar:hamburgerBtn"]').first();
  if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
    await hamburger.click().catch(() => {});
    await page.waitForTimeout(800);
  }
}

async function navigateToTaskFlow(page, taskFlowId, taskFlowLabel, timeoutMs) {
  await openMainMenu(page);

  for (const selector of SEARCH_BOX_SELECTORS) {
    const searchBox = page.locator(selector).first();
    if (await searchBox.isVisible({ timeout: 1500 }).catch(() => false)) {
      await searchBox.fill(taskFlowId).catch(() => {});
      await page.waitForTimeout(800);
      const item = page.locator(`[title="${taskFlowId}"]`).first();
      if (await item.isVisible({ timeout: 1500 }).catch(() => false)) {
        await item.click().catch(() => {});
      } else {
        await searchBox.press("Enter").catch(() => {});
      }
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
      await page.waitForTimeout(1500);
      const labelVisible = await page.getByText(taskFlowLabel, { exact: false }).first().isVisible({ timeout: 1500 }).catch(() => false);
      if (labelVisible) {
        return true;
      }
    }
  }

  await page.evaluate(activeTaskFlowId => {
    window.OasisMenuUtil?.navigateTo?.(activeTaskFlowId);
    window.MainMenuUtils?.navigateTo?.(activeTaskFlowId);
  }, taskFlowId).catch(() => {});

  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);

  const utilityNavigated = await page.getByText(taskFlowLabel, { exact: false }).first().isVisible({ timeout: 1500 }).catch(() => false);
  if (utilityNavigated) {
    return true;
  }

  await openMainMenu(page);
  const domClicked = await page.evaluate(({ activeTaskFlowId, activeTaskFlowLabel }) => {
    try {
      const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
      const nodes = Array.from(document.querySelectorAll('.os-treeview-item, .os-treeview-item-content, .os-treeview-item-text, [title]'));
      const match = nodes.find(element => {
        const text = normalize(element.textContent);
        const title = element.getAttribute?.("title") || "";
        return title === activeTaskFlowId || text.includes(activeTaskFlowLabel);
      });

      if (!match) {
        return false;
      }

      const clickable = match.closest('.os-treeview-item') || match;
      const options = { bubbles: true, cancelable: true, composed: true, view: window };
      clickable.dispatchEvent(new MouseEvent("mousedown", options));
      clickable.dispatchEvent(new MouseEvent("mouseup", options));
      clickable.dispatchEvent(new MouseEvent("click", options));
      return true;
    } catch {
      return false;
    }
  }, { activeTaskFlowId: taskFlowId, activeTaskFlowLabel: taskFlowLabel }).catch(() => false);

  if (domClicked) {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  return domClicked;
}

async function collectFrameSummary(frame) {
  return frame.evaluate(keywordSource => {
    const keywordRe = new RegExp(keywordSource, "i");

    const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
    const visible = element => {
      if (!(element instanceof Element)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const labelText = element => {
      if (element.labels?.length) {
        return normalize(Array.from(element.labels).map(label => label.textContent).join(" "));
      }
      if (!element.id) {
        return "";
      }
      try {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        return normalize(label?.textContent || "");
      } catch {
        return "";
      }
    };

    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, legend, [role='heading']"))
      .filter(visible)
      .map(node => normalize(node.textContent))
      .filter(Boolean)
      .slice(0, 50);

    const controls = Array.from(document.querySelectorAll("input, select, textarea, button, a, [role='button'], [role='link']"))
      .filter(visible)
      .map(element => {
        const entry = {
          tag: element.tagName.toLowerCase(),
          id: element.id || "",
          name: element.getAttribute("name") || "",
          type: element.getAttribute("type") || "",
          label: labelText(element),
          placeholder: element.getAttribute("placeholder") || "",
          title: element.getAttribute("title") || "",
          text: normalize("value" in element ? element.value || element.textContent || "" : element.textContent || ""),
        };
        const haystack = Object.values(entry).join(" ");
        return keywordRe.test(haystack) ? entry : null;
      })
      .filter(Boolean)
      .slice(0, 120);

    const matchedLines = Array.from(new Set(
      (document.body?.innerText || "")
        .split(/\n+/)
        .map(normalize)
        .filter(line => line && keywordRe.test(line))
    )).slice(0, 120);

    return {
      title: document.title,
      headings,
      controls,
      matchedLines,
    };
  }, "doc|report|patient|mrn|medical|attachment|download|print|visit|episode");
}

async function selectDocumentType(page, documentType, timeoutMs) {
  const documentTypeSelect = page.locator('select[id*="soc1::content"], select').first();
  if (!(await documentTypeSelect.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false;
  }

  await documentTypeSelect.selectOption({ label: documentType }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);
  return true;
}

async function clickGridRowAction(page, selector, rowIndex, timeoutMs) {
  const action = page.locator(selector).nth(rowIndex);
  if (!(await action.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { clicked: false, download: null };
  }

  const row = action.locator('xpath=ancestor::tr').first();
  if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
    await row.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 3000 }).catch(() => null);
  await action.click({ force: true }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);

  const download = await downloadPromise;
  if (!download) {
    return { clicked: true, download: null };
  }

  const downloadPath = path.join(DEFAULT_OUTPUT_DIR, `${buildStamp()}-${download.suggestedFilename() || "download"}`);
  await download.saveAs(downloadPath).catch(() => {});
  return {
    clicked: true,
    download: {
      suggestedFilename: download.suggestedFilename(),
      savedPath: downloadPath,
    },
  };
}

async function openSendDocument(page, rowIndex, timeoutMs) {
  return clickGridRowAction(page, 'a[title="Send Document"][id$="b6::popEl"]', rowIndex, timeoutMs);
}

async function openViewEdit(page, rowIndex, timeoutMs) {
  return clickGridRowAction(page, 'div[id$=":obt1:b5"] a[role="button"]', rowIndex, timeoutMs);
}

async function findEnabledAction(page, label) {
  const locator = page.locator(`button:has-text("${label}"), a:has-text("${label}"), [role="button"]:has-text("${label}")`);
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    const visible = await candidate.isVisible({ timeout: 1000 }).catch(() => false);
    if (!visible) {
      continue;
    }

    const enabled = await candidate.evaluate(element => {
      const selfDisabled = element.getAttribute("aria-disabled") === "true" || element.classList.contains("p_AFDisabled");
      const ancestorDisabled = Boolean(element.closest('[aria-disabled="true"], .p_AFDisabled'));
      return !(selfDisabled || ancestorDisabled);
    }).catch(() => false);

    if (enabled) {
      return candidate;
    }
  }

  return null;
}

async function clickDocumentAction(page, label, timeoutMs) {
  const action = await findEnabledAction(page, label);
  if (!action) {
    return { clicked: false, download: null, popup: false };
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
  await action.click().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(2000);

  const [download, popup] = await Promise.all([downloadPromise, popupPromise]);
  if (!download) {
    return { clicked: true, download: null, popup: Boolean(popup) };
  }

  const downloadPath = path.join(DEFAULT_OUTPUT_DIR, `${buildStamp()}-${download.suggestedFilename() || "download"}`);
  await download.saveAs(downloadPath).catch(() => {});
  return {
    clicked: true,
    popup: Boolean(popup),
    download: {
      suggestedFilename: download.suggestedFilename(),
      savedPath: downloadPath,
    },
  };
}

async function clickTemplateFile(page, timeoutMs, templateFile = DEFAULT_TEMPLATE_FILE, fileIndex = 0) {
  const links = page.locator('a[id$="tmp_lnk"]');
  const count = await links.count().catch(() => 0);
  if (count <= fileIndex) {
    return { clicked: false, text: null, download: null, popup: false };
  }

  let link = templateFile ? links.filter({ hasText: templateFile }).first() : links.nth(fileIndex);
  const preferredVisible = await link.isVisible({ timeout: 1500 }).catch(() => false);
  if (!preferredVisible) {
    link = links.nth(fileIndex);
  }

  if (!(await link.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { clicked: false, text: null, download: null, popup: false };
  }

  const text = await link.innerText().catch(() => null);
  const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
  await link.click().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(2000);

  const [download, popup] = await Promise.all([downloadPromise, popupPromise]);
  if (!download) {
    return { clicked: true, text, download: null, popup: Boolean(popup) };
  }

  const downloadPath = path.join(DEFAULT_OUTPUT_DIR, `${buildStamp()}-${download.suggestedFilename() || "download"}`);
  await download.saveAs(downloadPath).catch(() => {});
  return {
    clicked: true,
    text,
    popup: Boolean(popup),
    download: {
      suggestedFilename: download.suggestedFilename(),
      savedPath: downloadPath,
    },
  };
}

async function clickPrint(page, timeoutMs, templateFile = DEFAULT_TEMPLATE_FILE) {
  const templateLinksVisible = await page.locator('a[id$="tmp_lnk"]').first().isVisible({ timeout: 1000 }).catch(() => false);
  if (templateLinksVisible) {
    const templateFileAction = await clickTemplateFile(page, timeoutMs, templateFile);
    const finalPrintAction = await clickDocumentAction(page, "Print", timeoutMs);
    return { ...finalPrintAction, previewAction: null, templateFileAction, initialPrintAction: null };
  }

  const initialPrintAction = await clickDocumentAction(page, "Print", timeoutMs);
  if (initialPrintAction.clicked) {
    const templateFileAction = await clickTemplateFile(page, timeoutMs, templateFile);
    const finalPrintAction = await clickDocumentAction(page, "Print", timeoutMs);
    return { ...finalPrintAction, previewAction: null, templateFileAction, initialPrintAction };
  }

  const previewAction = await clickDocumentAction(page, "Preview", timeoutMs);
  if (!previewAction.clicked) {
    return { clicked: false, download: null, popup: false, previewAction, templateFileAction: null, initialPrintAction };
  }

  const templateFileAction = await clickTemplateFile(page, timeoutMs, templateFile);

  const retriedPrintAction = await clickDocumentAction(page, "Print", timeoutMs);
  return { ...retriedPrintAction, previewAction, templateFileAction, initialPrintAction };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const headless = coerceBoolean(args.headless, false);
  const cloneProfile = coerceBoolean(args["clone-profile"], true);
  const openViewEditAction = coerceBoolean(args["open-view-edit"], false);
  const openSendDocumentAction = coerceBoolean(args["open-send-document"], false);
  const clickPrintAction = coerceBoolean(args["click-print"], false);
  const useDirectIp = coerceBoolean(args["use-direct-ip"], false);
  const timeoutMs = parseInt(args["timeout-ms"] || "30000", 10);
  const sendDocumentRowIndex = parseInt(args["send-document-row-index"] || "0", 10);
  const viewEditRowIndex = parseInt(args["view-edit-row-index"] || String(sendDocumentRowIndex), 10);
  const documentType = args["document-type"] || null;
  const templateFile = args["template-file"] || DEFAULT_TEMPLATE_FILE;
  const taskFlowId = args["task-flow"] || "MANAGEDOCUMENTPANEL";
  const taskFlowLabel = args["task-flow-label"] || "Documents Panel";
  const outputDir = path.resolve(PACKAGE_ROOT, args["output-dir"] || DEFAULT_OUTPUT_DIR);
  const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;
  const liveProfileDir = path.resolve(PACKAGE_ROOT, process.env.ORACLE_PROFILE_DIR || DEFAULT_PROFILE_DIR);
  const profileCloneRoot = path.resolve(PACKAGE_ROOT, args["profile-clone-dir"] || DEFAULT_PROFILE_CLONE_DIR);

  if (!existsSync(liveProfileDir)) {
    throw new Error(`Profile directory does not exist: ${liveProfileDir}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const profileDir = cloneProfile
    ? cloneProfileDir(liveProfileDir, profileCloneRoot)
    : liveProfileDir;

  const loginUrl = `${BRANCH.protocol}://${useDirectIp ? BRANCH.directIp : BRANCH.cfHost}${BRANCH.basePath}/faces/Login.jsf`;
  const homeUrl = `${BRANCH.protocol}://${useDirectIp ? BRANCH.directIp : BRANCH.cfHost}${BRANCH.basePath}/faces/Home`;
  const outputBase = path.join(outputDir, buildStamp());
  const htmlPath = `${outputBase}.html`;
  const jsonPath = `${outputBase}.json`;
  const screenshotPath = `${outputBase}.png`;

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    executablePath: chromePath,
    viewport: { width: 1440, height: 960 },
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
    args: ["--ignore-certificate-errors"],
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});

  let authenticated = !page.url().includes("Login.jsf");
  if (!authenticated) {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
    authenticated = await tryPortalLogin(page, timeoutMs);
  }

  let navigated = false;
  let filteredByDocumentType = false;
  let viewEditAction = { clicked: false, download: null };
  let sendDocumentAction = { clicked: false, download: null };
  let printAction = { clicked: false, download: null, popup: false };
  if (authenticated) {
    navigated = await navigateToTaskFlow(page, taskFlowId, taskFlowLabel, timeoutMs);
    await page.waitForTimeout(2500);
    if (navigated && documentType) {
      filteredByDocumentType = await selectDocumentType(page, documentType, timeoutMs);
    }
    if (navigated && openViewEditAction) {
      viewEditAction = await openViewEdit(page, viewEditRowIndex, timeoutMs);
    }
    if (navigated && openSendDocumentAction) {
      sendDocumentAction = await openSendDocument(page, sendDocumentRowIndex, timeoutMs);
    }
    if (navigated && clickPrintAction) {
      printAction = await clickPrint(page, timeoutMs, templateFile);
    }
  }

  const title = await page.title().catch(() => null);
  const html = await page.content().catch(() => null);
  const frames = [];
  for (const frame of page.frames()) {
    const summary = await collectFrameSummary(frame).catch(error => ({ error: error.message }));
    frames.push({
      frameUrl: frame.url(),
      ...summary,
    });
  }

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  if (html) {
    writeFileSync(htmlPath, html);
  }

  const result = {
    capturedAt: new Date().toISOString(),
    homeUrl,
    taskFlowId,
    taskFlowLabel,
    authenticated,
    navigated,
    documentType,
    templateFile,
    filteredByDocumentType,
    viewEditAction,
    sendDocumentAction,
    printAction,
    profileDir,
    title,
    url: page.url(),
    htmlPath,
    jsonPath,
    screenshotPath,
    frames,
  };

  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    htmlPath,
    jsonPath,
    screenshotPath,
    authenticated,
    navigated,
    title,
    url: page.url(),
    frameCount: frames.length,
  }, null, 2));

  await context.close();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});