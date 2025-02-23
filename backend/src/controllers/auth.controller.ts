import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user';
import Role from '../models/role';
import { IUser } from '../types/schema';
import CONSTANTS from '../config/constant';
import { Request, Response } from 'express';
import { createUser } from '../services/user';
import { responseHandler } from '../utils/responseHandler';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, phoneNo, address } = req.body;

    const user = await User.findOne({ email });
    if (user) {
      return responseHandler(res, 400, false, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const role = await Role.findOne({ type: 'user' });
    if (!role) {
      return responseHandler(res, 500, false, 'Server error');
    }

    const newUser = await createUser({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phoneNo,
      address,
      role: role._id,
    } as IUser);

    const token = jwt.sign({ userId: newUser._id, role: role.type }, CONSTANTS.JWT_SECRET, {
      expiresIn: '1d',
    });

    return responseHandler(res, 201, true, 'User registered successfully', {
      user: newUser,
      token,
    });
  } catch (err) {
    console.log('Error registering user: ', err);
    return responseHandler(res, 500, false, 'Server error');
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return responseHandler(res, 400, false, 'Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return responseHandler(res, 400, false, 'Invalid credentials');
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, CONSTANTS.JWT_SECRET, {
      expiresIn: '1d',
    });

    return responseHandler(res, 200, true, 'User logged in successfully', {
      user,
      token,
    });
  } catch (err) {
    console.log('Error logging in user: ', err);
    return responseHandler(res, 500, false, 'Server error');
  }
};
