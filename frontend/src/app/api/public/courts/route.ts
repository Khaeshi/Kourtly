import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function GET() {
  try {
    console.log('🌐 Fetching public courts...');
    const response = await fetch(`${BACKEND_URL}/api/public/courts`, {
      cache: 'no-store', // Fresh data
    });

    console.log('Backend status:', response.status);
    
    if (!response.ok) {
      console.error('Backend error:', await response.text());
      return NextResponse.json({ error: 'Failed to fetch courts' }, { status: 500 });
    }

    const courts = await response.json();
    console.log('✅ Public courts:', courts.length);
    
    return NextResponse.json(courts);
  } catch (error) {
    console.error('❌ Public courts proxy error:', error);
    return NextResponse.json([], { status: 200 }); 
  }
}