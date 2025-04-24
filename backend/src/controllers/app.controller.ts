import { Request, Response } from 'express';
import { fetchFromBBNow } from '../adapters/bbnow';
import { fetchFromZepto } from '../adapters/zepto';
import { fetchFromBlinkit } from '../adapters/blinkit';
import { fetchFromSwiggyInstamart } from '../adapters/swiggy';
import { extractBBNowProducts } from '../services/bbnowExtractor';
import { extractBlinkitProducts } from '../services/blinkitExtractor';
import { extractZeptoProducts } from '../services/zeptoExtractor';
import { extractSwiggyProducts } from '../services/swiggyExtractor';
import { isValidLatLng } from '../utils/lat_lngValidator';
import { responseHandler } from '../utils/responseHandler';
import redis from '../config/redis';

export const searchProduct = async (req: Request, res: Response) => {
  try {
    const { q, lat, lng } = req.query;

    if (!q || !lat || !lng) {
      return responseHandler(res, 400, false, 'q, lat, lng are required');
    }

    if (!isValidLatLng(lat, lng)) {
      return responseHandler(res, 400, false, 'Invalid lat and lng values');
    }

    const location = { lat: String(lat), lng: String(lng) };
    const queryString = String(q).toLowerCase().trim();

    // Checking for cached data in Redis
    const isLocationCache = await redis.geosearch(
      'locations',
      'FROMLONLAT',
      Number(lng),
      Number(lat),
      'BYRADIUS',
      5000,
      'm',
    );
    const cachedData = await redis.get(`search:${queryString}`);

    if (isLocationCache && cachedData)
      return responseHandler(
        res,
        200,
        true,
        'Products fetched successfully',
        JSON.parse(cachedData),
      );

    const blinkitJsonPromise = fetchFromBlinkit(queryString, location);
    const zeptoJsonPromise = fetchFromZepto(queryString, location);
    const bbNowJsonPromise = fetchFromBBNow(queryString, location);
    const swiggyInstamartPromise = fetchFromSwiggyInstamart(queryString, location);

    const [blinkitJsonRes, zeptoJsonRes, bbNowJsonRes, swiggyInstamartRes] = await Promise.all([
      blinkitJsonPromise,
      zeptoJsonPromise,
      bbNowJsonPromise,
      swiggyInstamartPromise,
    ]);
    
    const blinkit = extractBlinkitProducts(blinkitJsonRes);
    const zepto = extractZeptoProducts(zeptoJsonRes);
    const bbNow = extractBBNowProducts(bbNowJsonRes);
    const swiggyInstamart = extractSwiggyProducts(swiggyInstamartRes);

    // Caching the data in Redis
    await redis.geoadd('locations', Number(lng), Number(lat), queryString);
    await redis.set(
      `search:${queryString}`,
      JSON.stringify({ blinkit, zepto, bbNow, swiggyInstamart }),
      'EX',
      3600,
    );

    return responseHandler(res, 200, true, 'Products fetched successfully', {
      blinkit,
      zepto,
      bbNow,
      swiggyInstamart,
    });
  } catch (error: any) {
    console.error('Error fetching from all three:', error);
    return responseHandler(res, 500, false, 'Failed to fetch data from all three', null);
  }
};
