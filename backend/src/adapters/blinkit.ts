import { ILocation } from '../types/schema';

export const fetchFromBlinkit = async (query: string, location: ILocation) => {
  try {
    const response = await fetch(
      `https://blinkit.com/v6/search/products?start=0&size=20&q=${query}`,
      {
        method: 'GET',
        keepalive: true,
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9,hi;q=0.8',
          app_client: 'consumer_web',
          app_version: '52434332',
          'cache-control': 'no-store',
          'content-type': 'application/json',
          lat: location.lat,
          lon: location.lng,
          pragma: 'no-cache',
          priority: 'u=1, i',
          rn_bundle_version: '1009003012',
          'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
          'sec-ch-ua-mobile': '?0',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          web_app_version: '1008010016',
          Referer: 'https://blinkit.com/s/?q=iphone',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error('Error fetching from Blinkit:', error);
    return null;
  }
};
