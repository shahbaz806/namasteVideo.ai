import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { getDb } from '../db/client';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface SessionView {
  user: SessionUser;
  expiresAt: string;
  workspaceId: string;
  capabilities: {
    generation: boolean;
    instagramPublishing: boolean;
  };
}

let _authInstance: any = undefined;

export async function getAuth(): Promise<any> {
  if (!_authInstance) {
    const db = await getDb();
    _authInstance = betterAuth({
      database: mongodbAdapter(db),
      secret: process.env.BETTER_AUTH_SECRET || 'fallback-secret-for-typechecking-only-32b',
      baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        cookieCache: {
          enabled: false, // Per API_DESIGN.md: disable browser-readable session token caching
        },
      },
    });
  }
  return _authInstance;
}
