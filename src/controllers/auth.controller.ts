import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user';
import CONSTANTS from '../config/constant';
import { createUser } from '../services/user';
import Role from '../models/role';
import { IUser } from '../types/schema';

export const register = async (req: Request, res: Response): Promise<void> => {
	try {
		const { email, password, firstName, lastName, phoneNo, address } = req.body;

		let user = await User.findOne({ email });
		if (user) {
			res.status(400).json({ message: 'User already exists' });
			return;
		}

		const hashedPassword = await bcrypt.hash(password, 12);

    console.log(req.body);

		const role = await Role.findOne({ type: 'user' });
		if (!role) {
			res.status(500).json({ message: 'Server error' });
			return;
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

		const token = jwt.sign(
			{ id: newUser._id, role: role.type },
			CONSTANTS.JWT_SECRET,
			{ expiresIn: '1d' }
		);

		res.status(201).json({ token });
	} catch (err) {
		res.status(500).json({ message: 'Server error' });
	}
};

export const login = async (req: Request, res: Response): Promise<void> => {
	try {
		const { email, password } = req.body;

		const user = await User.findOne({ email });
		if (!user) {
			res.status(400).json({ message: 'Invalid credentials' });
			return;
		}

		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			res.status(400).json({ message: 'Invalid credentials' });
			return;
		}

		const token = jwt.sign(
			{ id: user._id, role: user.role },
			CONSTANTS.JWT_SECRET,
			{ expiresIn: '1d' }
		);

		res.json({ token });
	} catch (err) {
		res.status(500).json({ message: 'Server error' });
	}
};
