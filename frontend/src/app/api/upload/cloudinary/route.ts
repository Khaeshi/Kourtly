import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function cloudinaryConfig() {
  const cloud =
    process.env.CLOUDINARY_CLOUD_NAME?.trim() ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const preset =
    process.env.CLOUDINARY_UPLOAD_PRESET?.trim() ||
    process.env.NEXT_PUBLIC_CLOUDINARY_PRESET?.trim();
  return { cloud, preset };
}

/**
 * Server-side unsigned upload to Cloudinary (same as client preset flow).
 * Lets you keep cloud name + preset in server-only env if NEXT_PUBLIC_* are unset.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { cloud, preset } = cloudinaryConfig();
  if (!cloud || !preset) {
    return NextResponse.json(
      {
        error:
          'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in frontend .env (or NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_PRESET).',
      },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append('file', file);
  upstream.append('upload_preset', preset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body: upstream,
  });

  const data = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) {
    const msg = data.error?.message || 'Cloudinary upload failed';
    return NextResponse.json({ error: msg }, { status: res.status >= 400 ? res.status : 502 });
  }

  return NextResponse.json({ secure_url: data.secure_url });
}
