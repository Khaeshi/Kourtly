import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function createInternalAssertion(user: { email?: string | null }) {
  const secret = process.env.PLAYKOU_INTERNAL_AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret || !user.email) throw new Error('Internal auth secret and user email are required.');

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ email: user.email.toLowerCase(), iat: now, exp: now + 300 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

async function proxyRequest(req: NextRequest, params: Promise<{ path: string[] }>, method: string) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  const search = req.nextUrl.search;
  const url = `${BACKEND_URL}/api/${path}${search}`;

 
  const body = method !== 'GET' && method !== 'DELETE'
    ? await req.text()
    : undefined; 

  console.log(`🔄 Proxy ${method} /${path}`);

  let internalAssertion;
  try {
    internalAssertion = createInternalAssertion(session.user);
  } catch {
    return NextResponse.json({ error: 'Server authentication is not configured.' }, { status: 500 });
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-playkou-auth': internalAssertion,
    },
    body,
  });

  // ✅ Safe JSON parse
  let data;
  try {
    data = await response.json();
  } catch {
    data = { raw: await response.text() };
  }

  return NextResponse.json(data, { status: response.status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params, 'GET');
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params, 'POST');
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params, 'PUT');
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params, 'PATCH');
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params, 'DELETE');
}