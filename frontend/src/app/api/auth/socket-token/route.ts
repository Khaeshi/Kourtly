/**
 * @author Khaesey Angel Tablante
 * @description This file contains the route for generating a socket token for authenticated users.
 */


import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { createInternalAssertion } from '@/lib/internalAuthClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = createInternalAssertion(session.user);
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: 'Server authentication is not configured.' }, { status: 500 });
  }
}