import { z } from 'zod';
import CONSTANTS from '../config/constant';

export const registerSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters long'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters long'),
  email: z.string().nonempty('Email address is required').email('Invalid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long')
    .regex(CONSTANTS.PASS_REGEX, 'Weak password'),
  phoneNo: z
    .string()
    .min(10, 'Phone no must be 10 digits only')
    .max(10, 'Phone no must be 10 digits only'),
  address: z.object({
    houseNo: z.string().nonempty('House number is required'),
    street: z.string().nonempty('Street is required'),
    city: z.string().nonempty('City is required'),
    state: z.string().nonempty('State is required'),
    zipcode: z.string().nonempty('Zipcode is required'),
    country: z.string().nonempty('Country is required'),
    location: z.object({
      lat: z
        .number()
        .min(-90, 'Latitude must be between -90 and 90')
        .max(90, 'Latitude must be between -90 and 90'),
      lng: z
        .number()
        .min(-180, 'Longitude must be between -180 and 180')
        .max(180, 'Longitude must be between -180 and 180'),
    }),
  }),
});

export const loginSchema = z.object({
  email: z.string().nonempty('Email is required').email('Invalid email address'),
  password: z.string().nonempty('Password is required'),
});
