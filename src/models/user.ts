import { Schema, model } from 'mongoose';
import { IAddress, IUser } from '../types/schema';

const addressSchema = new Schema<IAddress>({
	houseNo: String,
	street: String,
	city: String,
	state: String,
	zipcode: String,
	country: String,
	location: {
		lat: Number,
		lng: Number,
	},
});

const userSchema = new Schema<IUser>(
	{
		firstName: {
			type: String,
			required: true,
			trim: true,
		},
		lastName: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			lowercase: true,
			match: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
		},
		role: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Role',
		},
		password: {
			type: String,
			required: true,
		},
		phoneNo: {
			type: String,
			required: true,
		},
		address: {
			type: addressSchema,
			required: true,
		},
	},
	{ timestamps: true }
);

userSchema.index({ 'address.location': '2dsphere' });

const User = model<IUser>('User', userSchema);
export default User;
