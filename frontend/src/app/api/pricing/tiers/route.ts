import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ||
  (process.env.NODE_ENV !== 'production'
    ? 'http://localhost:5000'
    : '');

export async function GET() {
  if (!BACKEND_URL) {
    return NextResponse.json(
      { error: 'Backend API URL is not configured' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/pricing/tiers`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Pricing is unavailable' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
