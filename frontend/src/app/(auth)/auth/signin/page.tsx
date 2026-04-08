'use client';
import { signIn, useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { InlineNotice, PublicButton, PublicCard } from '@/app/components/public/ui';

function SignInContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { data: session, status } = useSession();
  const callbackUrl  = searchParams.get('callbackUrl') || null;
  const error        = searchParams.get('error');
  const [loading, setLoading] = useState(false);

  // Once session loads after OAuth return, redirect based on role
  useEffect(() => {
    if (status !== 'authenticated' || !session) return;

    if (session.user.role === 'admin') {
      // Admin: honour callbackUrl if it's an admin route, else go to /admin
      router.replace(callbackUrl?.startsWith('/admin') ? callbackUrl : '/admin');
    } else {
      // Regular user: always go back to landing page
      router.replace('/');
    }
  }, [status, session, callbackUrl, router]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    // Use a neutral callbackUrl — the useEffect above handles final redirect
    await signIn('google', { callbackUrl: '/auth/signin' });
  };

  // Show loading state while session resolves after OAuth return
  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="public-root min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-7 h-7 border-2 border-[rgba(158,240,26,0.2)] border-t-[var(--public-accent)] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-white/40">
            {status === 'authenticated' ? 'Redirecting...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-root min-h-screen flex items-center justify-center p-6 font-sans">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[520px] h-[260px] rounded-full pointer-events-none opacity-35"
        style={{ background: 'radial-gradient(ellipse, rgba(158,240,26,0.2) 0%, transparent 70%)', filter: 'blur(46px)' }} />

      <div className="w-full max-w-[390px] relative">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-7 h-7 border-[1.5px] border-[var(--public-accent)] rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-[var(--public-accent)] rounded-full" />
            </div>
            <span className="font-semibold text-base text-white">{APP_NAME}</span>
          </div>
          <h1 className="text-3xl font-semibold text-white mb-2">Welcome back</h1>
          <p className="text-sm text-white/45">Sign in to access your account</p>
        </div>

        <PublicCard className="p-8">
          {error && (
            <InlineNotice variant="error" className="mb-5">
              {error === 'OAuthAccountNotLinked'
                ? 'This email is already linked to another provider.'
                : error === 'unauthorized'
                ? 'Your account does not have admin access.'
                : 'Something went wrong. Please try again.'}
            </InlineNotice>
          )}

          <PublicButton variant="secondary" className="w-full py-3 text-sm" onClick={handleGoogleSignIn} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? 'Signing in...' : 'Continue with Google'}
          </PublicButton>

          <p className="text-[0.72rem] text-white/25 text-center mt-5 leading-relaxed">
            By signing in you agree to our terms of service.
            <br />Admin access is granted by the club manager.
          </p>
        </PublicCard>

        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-white/30 no-underline hover:text-[var(--public-accent)] transition-colors">
            ← Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}