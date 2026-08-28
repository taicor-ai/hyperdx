import mongoose, { Schema } from 'mongoose';

export interface IOidcTransaction {
  state: string;
  sessionId: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  expiresAt: Date;
}

const OidcTransactionSchema = new Schema<IOidcTransaction>(
  {
    state: { type: String, required: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    codeVerifier: { type: String, required: true },
    nonce: { type: String, required: true },
    returnTo: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);

export default mongoose.model<IOidcTransaction>(
  'OidcTransaction',
  OidcTransactionSchema,
);
