/**
 * Diagnostic script to test Oracle portal connectivity and menu structure
 */
import { chromium } from "playwright";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const ORACLE_USER = process.env.RIYADH_USER || "U36113";
const ORACLE_PASS = process.env.RIYADH_PASS || "U36113";
const ORACLE_HOME = "http://oracle-riyadh.brainsait.org/prod/faces/Home";
const ORACLE_LOGIN = "http://oracle-riyadh.brainsait.org/prod/faces/Login.jsf";

async function diagnose() {
  console.log("🔍 ORACLE PORTAL DIAGNOSTIC");
  console.log("=".repeat(60));
  console.log(`User: ${ORACLE_USER}`);
  console.log(`Portal: ${ORACLE_HOME}\n`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("▶ Navigating to home page...");
    await page.goto(ORACLE_HOME, { waitUntil: "networkidle", timeout: 30000 });
    console.log("✓ Loaded home page");
    
    const url = page.url();
    console.log(`  Current URL: ${url}`);
    
    if (url.includes("Login.jsf")) {
      console.log("\n▶ On login page, attempting auto-login...");
      const user = await page.locator('input[id="it1::content"], input[placeholder*="user" i]').first();
      const pass = await page.locator('input[type="password"]').first();
      const btn = await page.locator('a#login, a:has-text("Login"), button:has-text("Login")').first();
      
      await user.fill(ORACLE_USER);
      await pass.fill(ORACLE_PASS);
      await btn.click();
      
      await page.waitForTimeout(5000);
      console.log("✓ Submitted login");
    }
    
    console.log("\n▶ Page content check...");
    const content = await page.evaluate(() => ({
      title: document.title,
      hasHamburger: !!document.querySelector('[id="pt1:OasisHedarToolBar:hamburgerBtn"]'),
      menuItemsCount: document.querySelectorAll('.os-treeview-item-text, [title*="CLAIMS"]').length,
      periodInputFound: !!document.querySelector('[id*="periodId"], input[placeholder*="period" i]'),
      bodyHTML: document.body.innerHTML.substring(0, 500)
    }));
    
    console.log(JSON.stringify(content, null, 2));
    
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    console.log("\n▶ Keeping browser open for 15 seconds...");
    await page.waitForTimeout(15000);
    await browser.close();
  }
}

diagnose().catch(console.error);
