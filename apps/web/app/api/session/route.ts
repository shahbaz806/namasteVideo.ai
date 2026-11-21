import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';
import { checkInternalAccess } from '@/lib/auth/admission';
import crypto from 'node:crypto';

export async function GET(req: NextRequest) {
  const requestId = `req_${crypto.randomBytes(12).toString('hex')}`;

  try {
    const auth = await getAuth();
    const sessionData = await auth.api.getSession({
      headers: req.headers,
    });

    if (!sessionData?.session || !sessionData?.user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
          meta: { requestId },
        },
        { status: 401 }
      );
    }

    const email = sessionData.user.email;
    const admission = await checkInternalAccess(email);

    if (!admission.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'ACCESS_DISABLED',
            message: 'Account is disabled or not permitted',
          },
          meta: { requestId },
        },
        { status: 403 }
      );
    }

    const sessionView = {
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: sessionData.user.name || email.split('@')[0],
      },
      expiresAt: new Date(sessionData.session.expiresAt).toISOString(),
      workspaceId: sessionData.user.id,
      capabilities: {
        generation: true,
        instagramPublishing: true,
      },
    };

    return NextResponse.json(
      {
        data: sessionView,
        meta: { requestId },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while checking session',
        },
        meta: { requestId },
      },
      { status: 500 }
    );
  }
}
