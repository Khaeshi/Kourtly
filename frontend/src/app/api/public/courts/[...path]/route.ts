import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ||
  (process.env.NODE_ENV !== 'production'
    ? 'http://localhost:5000'
    : '');

type Params = {
  params: Promise<{ path: string[] }>;
};

function toBackendUrl(pathSegments: string[], req: NextRequest) {
  const path = pathSegments.map(encodeURIComponent).join('/');
  return `${BACKEND_URL}/api/public/courts/${path}${req.nextUrl.search}`;
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function proxyRequest(
  req: NextRequest,
  path: string[],
  method: 'GET' | 'POST',
) {
  if (!BACKEND_URL) {
    return NextResponse.json(
      { error: 'Backend API URL is not configured' },
      { status: 500 },
    );
  }

  try {
    const headers: HeadersInit = {};

    const options: RequestInit = { method, headers };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      options.body = await req.text();
    }

    const response = await fetch(toBackendUrl(path, req), options);
    const data = await parseResponse(response);

    return NextResponse.json(data, {
      status: response.status,
    });
    } catch {
    if (method === 'GET') {
      return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(
      { error: 'Failed to submit public booking request' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxyRequest(req, path, 'GET');
}

export async function POST(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxyRequest(req, path, 'POST');
}
