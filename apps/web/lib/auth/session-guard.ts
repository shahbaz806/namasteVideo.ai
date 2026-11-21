import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getAuth } from './index';
import { checkInternalAccess } from './admission';
import { getDb } from '../db';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export type AuthResult =
  | { user: AuthenticatedUser; requestId: string; errorResponse?: undefined }
  | { user?: undefined; requestId: string; errorResponse: NextResponse };

export async function requireSession(req: NextRequest): Promise<AuthResult> {
  const requestId =
    req.headers.get('x-request-id') ||
    req.headers.get('x-correlation-id') ||
    `req_${crypto.randomBytes(12).toString('hex')}`;

  const defaultHeaders = {
    'X-Request-Id': requestId,
    'Cache-Control': 'private, no-store',
  };

  try {
    // 1. In non-production tests, allow direct test-user authorization via header
    if (process.env.NODE_ENV !== 'production') {
      const testUserId = req.headers.get('x-test-user-id');
      if (testUserId) {
        const db = await getDb();
        const query = ObjectId.isValid(testUserId)
          ? { $or: [{ _id: new ObjectId(testUserId) }, { id: testUserId }] }
          : { id: testUserId };
        const userDoc = await db.collection('user').findOne(query);
        if (userDoc) {
          const admission = await checkInternalAccess(userDoc.email);
          if (!admission.allowed) {
            return {
              requestId,
              errorResponse: NextResponse.json(
                {
                  error: {
                    code: 'ACCESS_DISABLED',
                    message: 'Account is disabled or not permitted',
                    requestId,
                    retryable: false,
                  },
                  meta: { requestId },
                },
                { status: 403, headers: defaultHeaders }
              ),
            };
          }
          const resolvedId = userDoc._id?.toString() || userDoc.id;
          return {
            requestId,
            user: {
              id: resolvedId,
              email: userDoc.email,
              name: userDoc.name || userDoc.email.split('@')[0],
            },
          };
        }
      }
    }

    // 2. Standard Better Auth session resolution
    const auth = await getAuth();
    const sessionData = await auth.api.getSession({
      headers: req.headers,
    });

    if (!sessionData?.session || !sessionData?.user) {
      return {
        requestId,
        errorResponse: NextResponse.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              requestId,
              retryable: false,
            },
            meta: { requestId },
          },
          { status: 401, headers: defaultHeaders }
        ),
      };
    }

    const email = sessionData.user.email;
    const admission = await checkInternalAccess(email);

    if (!admission.allowed) {
      return {
        requestId,
        errorResponse: NextResponse.json(
          {
            error: {
              code: 'ACCESS_DISABLED',
              message: 'Account is disabled or not permitted',
              requestId,
              retryable: false,
            },
            meta: { requestId },
          },
          { status: 403, headers: defaultHeaders }
        ),
      };
    }

    return {
      requestId,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: sessionData.user.name || email.split('@')[0],
      },
    };
  } catch (error) {
    console.error('Session authentication error:', error);
    return {
      requestId,
      errorResponse: NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to verify session credentials',
            requestId,
            retryable: true,
          },
          meta: { requestId },
        },
        { status: 500, headers: defaultHeaders }
      ),
    };
  }
}
