import { ILocation } from '../types/schema';

export const fetchFromSwiggyInstamart = async (query: String, location: ILocation) => {
  try {
    const userLocation = encodeURIComponent(
      JSON.stringify({
        lat: location.lat,
        lng: location.lng,
      }),
    );

    const response = await fetch(
      `https://www.swiggy.com/api/instamart/search?query=${query}&pageType=INSTAMART_AUTO_SUGGEST_PAGE`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-cache',
          origin: 'https://www.swiggy.com',
          pragma: 'no-cache',
          priority: 'u=1, i',
          referer: `https://www.swiggy.com/instamart/search?custom_back=true&query=${query}`,
          'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
          'sec-ch-ua-mobile': '?0',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          Cookie: `userLocation=${userLocation};`,
        },
        body: JSON.stringify({ facets: {}, sortAttribute: '' }),
      },
    );
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching from Swiggy Instamart:', error);
    return null;
  }
};
