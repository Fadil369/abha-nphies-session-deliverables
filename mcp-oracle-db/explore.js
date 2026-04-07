import { chromium } from "playwright";
(async () => {
    const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    console.log("Logging in...");
    await page.goto("http://oracle-riyadh.brainsait.org/prod/faces/Home");
    if (page.url().includes('Login.jsf')) {
        await page.locator('input[id*="m1:it1::content"]').fill("U36113");
        await page.locator('input[type="password"]').fill("123");
        await page.locator('button:has-text("Sign in")').click();
        await page.waitForNavigation({ waitUntil: "networkidle" });
    }
    console.log("On Home Page.");
    await page.waitForTimeout(3000);
    const searchBox = page.locator('input[placeholder*="Search"]');
    if (await searchBox.isVisible()) {
        console.log("Found Search Box! Entering text.");
        await searchBox.fill("OIC_NPHIES_CLAIM_REJECTION");
        await searchBox.press("Enter");
        
        console.log("Looking for tab...");
        try {
            await page.locator(`[title="NPHIES Claim Rejection"]`).waitFor({state:'visible', timeout:30000});
            console.log("Tab opened.");
        } catch (e) {
            console.log("Tab not visible directly, searching for title substring...", e.message);
        }
    }
    await page.waitForTimeout(5000); // let UI settle
    const frames = page.frames();
    console.log("Total frames: " + frames.length);
    console.log("Frame URLs:\n" + frames.map(f=>f.url()).join("\n"));

    for (let f of frames) {
       let count = await f.locator('input[placeholder*="Invoice" i]').count();
       if (count > 0) {
           console.log(`Found Invoice input in Frame: ${f.url()}`);
       }
    }
    await browser.close();
})();
