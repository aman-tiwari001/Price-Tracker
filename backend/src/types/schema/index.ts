import { Types } from 'mongoose';
import CONSTANTS from '../../config/constant';

type Platform = (typeof CONSTANTS.PLATFORMS)[number];

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
  platformPrefernce: Platform[];
  createdAt?: Date;
  updatedAt?: Date;
}
