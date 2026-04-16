import { chromium } from "playwright";
import { appendFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(PACKAGE_ROOT, ".env") });

const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_PROFILE_DIR = path.join(PACKAGE_ROOT, ".playwright-profile");
const DEFAULT_PROFILE_CLONE_DIR = path.join(PACKAGE_ROOT, "tmp", "trace-runner-profiles");
const DEFAULT_TRACE_DIR = path.join(PACKAGE_ROOT, ".portal-traces");

const BRANCHES = {
  abha: {
    label: "Hayat National Hospital – ABHA",
    protocol: "http",
    cfHost: "oracle-abha.brainsait.org",
    directIp: "172.19.1.1",
    basePath: "/Oasis",
    user: process.env.ABHA_USER ?? process.env.PORTAL_USER ?? "",
    pass: process.env.ABHA_PASS ?? process.env.PORTAL_PASS ?? "",
  },
  riyadh: {
    label: "Al-Hayat National Hospital – Riyadh",
    protocol: "https",
    cfHost: "oracle-riyadh.brainsait.org",
    directIp: "128.1.1.185",
    basePath: "/prod",
    user: process.env.RIYADH_USER ?? process.env.PORTAL_USER ?? "",
    pass: process.env.RIYADH_PASS ?? process.env.PORTAL_PASS ?? "",
  },
  madinah: {
    label: "Hospital – Madinah",
    protocol: "http",
    cfHost: "oracle-madinah.brainsait.org",
    directIp: "172.25.11.26",
    basePath: "/Oasis",
    user: process.env.MADINAH_USER ?? process.env.PORTAL_USER ?? "",
    pass: process.env.MADINAH_PASS ?? process.env.PORTAL_PASS ?? "",
  },
  unaizah: {
    label: "Hospital – Unaizah",
    protocol: "http",
    cfHost: "oracle-unaizah.brainsait.org",
    directIp: "10.0.100.105",
    basePath: "/prod",
    user: process.env.UNAIZAH_USER ?? process.env.PORTAL_USER ?? "",
    pass: process.env.UNAIZAH_PASS ?? process.env.PORTAL_PASS ?? "",
  },
  khamis: {
    label: "Hospital – Khamis",
    protocol: "http",
    cfHost: "oracle-khamis.brainsait.org",
    directIp: "172.30.0.77",
    basePath: "/prod",
    user: process.env.KHAMIS_USER ?? process.env.PORTAL_USER ?? "",
    pass: process.env.KHAMIS_PASS ?? process.env.PORTAL_PASS ?? "",
  },
  jizan: {
    label: "Hospital – Jizan",
    protocol: "http",
    cfHost: "oracle-jizan.brainsait.org",
    directIp: "172.17.4.84",
    basePath: "/prod",
    user: process.env.JIZAN_USER ?? process.env.PORTAL_USER ?? "",
    pass: process.env.JIZAN_PASS ?? process.env.PORTAL_PASS ?? "",
  },
};

const SEARCH_BOX_SELECTORS = [
  'input[placeholder*="Search Work Entities" i]',
  'input[placeholder*="Search Work Entities"]',
  'input[id*="wrk_ent_srch"]',
  'input[placeholder*="Search Tasks" i]',
  'input[placeholder*="Search..." i]',
  'input[id="pt1:r1:0:os-mainmenu-search::content"]',
];

const CLAIMS_SELECTORS = {
  period: '[id="pt1:contrRg:0:CntRgn:4:ptClaimsSub:pt_or6:pt_oc1:pt_or1:pt_oc2:or4:oc10:oc11:or23:oc6:ff2:fi3:periodId::content"]',
  claimsTab: 'button:has-text("Claims Submission")',
};

const DOCUMENT_RETRIEVAL_DEFAULTS = {
  taskFlowId: "MANAGEDOCUMENTPANEL",
  taskFlowLabel: "Documents Panel",
  documentType: "Medical Report",
  templateFile: "C:\\trans\\MEDREP.docx",
  viewEditRowIndex: 0,
};

const SCENARIOS = {
  home: {
    description: "Portal home or login page with manual navigation",
  },
  "claims-submission": {
    description: "Claims Submission workflow landing page",
    prepare: async page => navigateToClaimsSubmission(page),
  },
  "claim-search": {
    description: "Manage Claims task-flow",
    taskFlow: "MANAGECLAIMS",
  },
  "document-retrieval": {
    description: "Documents Panel medical-report print workflow with popup capture",
    prepare: async page => prepareDocumentRetrieval(page),
  },
  approvals: {
    description: "Manage Approvals task-flow",
    taskFlow: "MANAGEAPPROVALSTF",
  },
  "patient-search": {
    description: "Patient Search task-flow",
    taskFlow: "PATIENTSEARCHTF",
  },
};

const args = parseArgs(process.argv.slice(2));
const branchKey = args.branch ?? "riyadh";
const branch = BRANCHES[branchKey];

if (!branch) {
  throw new Error(`Unknown branch \"${branchKey}\". Known branches: ${Object.keys(BRANCHES).join(", ")}`);
}

const scenarioName = args.scenario ?? "home";
const scenario = SCENARIOS[scenarioName];

if (!scenario) {
  throw new Error(`Unknown scenario \"${scenarioName}\". Known scenarios: ${Object.keys(SCENARIOS).join(", ")}`);
}

const runId = buildRunId(branchKey, scenarioName, args.label);
const traceRoot = path.resolve(PACKAGE_ROOT, process.env.PORTAL_TRACE_DIR || DEFAULT_TRACE_DIR);
const traceDir = path.join(traceRoot, runId);
const downloadDir = path.join(traceDir, "downloads");
const stepsPath = path.join(traceDir, "steps.jsonl");
const networkPath = path.join(traceDir, "network.jsonl");
const metadataPath = path.join(traceDir, "metadata.json");
const harPath = path.join(traceDir, "session.har");
const traceZipPath = path.join(traceDir, "playwright-trace.zip");
const initialShotPath = path.join(traceDir, "initial.png");
const finalShotPath = path.join(traceDir, "final.png");
const useDirectIp = args["use-direct-ip"] || process.env.USE_DIRECT_IP === "true";

mkdirSync(traceDir, { recursive: true });
mkdirSync(downloadDir, { recursive: true });

const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;
const liveProfileDir = path.resolve(PACKAGE_ROOT, process.env.ORACLE_PROFILE_DIR || DEFAULT_PROFILE_DIR);
const cloneProfile = coerceBoolean(args["clone-profile"], true);
const profileCloneRoot = path.resolve(PACKAGE_ROOT, args["profile-clone-dir"] || DEFAULT_PROFILE_CLONE_DIR);
const profileDir = cloneProfile ? cloneProfileDir(liveProfileDir, profileCloneRoot) : liveProfileDir;
const timeoutMs = parseInt(process.env.TIMEOUT_MS || "30000", 10);
const durationMs = args["duration-ms"] ? parseInt(args["duration-ms"], 10) : null;
const taskFlowOverride = args["task-flow"] ?? null;
const headless = coerceBoolean(args.headless, false);

const loginUrl = `${branch.protocol}://${useDirectIp ? branch.directIp : branch.cfHost}${branch.basePath}/faces/Login.jsf`;
const homeUrl = `${branch.protocol}://${useDirectIp ? branch.directIp : branch.cfHost}${branch.basePath}/faces/Home`;

const metadata = {
  startedAt: new Date().toISOString(),
  runId,
  branch: branchKey,
  branchLabel: branch.label,
  scenario: scenarioName,
  scenarioDescription: scenario.description,
  useDirectIp,
  homeUrl,
  loginUrl,
  chromePath,
  liveProfileDir,
  profileDir,
  cloneProfile,
  traceDir,
  taskFlow: taskFlowOverride ?? scenario.taskFlow ?? null,
};

writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

function installStepRecorder(bindingName) {
  const recorderFlag = "__portalTraceRecorderInstalled";
  if (window[recorderFlag]) {
    return;
  }

  const safeText = value => (value || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const describeElement = target => {
    const element = target instanceof Element
      ? target.closest('button, a, input, select, textarea, [role="button"], [role="link"], label, td, th, div, span') || target
      : null;

    if (!element) {
      return { tag: "unknown" };
    }

    const type = element.getAttribute("type") || "";
    const redacted = /pass|secret|token/i.test(type) || /pass|secret|token/i.test(element.id || "") || /pass|secret|token/i.test(element.getAttribute("name") || "");
    const rawValue = "value" in element ? String(element.value || "") : "";

    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      name: element.getAttribute("name") || undefined,
      role: element.getAttribute("role") || undefined,
      type: type || undefined,
      placeholder: element.getAttribute("placeholder") || undefined,
      title: element.getAttribute("title") || undefined,
      href: element.getAttribute("href") || undefined,
      text: safeText(element.textContent),
      value: rawValue ? (redacted ? "[redacted]" : safeText(rawValue)) : undefined,
    };
  };

  const emit = (eventType, target, extra = {}) => {
    const binding = window[bindingName];
    if (typeof binding !== "function") {
      return;
    }
    binding({
      eventType,
      title: document.title,
      url: location.href,
      element: describeElement(target),
      ...extra,
    });
  };

  document.addEventListener("click", event => emit("click", event.target), true);
  document.addEventListener("change", event => emit("change", event.target), true);
  document.addEventListener("submit", event => emit("submit", event.target), true);
  document.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      emit("enter", event.target);
    }
  }, true);

  window[recorderFlag] = true;
}

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

function buildRunId(branchName, activeScenario, label) {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  return [stamp, branchName, activeScenario, label ? sanitizeSegment(label) : null]
    .filter(Boolean)
    .join("-");
}

function buildStamp() {
  return new Date().toISOString().replace(/[.:]/g, "-");
}

function sanitizeSegment(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
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

function appendJsonl(filePath, payload) {
  appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
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

function safeFrameUrl(request) {
  try {
    return request.frame()?.url() ?? null;
  } catch {
    return null;
  }
}

function redactHeaders(headers) {
  const redacted = {};
  for (const [key, value] of Object.entries(headers || {})) {
    redacted[key] = /authorization|cookie|set-cookie|x-api-key/i.test(key) ? "[redacted]" : value;
  }
  return redacted;
}

function redactText(value) {
  if (!value) {
    return value;
  }

  return String(value)
    .replace(/("password"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3')
    .replace(/("token"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3')
    .replace(/(Authorization:\s*)([^\r\n]+)/gi, '$1[redacted]')
    .slice(0, 4000);
}

async function attachPage(page) {
  const bindingName = "__portalTraceEvent";

  if (!page.__traceBindingRegistered) {
    await page.exposeBinding(bindingName, async (source, payload) => {
      appendJsonl(stepsPath, {
        at: new Date().toISOString(),
        pageUrl: source.page?.url() ?? payload?.url ?? null,
        ...payload,
      });
    }).catch(() => {});
    page.__traceBindingRegistered = true;
  }

  await page.addInitScript(installStepRecorder, bindingName).catch(() => {});
  await page.evaluate(installStepRecorder, bindingName).catch(() => {});

  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) {
      appendJsonl(stepsPath, {
        at: new Date().toISOString(),
        eventType: "navigate",
        title: page.url(),
        url: frame.url(),
      });
    }
  });

  page.on("download", async download => {
    const targetPath = path.join(downloadDir, sanitizeSegment(download.suggestedFilename() || `download-${Date.now()}`));
    try {
      await download.saveAs(targetPath);
      appendJsonl(stepsPath, {
        at: new Date().toISOString(),
        eventType: "download",
        url: page.url(),
        file: targetPath,
        suggestedFilename: download.suggestedFilename(),
      });
    } catch (error) {
      appendJsonl(stepsPath, {
        at: new Date().toISOString(),
        eventType: "download-error",
        url: page.url(),
        suggestedFilename: download.suggestedFilename(),
        error: error.message,
      });
    }
  });
}

async function attachNetworkLogging(context) {
  const requestIds = new WeakMap();

  context.on("request", request => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    requestIds.set(request, requestId);
    appendJsonl(networkPath, {
      at: new Date().toISOString(),
      eventType: "request",
      requestId,
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      headers: redactHeaders(request.headers()),
      postDataPreview: redactText(request.postData()),
      frameUrl: safeFrameUrl(request),
    });
  });

  context.on("requestfailed", request => {
    appendJsonl(networkPath, {
      at: new Date().toISOString(),
      eventType: "requestfailed",
      requestId: requestIds.get(request) ?? null,
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });

  context.on("response", async response => {
    const request = response.request();
    const contentType = response.headers()["content-type"] ?? "";
    let bodyPreview = null;

    if (["document", "xhr", "fetch"].includes(request.resourceType()) && /json|xml|text|html/i.test(contentType)) {
      bodyPreview = redactText(await response.text().catch(() => null));
    }

    appendJsonl(networkPath, {
      at: new Date().toISOString(),
      eventType: "response",
      requestId: requestIds.get(request) ?? null,
      method: request.method(),
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      resourceType: request.resourceType(),
      headers: redactHeaders(response.headers()),
      bodyPreview,
    });
  });
}

async function tryPortalLogin(page, config) {
  const userField = page.locator('[placeholder*="user" i], input[name*="user" i], input[id*="user" i]').first();
  const passField = page.locator('[placeholder*="pass" i], input[type="password"], input[name*="pass" i]').first();
  const loginButton = page.locator('a:has-text("Login"), button:has-text("Login"), button:has-text("Sign in")').first();

  if (!(await userField.isVisible({ timeout: 3000 }).catch(() => false))) {
    return !page.url().includes("Login.jsf");
  }

  if (!config.user || !config.pass) {
    return false;
  }

  await userField.fill(config.user).catch(() => {});
  await passField.fill(config.pass).catch(() => {});

  if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginButton.click().catch(() => {});
  } else {
    await passField.press("Enter").catch(() => {});
  }

  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await dismissPreviousSessionDialog(page);

  return !page.url().includes("Login.jsf");
}

async function dismissPreviousSessionDialog(page) {
  const dialog = page.locator('text=Previous session').first();
  if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
    const okButton = page.locator('button:has-text("Yes"), a:has-text("Yes"), button:has-text("OK"), a:has-text("OK")').first();
    await okButton.click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  }
}

async function waitForManualLogin(page) {
  console.log("\nTrace is running. Complete login or grant portal access in the browser, then press ENTER here to continue.");
  await new Promise(resolve => process.stdin.once("data", resolve));
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await dismissPreviousSessionDialog(page);
}

async function openMainMenu(page) {
  const hamburger = page.locator('[id="pt1:OasisHedarToolBar:hamburgerBtn"]').first();
  if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
    await hamburger.click().catch(() => {});
    await page.waitForTimeout(800);
  }
}

async function navigateToTaskFlow(page, taskFlowId, taskFlowLabel = null) {
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

      if (!taskFlowLabel) {
        return true;
      }

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

  if (!taskFlowLabel) {
    return true;
  }

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
        return title === activeTaskFlowId || (activeTaskFlowLabel && text.includes(activeTaskFlowLabel));
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

  if (!taskFlowLabel) {
    return domClicked;
  }

  return await page.getByText(taskFlowLabel, { exact: false }).first().isVisible({ timeout: 1500 }).catch(() => false);
}

async function navigateToClaimsSubmission(page) {
  const periodInput = page.locator(CLAIMS_SELECTORS.period).first();
  if (await periodInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    return true;
  }

  const searchNavigated = await navigateToTaskFlow(page, "CLAIMSSUBMISSIONTF", "Claims Submission");
  if (searchNavigated && await periodInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    return true;
  }

  const claimsTab = page.locator(CLAIMS_SELECTORS.claimsTab).first();
  if (await claimsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await claimsTab.click().catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
    return await periodInput.isVisible({ timeout: 5000 }).catch(() => false);
  }

  await page.evaluate(() => {
    window.OasisMenuUtil?.navigateTo?.("CLAIMSSUBMISSIONTF");
    window.MainMenuUtils?.navigateTo?.("CLAIMSSUBMISSIONTF");
  }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);

  return await periodInput.isVisible({ timeout: 5000 }).catch(() => false);
}

async function selectDocumentType(page, documentType) {
  const documentTypeSelect = page.locator('select[id*="soc1::content"], select').first();
  if (!(await documentTypeSelect.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false;
  }

  await documentTypeSelect.selectOption({ label: documentType }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);
  return true;
}

async function clickGridRowAction(page, selector, rowIndex) {
  const action = page.locator(selector).nth(rowIndex);
  if (!(await action.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { clicked: false };
  }

  const row = action.locator('xpath=ancestor::tr').first();
  if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
    await row.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  await action.click({ force: true }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);
  return { clicked: true };
}

async function openViewEdit(page, rowIndex) {
  return clickGridRowAction(page, 'div[id$=":obt1:b5"] a[role="button"]', rowIndex);
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

async function clickDocumentAction(page, label) {
  const action = await findEnabledAction(page, label);
  if (!action) {
    return { clicked: false, download: null, popup: false, popupUrl: null, activePage: null };
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
  await action.click().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(2000);

  const [download, popup] = await Promise.all([downloadPromise, popupPromise]);
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
    await popup.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
    await popup.bringToFront().catch(() => {});
  }

  return {
    clicked: true,
    download: download ? { suggestedFilename: download.suggestedFilename() } : null,
    popup: Boolean(popup),
    popupUrl: popup?.url() ?? null,
    activePage: popup ?? null,
  };
}

async function clickTemplateFile(page, templateFile, fileIndex = 0) {
  const links = page.locator('a[id$="tmp_lnk"]');
  const count = await links.count().catch(() => 0);
  if (count <= fileIndex) {
    return { clicked: false, text: null, download: null, popup: false, popupUrl: null, activePage: null };
  }

  let link = templateFile ? links.filter({ hasText: templateFile }).first() : links.nth(fileIndex);
  const preferredVisible = await link.isVisible({ timeout: 1500 }).catch(() => false);
  if (!preferredVisible) {
    link = links.nth(fileIndex);
  }

  if (!(await link.isVisible({ timeout: 3000 }).catch(() => false))) {
    return { clicked: false, text: null, download: null, popup: false, popupUrl: null, activePage: null };
  }

  const text = await link.innerText().catch(() => null);
  const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
  await link.click().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(2000);

  const [download, popup] = await Promise.all([downloadPromise, popupPromise]);
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
    await popup.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
    await popup.bringToFront().catch(() => {});
  }

  return {
    clicked: true,
    text,
    download: download ? { suggestedFilename: download.suggestedFilename() } : null,
    popup: Boolean(popup),
    popupUrl: popup?.url() ?? null,
    activePage: popup ?? null,
  };
}

async function clickPrint(page, templateFile) {
  const templateLinksVisible = await page.locator('a[id$="tmp_lnk"]').first().isVisible({ timeout: 1000 }).catch(() => false);
  if (templateLinksVisible) {
    const templateFileAction = await clickTemplateFile(page, templateFile);
    const finalPrintAction = await clickDocumentAction(page, "Print");
    return {
      ...finalPrintAction,
      previewAction: null,
      templateFileAction,
      initialPrintAction: null,
      activePage: finalPrintAction.activePage ?? templateFileAction.activePage ?? null,
    };
  }

  const initialPrintAction = await clickDocumentAction(page, "Print");
  if (initialPrintAction.clicked) {
    const templateFileAction = await clickTemplateFile(page, templateFile);
    const finalPrintAction = await clickDocumentAction(page, "Print");
    return {
      ...finalPrintAction,
      previewAction: null,
      templateFileAction,
      initialPrintAction,
      activePage: finalPrintAction.activePage ?? initialPrintAction.activePage ?? templateFileAction.activePage ?? null,
    };
  }

  const previewAction = await clickDocumentAction(page, "Preview");
  if (!previewAction.clicked) {
    return { clicked: false, download: null, popup: false, popupUrl: null, previewAction, templateFileAction: null, initialPrintAction, activePage: null };
  }

  const templateFileAction = await clickTemplateFile(page, templateFile);
  const retriedPrintAction = await clickDocumentAction(page, "Print");
  return {
    ...retriedPrintAction,
    previewAction,
    templateFileAction,
    initialPrintAction,
    activePage: retriedPrintAction.activePage ?? previewAction.activePage ?? templateFileAction.activePage ?? null,
  };
}

function serializeActionResult(action) {
  if (!action || typeof action !== "object") {
    return action;
  }

  const { activePage, previewAction, templateFileAction, initialPrintAction, ...rest } = action;
  return {
    ...rest,
    previewAction: serializeActionResult(previewAction),
    templateFileAction: serializeActionResult(templateFileAction),
    initialPrintAction: serializeActionResult(initialPrintAction),
  };
}

async function prepareDocumentRetrieval(page) {
  const navigated = await navigateToTaskFlow(page, DOCUMENT_RETRIEVAL_DEFAULTS.taskFlowId);
  if (!navigated) {
    throw new Error(`Unable to open ${DOCUMENT_RETRIEVAL_DEFAULTS.taskFlowId}`);
  }

  await page.waitForTimeout(2500);

  const filteredByDocumentType = await selectDocumentType(page, DOCUMENT_RETRIEVAL_DEFAULTS.documentType);
  if (!filteredByDocumentType) {
    throw new Error(`Unable to filter document type to ${DOCUMENT_RETRIEVAL_DEFAULTS.documentType}`);
  }

  const viewEditAction = await openViewEdit(page, DOCUMENT_RETRIEVAL_DEFAULTS.viewEditRowIndex);
  if (!viewEditAction.clicked) {
    throw new Error("Unable to open the first Medical Report row with View / Edit");
  }

  const printAction = await clickPrint(page, DOCUMENT_RETRIEVAL_DEFAULTS.templateFile);
  if (!printAction.initialPrintAction?.clicked || !printAction.templateFileAction?.clicked || !printAction.clicked) {
    throw new Error(`Document print sequence did not complete for ${DOCUMENT_RETRIEVAL_DEFAULTS.templateFile}`);
  }

  return {
    page: printAction.activePage ?? page,
    details: {
      taskFlowId: DOCUMENT_RETRIEVAL_DEFAULTS.taskFlowId,
      taskFlowLabel: DOCUMENT_RETRIEVAL_DEFAULTS.taskFlowLabel,
      documentType: DOCUMENT_RETRIEVAL_DEFAULTS.documentType,
      templateFile: DOCUMENT_RETRIEVAL_DEFAULTS.templateFile,
      filteredByDocumentType,
      viewEditAction: serializeActionResult(viewEditAction),
      printAction: serializeActionResult(printAction),
    },
  };
}

async function prepareScenario(page) {
  const taskFlow = taskFlowOverride ?? scenario.taskFlow;
  if (scenario.prepare) {
    return await scenario.prepare(page);
  }
  if (taskFlow) {
    await navigateToTaskFlow(page, taskFlow);
  }

  return { page };
}

async function main() {
  if (!existsSync(liveProfileDir)) {
    mkdirSync(liveProfileDir, { recursive: true });
  }

  console.log(`Portal trace run: ${runId}`);
  console.log(`Branch:           ${branchKey} (${branch.label})`);
  console.log(`Scenario:         ${scenarioName}`);
  console.log(`Trace folder:     ${traceDir}`);
  console.log(`Browser:          ${chromePath}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    executablePath: chromePath,
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
    recordHar: {
      path: harPath,
      content: "embed",
      mode: "full",
    },
    args: ["--ignore-certificate-errors"],
  });

  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await attachNetworkLogging(context);

  context.on("page", page => {
    attachPage(page).catch(error => {
      appendJsonl(stepsPath, {
        at: new Date().toISOString(),
        eventType: "attach-page-error",
        error: error.message,
      });
    });
  });

  for (const existingPage of context.pages()) {
    await attachPage(existingPage);
  }

  const page = context.pages()[0] ?? await context.newPage();
  let activePage = page;
  await attachPage(page);
  await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  await page.screenshot({ path: initialShotPath, fullPage: true }).catch(() => {});

  let authenticated = !page.url().includes("Login.jsf");
  if (!authenticated) {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
    authenticated = await tryPortalLogin(page, branch);
  }

  if (!authenticated && !durationMs) {
    await waitForManualLogin(page);
    authenticated = !page.url().includes("Login.jsf");
  }

  if (authenticated) {
    const prepared = await prepareScenario(page).catch(error => {
      appendJsonl(stepsPath, {
        at: new Date().toISOString(),
        eventType: "scenario-prepare-error",
        scenario: scenarioName,
        error: error.message,
      });
      return null;
    });

    if (prepared?.page) {
      activePage = prepared.page;
    }
    if (prepared?.details) {
      metadata.scenarioDetails = prepared.details;
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    }
  }

  console.log("Trace is active.");
  if (durationMs) {
    console.log(`Auto-stop:        ${durationMs}ms`);
    await activePage.waitForTimeout(durationMs);
  } else {
    console.log("Perform your portal steps now. Press ENTER in this terminal when you want to stop and save the trace.");
    await new Promise(resolve => process.stdin.once("data", resolve));
  }

  metadata.finishedAt = new Date().toISOString();
  metadata.finalUrl = activePage.url();
  metadata.authenticated = !activePage.url().includes("Login.jsf");
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  await activePage.screenshot({ path: finalShotPath, fullPage: true }).catch(() => {});
  await context.tracing.stop({ path: traceZipPath });
  await context.close();

  console.log("Saved trace artifacts:");
  console.log(`  ${metadataPath}`);
  console.log(`  ${traceZipPath}`);
  console.log(`  ${harPath}`);
  console.log(`  ${stepsPath}`);
  console.log(`  ${networkPath}`);
  console.log(`  ${downloadDir}`);
}

main().catch(error => {
  appendJsonl(networkPath, {
    at: new Date().toISOString(),
    eventType: "fatal",
    error: error.message,
    stack: error.stack,
  });
  console.error(error);
  process.exitCode = 1;
});