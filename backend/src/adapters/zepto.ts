import CONSTANTS from '../config/constant';
import { ILocation } from '../types/schema';

export const fetchFromZepto = async (query: string, location: ILocation) => {
  try {
    const response1 = await fetch(
      `${CONSTANTS.ZEPTO_API_URL1}?latitude=${location.lat}&longitude=${location.lng}&page_type=HOME&version=v2`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9,hi;q=0.8',
          app_sub_platform: 'WEB',
          app_version: '12.64.0',
          auth_revamp_flow: 'v2',
          'cache-control': 'no-cache',
          compatible_components:
            'CONVENIENCE_FEE,RAIN_FEE,EXTERNAL_COUPONS,STANDSTILL,BUNDLE,MULTI_SELLER_ENABLED,PIP_V1,ROLLUPS,SCHEDULED_DELIVERY,SAMPLING_ENABLED,ETA_NORMAL_WITH_149_DELIVERY,ETA_NORMAL_WITH_199_DELIVERY,HOMEPAGE_V2,NEW_ETA_BANNER,VERTICAL_FEED_PRODUCT_GRID,AUTOSUGGESTION_PAGE_ENABLED,AUTOSUGGESTION_PIP,AUTOSUGGESTION_AD_PIP,BOTTOM_NAV_FULL_ICON,COUPON_WIDGET_CART_REVAMP,DELIVERY_UPSELLING_WIDGET,MARKETPLACE_CATEGORY_GRID,NO_PLATFORM_CHECK_ENABLED_V2,SUPER_SAVER:1,SUPERSTORE_V1,PROMO_CASH:0,24X7_ENABLED_V1,TABBED_CAROUSEL_V2,HP_V4_FEED,WIDGET_BASED_ETA,NEW_FEE_STRUCTURE,NEW_BILL_INFO,RE_PROMISE_ETA_ORDER_SCREEN_ENABLED,SUPERSTORE_V1,MANUALLY_APPLIED_DELIVERY_FEE_RECEIVABLE,MARKETPLACE_REPLACEMENT,ZEPTO_PASS,ZEPTO_PASS:1,ZEPTO_PASS:2,ZEPTO_PASS_RENEWAL,CART_REDESIGN_ENABLED,SHIPMENT_WIDGETIZATION_ENABLED,TABBED_CAROUSEL_V2,24X7_ENABLED_V1,PROMO_CASH:0,HOMEPAGE_V2,SUPER_SAVER:1,NO_PLATFORM_CHECK_ENABLED_V2,HP_V4_FEED,GIFT_CARD,SCLP_ADD_MONEY,GIFTING_ENABLED,OFSE,WIDGET_BASED_ETA,NEW_ETA_BANNER,',
          marketplace_type: 'ZEPTO_NOW',
          platform: 'WEB',
          pragma: 'no-cache',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          source: 'DIRECT',
          tenant: 'ZEPTO',
          Referer: 'https://www.zepto.com/',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      },
    );

    const storeId = (await response1.json()).storeServiceableResponse.storeId;

    const response2 = await fetch(`${CONSTANTS.ZEPTO_API_URL2}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9,hi;q=0.8',
        app_sub_platform: 'WEB',
        app_version: '12.64.0',
        appversion: '12.64.0',
        auth_revamp_flow: 'v2',
        'cache-control': 'no-cache',
        compatible_components:
          'CONVENIENCE_FEE,RAIN_FEE,EXTERNAL_COUPONS,STANDSTILL,BUNDLE,MULTI_SELLER_ENABLED,PIP_V1,ROLLUPS,SCHEDULED_DELIVERY,SAMPLING_ENABLED,ETA_NORMAL_WITH_149_DELIVERY,ETA_NORMAL_WITH_199_DELIVERY,HOMEPAGE_V2,NEW_ETA_BANNER,VERTICAL_FEED_PRODUCT_GRID,AUTOSUGGESTION_PAGE_ENABLED,AUTOSUGGESTION_PIP,AUTOSUGGESTION_AD_PIP,BOTTOM_NAV_FULL_ICON,COUPON_WIDGET_CART_REVAMP,DELIVERY_UPSELLING_WIDGET,MARKETPLACE_CATEGORY_GRID,NO_PLATFORM_CHECK_ENABLED_V2,SUPER_SAVER:1,SUPERSTORE_V1,PROMO_CASH:0,24X7_ENABLED_V1,TABBED_CAROUSEL_V2,HP_V4_FEED,WIDGET_BASED_ETA,NEW_ROLLUPS_ENABLED,RERANKING_QCL_RELATED_PRODUCTS,PLP_ON_SEARCH,PAAN_BANNER_WIDGETIZED,ROLLUPS_UOM,DYNAMIC_FILTERS,PHARMA_ENABLED,AUTOSUGGESTION_RECIPE_PIP,SEARCH_FILTERS_V1,QUERY_DESCRIPTION_WIDGET,MEDS_WITH_SIMILAR_SALT_WIDGET,NEW_FEE_STRUCTURE,NEW_BILL_INFO,RE_PROMISE_ETA_ORDER_SCREEN_ENABLED,SUPERSTORE_V1,MANUALLY_APPLIED_DELIVERY_FEE_RECEIVABLE,MARKETPLACE_REPLACEMENT,ZEPTO_PASS,ZEPTO_PASS:1,ZEPTO_PASS:2,ZEPTO_PASS_RENEWAL,CART_REDESIGN_ENABLED,SHIPMENT_WIDGETIZATION_ENABLED,TABBED_CAROUSEL_V2,24X7_ENABLED_V1,PROMO_CASH:0,HOMEPAGE_V2,SUPER_SAVER:1,NO_PLATFORM_CHECK_ENABLED_V2,HP_V4_FEED,GIFT_CARD,SCLP_ADD_MONEY,GIFTING_ENABLED,OFSE,WIDGET_BASED_ETA,NEW_ETA_BANNER,',
        'content-type': 'application/json',
        marketplace_type: 'ZEPTO_NOW',
        platform: 'WEB',
        pragma: 'no-cache',
        priority: 'u=1, i',
        'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        storeid: storeId,
        tenant: 'ZEPTO',
        'x-without-bearer': 'true',
        Referer: 'https://www.zepto.com/',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
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
