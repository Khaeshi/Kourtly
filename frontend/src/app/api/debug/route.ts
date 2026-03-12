export async function GET() {
    return Response.json({
      hasGoogleId: !!process.env.AUTH_GOOGLE_ID,
      hasGoogleSecret: !!process.env.AUTH_GOOGLE_SECRET,
      hasAuthSecret: !!process.env.AUTH_SECRET,
      googleIdPrefix: process.env.AUTH_GOOGLE_ID?.slice(0, 15),
      nextauthUrl: process.env.NEXTAUTH_URL,
      trustHost: process.env.AUTH_TRUST_HOST,
    });
  }
