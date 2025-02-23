import User from '../models/user';
import { IUser } from '../types/schema';

export const createUser = async (user: IUser): Promise<IUser> => {
  const newUser = await User.create(user);
  return newUser;
};

export const updateUser = async (id: string, user: IUser): Promise<IUser> => {
  const updatedUser = await User.findByIdAndUpdate(id, user, { new: true });
  if (!updatedUser) {
    throw new Error('User not found');
  }
  return updatedUser;
};
