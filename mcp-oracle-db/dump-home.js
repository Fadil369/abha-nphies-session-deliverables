import { chromium } from "playwright";
(async () => {
    const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage();
    await page.goto("http://oracle-riyadh.brainsait.org/prod/faces/Home");
    if (page.url().includes('Login.jsf')) {
        await page.locator('input[id*="m1:it1::content"]').fill("U36113");
        await page.locator('input[type="password"]').fill("123");
        await page.locator('button:has-text("Sign in")').click();
        await page.waitForNavigation({ waitUntil: "networkidle" });
    }
    await page.waitForTimeout(3000);
    const html = await page.evaluate(() => document.body.innerHTML);
    const fs = require('fs');
    fs.writeFileSync('home.html', html);
    console.log("Dumped to home.html");
    await browser.close();
})();
