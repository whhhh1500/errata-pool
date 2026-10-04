// Browser end-to-end run against the live Studio contract (burner account from the Studio faucet).
// usage: npm run build && npx vite preview frontend --port 4173 & ; npm i --no-save puppeteer-core && node scripts/e2e-browser.mjs
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--window-size=1300,2400"] });
const page = await browser.newPage();
await page.setViewport({ width: 1300, height: 2400 });
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto(process.env.APP_URL || "http://localhost:4173/errata-pool/", { waitUntil: "networkidle0" });
const logText = async () => page.$$eval("#log li", (ls) => ls.map((l) => l.textContent));
const waitLog = async (re, ms = 400000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const l = await logText(); const hit = l.find((x) => re.test(x)); if (hit) return hit; await new Promise((r) => setTimeout(r, 3000)); }
  throw new Error("timeout " + re);
};
await page.click("#acct button.primary");
await page.waitForFunction(() => document.querySelector("#acct .pill"), { timeout: 60000 });
console.log("acct:", await page.$eval("#acct", (e) => e.textContent));
// 1) invalid payable call: bad item id -> refused and refunded
await page.type("#f-item", "0");
await page.click("#preview-btn");
await page.waitForFunction(() => document.querySelector("#preview").textContent.includes("Question"), { timeout: 30000 });
console.log("preview:", await page.$eval("#preview", (e) => e.textContent));
await page.$eval("#f-choice", (e) => (e.value = "C"));
await page.type("#f-fix", "Answer key should be C) 10");
await page.type("#f-why", "Over a dozen human polyomaviruses are known today (BK, JC, MCPyV, TSPyV, HPyV6, 7, 9, 10, 12, NJPyV, LIPyV...), so '100' is wrong; '10' is the closest order of magnitude and matches the source textbook.");
await page.type("#f-ev", "https://en.wikipedia.org/wiki/Polyomaviridae");
await page.click("#file-form button[type=submit]");
console.log(await waitLog(/file_report item 0: .*(ok|refused|reverted)/));
await page.waitForFunction(() => document.querySelector("#report h3"), { timeout: 60000 });
await page.evaluate(() => [...document.querySelectorAll("#report button")].find((b) => b.textContent.startsWith("Adjudicate"))?.click());
console.log(await waitLog(/adjudicate #\d+: .*(ok|reverted)/));
await new Promise((r) => setTimeout(r, 4000));
console.log("report:", (await page.$eval("#report", (e) => e.innerText)).slice(0, 1500));
await page.screenshot({ path: new URL("../media/e2e.png", import.meta.url).pathname, fullPage: false });
console.log("LOG", JSON.stringify(await logText(), null, 1));
await browser.close();
