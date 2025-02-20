import User from '../models/user';
import { IUser } from '../types/schema';

export const createUser = async (user: IUser): Promise<IUser> => {
	try {
		const newUser = await User.create(user);
		return newUser;
	} catch (err) {
		throw new Error('Server error');
	}
};

export const updateUser = async (id: string, user: IUser): Promise<IUser> => {
	try {
		const updatedUser = await User.findByIdAndUpdate(id, user, { new: true });
		if (!updatedUser) {
			throw new Error('User not found');
		}
		return updatedUser;
	} catch (err) {
		throw new Error('Server error');
	}
};
