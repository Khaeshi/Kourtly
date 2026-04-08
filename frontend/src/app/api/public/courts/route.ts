import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function GET() {
  try {
    console.log('🌐 Fetching public courts...');

    const response = await fetch(`${BACKEND_URL}/api/public/courts`, {
      cache: 'no-store',
    });

    console.log('Backend status:', response.status);

    if (!response.ok) {
      // Log backend text for debugging, but return a clean JSON error
      console.error('Backend error:', await response.text());
      return NextResponse.json(
        { error: 'Failed to fetch courts' },
        { status: 500 },
      );
    }

    const courts = await response.json();
    console.log('✅ Public courts:', Array.isArray(courts) ? courts.length : 0);

    return NextResponse.json(courts);
  } catch (error) {
    console.error('❌ Public courts proxy error:', error);
    // For safety on the landing page, return an empty array instead of HTML
    return NextResponse.json([], { status: 200 });
  }
}

