import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    const authRes = await auth.api.signOut({
      headers: req.headers,
      asResponse: true,
    });

    const res = new NextResponse(null, { status: 204 });

    const setCookie = authRes.headers.get('set-cookie');
    if (setCookie) {
      res.headers.set('set-cookie', setCookie);
    }

    return res;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
