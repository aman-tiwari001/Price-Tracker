import { ILocation } from '../types/schema';

export const fetchFromZepto = async (query: string, location: ILocation) => {
  try {
    const response1 = await fetch(
      `https://api.zeptonow.com/api/v2/get_page?latitude=${location.lat}&longitude=${location.lng}&page_type=HOME&version=v2`,
      {
        method: 'GET',
        headers: {
          app_version: '12.56.2',
          platform: 'web',
        },
      },
    );
    
    const storeId = (await response1.json()).storeServiceableResponse.storeId;

    const response2 = await fetch('https://api.zeptonow.com/api/v3/search', {
      method: 'POST',
      headers: {
        appversion: '12.56.2',
        platform: 'WEB',
        storeid: storeId,
      },
      body: JSON.stringify({
        query,
        pageNumber: 0,
        intentId: '',
        mode: 'AUTOSUGGEST',
        userSessionId: '',
      }),
    });

    return await response2.json();
  } catch (error) {
    console.error('Error fetching from Zepto:', error);
    return null;
  }
};
