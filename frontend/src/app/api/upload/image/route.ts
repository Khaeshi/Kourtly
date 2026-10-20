import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const KINDS = {
  logo: { maxSide: 512, quality: 85 },
  photo: { maxSide: 1600, quality: 80 },
} as const;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

function makeClient(cfg: NonNullable<ReturnType<typeof r2Config>>) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

// Only signed-in users attached to a court may upload. Customers have courtId null.
async function requireCourtAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const courtId = session.user.courtId;
  if (!courtId || !OBJECT_ID.test(courtId)) {
    return { error: NextResponse.json({ error: 'Only court admins can upload images.' }, { status: 403 }) };
  }
  return { courtId };
}

export async function POST(req: NextRequest) {
  const gate = await requireCourtAdmin();
  if ('error' in gate) return gate.error;
  const { courtId } = gate;

  const cfg = r2Config();
  if (!cfg) return NextResponse.json({ error: 'Image storage is not configured.' }, { status: 503 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const kind = formData.get('kind');
  if (kind !== 'logo' && kind !== 'photo') {
    return NextResponse.json({ error: 'Invalid upload type.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string' || file.size === 0) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: 'Image is too large. Please use one under 4 MB.' }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  let output: Buffer;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      return NextResponse.json({ error: 'Please upload a PNG, JPG or WebP image.' }, { status: 415 });
    }
    const { maxSide, quality } = KINDS[kind];
    // rotate() applies the phone's orientation; sharp then drops EXIF data such as GPS.
    output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'That file could not be read as an image.' }, { status: 415 });
  }

  const hash = createHash('sha256').update(output).digest('hex').slice(0, 16);
  const key = `courts/${courtId}/${kind}-${hash}.webp`;

  try {
    await makeClient(cfg).send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: output,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
  } catch (err) {
    console.error('[upload] R2 put failed:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Could not save the image. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ url: `${cfg.publicBase}/${key}` });
}

// Best-effort cleanup when a photo is removed. Only files in the caller's own folder are touched.
export async function DELETE(req: NextRequest) {
  const gate = await requireCourtAdmin();
  if ('error' in gate) return gate.error;
  const { courtId } = gate;

  const cfg = r2Config();
  if (!cfg) return NextResponse.json({ error: 'Image storage is not configured.' }, { status: 503 });

  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const prefix = `${cfg.publicBase}/`;
  const key = typeof url === 'string' && url.startsWith(prefix) ? url.slice(prefix.length) : '';
  const ownKey = new RegExp(`^courts/${courtId}/(logo|photo)-[a-f0-9]{16}\\.webp$`);
  if (!ownKey.test(key)) {
    // Not one of our files (for example an old broken Cloudinary link): nothing to delete.
    return NextResponse.json({ ok: true, deleted: false });
  }

  try {
    await makeClient(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  } catch (err) {
    console.error('[upload] R2 delete failed:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Could not delete the image.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, deleted: true });
}