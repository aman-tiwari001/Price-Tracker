import puppeteer from 'puppeteer';
import { ILocation } from '../types/schema';
import { generateSignedCoordinate } from '../utils/lat_lngValidator';
import CONSTANTS from '../config/constant';

export const fetchFromSwiggyInstamart = async (query: String, location: ILocation) => {
  try {
    const locationCookie = `lat=${generateSignedCoordinate(parseFloat(location.lat), 'swiggy')}; lng=${generateSignedCoordinate(parseFloat(location.lng), 'swiggy')}; userLocation=${encodeURIComponent(JSON.stringify(location))};`;
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    );

    // Visit Swiggy Instamart search page
    await page.goto(`${CONSTANTS.SWIGGY_INSTAMART_WEB_URL}?query=${query}`, {
      waitUntil: 'networkidle2',
    });

    const result = await page.evaluate(
      async (query, locationCookie) => {
        const response = await fetch(
          `/api/instamart/search?pageNumber=0&searchResultsOffset=0&limit=20&query=${query}&pageType=INSTAMART_AUTO_SUGGEST_PAGE`,
          {
            method: 'POST',
            headers: {
              accept: '*/*',
              'accept-language': 'en-US,en;q=0.9,hi;q=0.8',
              'cache-control': 'no-cache',
              'content-type': 'application/json',
              pragma: 'no-cache',
              priority: 'u=1, i',
              'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-origin',
              'x-build-version': '2.260.0',
              Referer: `https://www.swiggy.com/instamart/search?custom_back=true&query=${query}`,
              'Referrer-Policy': 'strict-origin-when-cross-origin',
              // 'User-Agent':
              //   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
              cookie: locationCookie,
            },
            body: JSON.stringify({ facets: {}, sortAttribute: '' }),
          },
        );
        return await response.json();
      },
      query,
      locationCookie,
    );

    await browser.close();
    return result;
  } catch (error) {
    console.error('Error fetching from Swiggy Instamart:', error);
    return null;
  }
};
