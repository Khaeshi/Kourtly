import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createInternalAssertion } from '@/lib/internalAuthClient';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in before registering a court.' }, { status: 401 });
    }

    let assertion: string;
    try {
      assertion = createInternalAssertion(session.user);
    } catch {
      return NextResponse.json({ error: 'Server authentication is not configured.' }, { status: 500 });
    }

    const body = await req.json();
    const res  = await fetch(`${BACKEND_URL}/api/register-court`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-kourtly-auth': assertion },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}