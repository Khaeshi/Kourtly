import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-court-id': session.user.courtId ?? '',
      'x-user-role': session.user.role ?? 'user',
      'x-user-email': session.user.email ?? '',
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