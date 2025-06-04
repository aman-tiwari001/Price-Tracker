import { Types } from 'mongoose';
import CONSTANTS from '../../config/constant';

type PlatformType = (typeof CONSTANTS.PLATFORMS)[keyof typeof CONSTANTS.PLATFORMS];

export interface IAddress {
  houseNo: string;
  street: string;
  city: string;
  state: string;
  zipcode: string;
  country: string;
  location: {
    lat: number;
    lng: number;
  };
}

export interface IRole extends Document {
  _id: Types.ObjectId;
  type: 'user' | 'admin';
  permissions: string[];
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  role: Types.ObjectId | IRole;
  password: string;
  phoneNo: string;
  address: IAddress;
  platformPrefernce: PlatformType[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILocation {
  lat: string;
  lng: string;
}

export interface IProduct {
  id: string,
  name: string;
  description?: string;
  images: string[];
  prices: unknown;
  eta?: string;
  quantity: string;
  multipleQuantityOptions?: number[];
  stockAvailability: boolean;
  discount?: number;
  brand?: string;
  category?: string;
  ratings?: { average: number; total: number };
  reviews?: unknown;
  webLink?: string;
  appLink?: string;
  platform: PlatformType;
}

export type ProductsAPIResponse = {
  productList: IProduct[];
  totalProducts: number;
};
