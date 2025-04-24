import { CONSTANTS } from '@/utils/constant';
import axios from 'axios';

const serverUrl = CONSTANTS.serverUrl;

export const searchProduct = async (query: string, lat: string, lng: string) => {
  console.log(`${serverUrl}/api/app/search?q=${query}&lat=${lat}&lng=${lng}`)
  const res = await axios.get(`${serverUrl}/api/app/search?q=${query}&lat=${lat}&lng=${lng}`);
  return res.data;
};
