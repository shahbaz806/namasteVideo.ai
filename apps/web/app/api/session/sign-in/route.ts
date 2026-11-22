import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';
import { checkInternalAccess, normalizeEmail } from '@/lib/auth/admission';
import crypto from 'node:crypto';

export async function POST(req: NextRequest) {
  const requestId = `req_${crypto.randomBytes(12).toString('hex')}`;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Email and password are required',
          },
          meta: { requestId },
        },
        { status: 400 }
      );
    }

    const email = normalizeEmail(body.email);
    const password = body.password;

    if (!email || email.length > 254 || !password || password.length > 128) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
          meta: { requestId },
        },
        { status: 401 }
      );
    }

    // Check internal admission allowlist
    const admission = await checkInternalAccess(email);
    if (!admission.allowed) {
      // Generic error to prevent enumeration of allowlisted emails
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
          meta: { requestId },
        },
        { status: 401 }
      );
    }

    const auth = await getAuth();

    // Call Better Auth signInEmail
    const authRes = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
      asResponse: true,
    });

    if (!authRes.ok) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
          meta: { requestId },
        },
        { status: 401 }
      );
    }

    const authData = await authRes.json();
    console.log('BetterAuth signIn result:', authData);
    const user = authData.user || authData;
    const session = authData.session;
    const expiresAt = session?.expiresAt
      ? new Date(session.expiresAt).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const sessionView = {
      user: {
        id: user.id || user._id,
        email: user.email,
        name: user.name || email.split('@')[0],
      },
      expiresAt,
      workspaceId: user.id || user._id,
      capabilities: {
        generation: true,
        instagramPublishing: true,
      },
    };

    const res = NextResponse.json(
      {
        data: sessionView,
        meta: { requestId },
      },
      { status: 200 }
    );

    // Forward Set-Cookie headers from Better Auth
    const setCookie = authRes.headers.get('set-cookie');
    if (setCookie) {
      res.headers.set('set-cookie', setCookie);
    }

    return res;
  } catch (err: any) {
    console.error('Sign-in error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err?.message || 'An unexpected authentication error occurred',
        },
        meta: { requestId },
      },
      { status: 500 }
    );
  }
}
