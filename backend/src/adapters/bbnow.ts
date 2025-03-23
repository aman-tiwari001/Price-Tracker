import CONSTANTS from '../config/constant';
import { ILocation } from '../types/schema';

export const fetchFromBBNow = async (query: string, location: ILocation) => {
  try {
    const userLocation = btoa(`${location.lat}|${location.lng}`);
    const response = await fetch(
      `${CONSTANTS.BB_NOW_API_URL}?type=ps&slug=${query}&page=1`,
      {
        method: 'GET',
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
          'x-channel': 'BB-WEB',
          cookie: `_bb_vid=NTg2ODU1MTc1OTU2Njk3ODM4; _bb_tc=0; _bb_rdt="MzEwNTE1NjUwMA==.0"; _bb_rd=6; jarvis-id=17923101-3258-4596-822f-8fc3a42706c8; _gcl_au=1.1.1451197645.1739046501; bigbasket.com=0aff2250-cb7a-4c9d-8935-3c584d8cb9a6; _vz=viz_67a7be667a335; _vz=; ufi=1; _bb_lat_long="${userLocation}"; _sp_van_encom_hid=6938; _bb_hid=6939; _bb_cid=18; _bb_visaddr="fHJvaGluaSwgc2VjdG9yLTE2fDI4LjczNTQ0OTV8NzcuMTE3NDc3fDExMDA4OXw="; _bb_aid="MzA2MzU1MDU0Mw=="; x-channel=web; bb2_enabled=true; _fbp=fb.1.1740504316649.258193215992200364; adb=0; _gcl_gs=2.1.k1$i1742104946$u113166231; _gac_UA-27455376-1=1.1742106686.Cj0KCQjwytS-BhCKARIsAMGJyzo7AKJroJvzcLIwongZbiT0tiXg6E2TEfSC-U0c2EHLtoDypc03rx4aAsH7EALw_wcB; _gcl_aw=GCL.1742106702.Cj0KCQjwytS-BhCKARIsAMGJyzo7AKJroJvzcLIwongZbiT0tiXg6E2TEfSC-U0c2EHLtoDypc03rx4aAsH7EALw_wcB; csurftoken=ia9eSQ.NTg2ODU1MTc1OTU2Njk3ODM4.1742467558391.TN1zP5nSEIAjHiS6HZ1pvvF90bltEso3ax3BjdXzJFQ=; AKA_A2=A; _client_version=2830; _gid=GA1.2.442905642.1742467561; _gat_gtag_UA_27455376_1=1; _gat_UA-27455376-1=1; ts="2025-03-20 16:16:00.331"; _ga=GA1.1.291724941.1739046501; x-entry-context-id=100; x-entry-context=bb-b2c; _bb_bb2.0=1; is_global=0; _bb_sa_ids=14673; _is_tobacco_enabled=0; _is_bb1.0_supported=0; _bb_cda_sa_info=djIuY2RhX3NhLjEwMC4xNDY3Mw==; is_integrated_sa=1; _ga_FRRYG5VKHX=GS1.1.1742467560.11.0.1742467569.51.0.0`,
          Referer: `https://www.bigbasket.com/ps/?q=${query}`,
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.log('Error fetching from BBNow:', error);
    return null;
  }
};
