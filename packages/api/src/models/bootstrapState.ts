import mongoose, { Schema } from 'mongoose';

export interface IBootstrapState {
  _id: string;
  owner: string;
  status: 'initializing' | 'ready';
  leaseExpiresAt: Date;
}

const BootstrapStateSchema = new Schema<IBootstrapState>(
  {
    _id: { type: String, required: true },
    owner: { type: String, required: true },
    status: { type: String, required: true },
    leaseExpiresAt: { type: Date, required: true },
  },
  { versionKey: false, timestamps: true },
);

export default mongoose.model<IBootstrapState>(
  'BootstrapState',
  BootstrapStateSchema,
);
