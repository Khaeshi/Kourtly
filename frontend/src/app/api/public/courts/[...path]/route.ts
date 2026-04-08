import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

type Params = { params: Promise<{ path: string[] }> };

function toBackendUrl(pathSegments: string[], req: NextRequest) {
  const path = pathSegments.join('/');
  return `${BACKEND_URL}/api/public/courts/${path}${req.nextUrl.search}`;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { path } = await params;

  try {
    const response = await fetch(toBackendUrl(path, req), { method: 'GET' });
    const data = await response.json().catch(async () => ({ raw: await response.text() }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch public court data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { path } = await params;

  try {
    const body = await req.text();
    const response = await fetch(toBackendUrl(path, req), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json().catch(async () => ({ raw: await response.text() }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Failed to submit public booking request' }, { status: 500 });
  }
}

