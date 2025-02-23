import { Schema, model } from 'mongoose';
import { IRole } from '../types/schema';
import CONSTANTS from '../config/constant';

const roleSchema = new Schema<IRole>({
  type: {
    type: String,
    required: true,
    unique: true,
    enum: CONSTANTS.ROLE_TYPES,
  },
  permissions: {
    type: [{ type: String, enum: CONSTANTS.PERMISSIONS }],
    required: true,
  },
});

const Role = model<IRole>('Role', roleSchema);
export default Role;
