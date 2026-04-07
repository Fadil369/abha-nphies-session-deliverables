import fs from 'fs';
import { chromium } from 'playwright';

(async () => {
    // 1. Identify context
    const mappingPath = 'artifacts/txn_invoice_mapping.json';
    const dataPath = 'artifacts/rajhi_portal_data.json';
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    const appealData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const alreadySubmitted = ["6629418", "6629428"];

    // Use specific targets
    const targets = appealData.filter(d => !alreadySubmitted.includes(d.InvoiceNo)).slice(0, 5);

    // Setup browser (connect to existing or new)
    const browser = await chromium.launch({ 
        headless: false,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Portal Login (Assuming session from previous conversation)
    await page.goto('http://oracle-riyadh.brainsait.org/prod/faces/Home');
    
    // Wait for the user to manually log in if redirected to login page
    if (page.url().includes('Login.jsf')) {
        console.log("Please log in manually in the open Chrome window. The script will wait until you navigate away from the login page...");
        while (page.url().includes('Login.jsf')) {
            await page.waitForTimeout(2000);
        }
        console.log("Login detected! Proceeding with appeals...");
        await page.waitForTimeout(5000); // Wait for the Home dashboard to fully load
    }
    
    for (const target of targets) {
        console.log(`Processing ${target.InvoiceNo}...`);
        try {
            // Search Logic
            await page.fill('input[placeholder="Invoice"]', target.InvoiceNo);
            await page.click('[id$="ff1:fi4:b13"]');
            await page.waitForTimeout(5000);

            // Dropdown & Menu
            await page.click('[id*="oc2457:or8:oc19:b2::popEl"]');
            await page.waitForTimeout(2000);
            await page.click('text=Send Communication');
            await page.waitForTimeout(6000);

            // Iframe Handlers
            const frame = page.frames().find(f => f.url().includes('adf.dialog-request'));
            if (frame) {
                // Initial Send to trigger Error 14185/Info area
                try {
                    await frame.click('text=Send Communication', { timeout: 3000 });
                    await page.waitForTimeout(3000);
                    await frame.click('text=OK', { timeout: 2000 });
                } catch (e) {}

                // Check "Info"
                await frame.click('input[id*="j_idt13:_0"]');
                await frame.fill('textarea[id*="it3::content"]', target.Content);
                
                // Final Send
                await frame.click('text=Send Communication');
                await page.waitForTimeout(5000);
                
                // Final OK
                await frame.click('text=OK', { timeout: 3000 });
                console.log(`Successfully submitted ${target.InvoiceNo}`);
            }
        } catch (err) {
            console.error(`Failed ${target.InvoiceNo}: ${err.message}`);
        }
    }
    await browser.close();
})();
