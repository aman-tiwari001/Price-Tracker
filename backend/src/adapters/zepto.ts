import puppeteer, { Page } from 'puppeteer';
import CONSTANTS from '../config/constant';
import { ILocation } from '../types/schema';
import fs from 'fs';

async function autoScroll(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 1000;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

export const fetchFromZepto = async (query: string, address: string) => {
  const url1 = `https://www.zeptonow.com/`;
  const url2 = `https://www.zeptonow.com/search?query=${query}`;

  // Launch browser with proxy
  const browser = await puppeteer.launch({
    headless: true,
  });

  const page = await browser.newPage();
  // await page.setUserAgent(
  // 	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  // );
  // await page.setViewport({ width: 1280, height: 800 });
  // await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  await page.goto(url1, { waitUntil: 'networkidle2' });

  console.log('\nFetching HTML page from\n', url1);

  // Click on address selection button
  await page.click('[data-testid="user-address"]');
  // Wait for the address input to be visible
  await page.waitForSelector('input[placeholder="Search a new address"][type="text"]', {
    visible: true,
  });
  // Input the address in the search box
  await page.type('input[placeholder="Search a new address"][type="text"]', address);
  // Wait for the address suggestions to appear
  await page.waitForSelector('[data-testid="address-search-item"]', { visible: true });
  // Click on the first address suggestion
  await page.click('[data-testid="address-search-item"]');
  // Wait for the location confirmation button to be visible
  await page.waitForSelector('[data-testid="location-confirm-btn"][type="button"]', {
    visible: true,
  });
  // Click on the confirm button to set the location
  await page.click('[data-testid="location-confirm-btn"][type="button"]');

  await page.goto(url2, { waitUntil: 'networkidle2' });

  console.log('\nFetching HTML page from\n', url2);

  // Fetch the content of the page
  let productData = await page.content();

  await browser.close();

  productData = productData.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  const directory = 'scraped_pages/';

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(`${directory}zepto.html`, productData, 'utf8');

  return productData;
};
