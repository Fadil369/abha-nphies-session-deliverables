import { chromium } from "playwright";
import { writeFileSync } from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const ORACLE_USER = process.env.RIYADH_USER || "U36113";
const ORACLE_PASS = process.env.RIYADH_PASS || "U36113";
const ORACLE_LOGIN = "http://oracle-riyadh.brainsait.org/prod/faces/Login.jsf";
const ORACLE_HOME = "http://oracle-riyadh.brainsait.org/prod/faces/Home";

async function inspect() {
  console.log("🔍 Inspecting Oracle menu structure...\n");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Login
    console.log("→ Navigating to login...");
    await page.goto(ORACLE_LOGIN, { waitUntil: "networkidle", timeout: 30000 });
    
    console.log("→ Submitting credentials...");
    await page.fill('input[id="it1::content"]', ORACLE_USER);
    await page.fill('input[type="password"]', ORACLE_PASS);
    await page.click('a#login, a:has-text("Login"), button:has-text("Login")');
    
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log("✓ Logged in\n");
    
    // Inspect menu structure
    console.log("→ Extracting menu structure...\n");
    const menuInfo = await page.evaluate(() => {
      const info = {
        currentUrl: window.location.href,
        title: document.title,
        hamburgerBtn: null,
        menuItems: [],
        periodInput: null,
        allButtons: [],
        allLinks: [],
        menuContainers: []
      };
      
      // Hamburger button
      const ham = document.querySelector('[id="pt1:OasisHedarToolBar:hamburgerBtn"]');
      if (ham) {
        info.hamburgerBtn = {
          found: true,
          visible: ham.offsetWidth > 0,
          id: ham.id,
          className: ham.className,
          innerHTML: ham.innerHTML.substring(0, 100)
        };
      }
      
      // Menu items with Claims in text
      const items = Array.from(document.querySelectorAll('[title], .os-treeview-item-text, .os-treeview-item, [role="menuitem"]'));
      items.forEach((el, idx) => {
        const text = el.textContent?.trim() || '';
        const title = el.getAttribute?.('title') || '';
        if (text.includes('Claims') || title.includes('Claims') || text.includes('Submission') || title.includes('Submission')) {
          info.menuItems.push({
            idx,
            tag: el.tagName,
            text: text.substring(0, 50),
            title,
            id: el.id,
            className: el.className,
            visible: el.offsetWidth > 0
          });
        }
      });
      
      // Period input (indicates Claims Submission view)
      const period = document.querySelector('[id*="periodId"]');
      if (period) {
        info.periodInput = {
          found: true,
          id: period.id,
          visible: period.offsetWidth > 0
        };
      }
      
      // All buttons with text
      document.querySelectorAll('button, a[role="button"]').forEach((btn, idx) => {
        const text = btn.textContent?.trim() || '';
        if (text && (text.includes('Claims') || text.includes('Submission') || text.includes('Menu') || text.length < 30)) {
          info.allButtons.push({
            idx,
            tag: btn.tagName,
            text: text.substring(0, 40),
            id: btn.id,
            className: btn.className.substring(0, 50),
            visible: btn.offsetWidth > 0
          });
        }
      });
      
      // Menu containers
      document.querySelectorAll('[id*="menu"], [class*="menu"], .os-treeview, [role="navigation"]').forEach(m => {
        if (m.offsetWidth > 0) {
          info.menuContainers.push({
            tag: m.tagName,
            id: m.id,
            className: m.className.substring(0, 60),
            childCount: m.children.length
          });
        }
      });
      
      return info;
    });
    
    console.log(JSON.stringify(menuInfo, null, 2));
    
    // Save to file
    writeFileSync('/tmp/oracle_menu_inspect.json', JSON.stringify(menuInfo, null, 2));
    console.log("\n✓ Saved to /tmp/oracle_menu_inspect.json");
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/oracle_login_state.png' });
    console.log("✓ Saved screenshot to /tmp/oracle_login_state.png");
    
    // Try clicking hamburger
    console.log("\n→ Attempting to click hamburger menu...");
    const ham = page.locator('[id="pt1:OasisHedarToolBar:hamburgerBtn"]');
    if (await ham.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ham.click();
      await page.waitForTimeout(2000);
      console.log("✓ Clicked hamburger");
      
      // Get updated menu
      const afterClick = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.os-treeview-item-text, [title*="Claims"], [title*="Submission"]').forEach(el => {
          const text = el.textContent?.trim() || '';
          const title = el.getAttribute?.('title') || '';
          if (text || title) {
            items.push({
              text: text.substring(0, 50),
              title,
              id: el.id,
              visible: el.offsetWidth > 0
            });
          }
        });
        return items;
      });
      
      console.log("\nMenu items after hamburger click:");
      console.log(JSON.stringify(afterClick, null, 2));
      
      // Take screenshot after click
      await page.screenshot({ path: '/tmp/oracle_menu_open.png' });
      console.log("\n✓ Saved menu screenshot to /tmp/oracle_menu_open.png");
    }
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

inspect().catch(console.error);
