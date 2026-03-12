'use client';
import { signIn, useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

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
      <div style={{ minHeight:'100vh', background:'#080c04', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:'28px', height:'28px', border:'2px solid rgba(200,168,75,0.2)', borderTopColor:'#c8a84b', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 1rem' }} />
          <p style={{ fontFamily:"'Inter',sans-serif", fontSize:'0.8rem', color:'rgba(255,255,255,0.3)' }}>
            {status === 'authenticated' ? 'Redirecting...' : 'Loading...'}
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight:'100vh', background:'#080c04',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:'1.5rem', fontFamily:"'Inter',sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
        @keyframes fadeUp  { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin    { to   { transform: rotate(360deg); } }
        .fade-up   { animation: fadeUp 0.5s ease both; }
        .fade-up-2 { animation: fadeUp 0.5s 0.1s ease both; }
        .fade-up-3 { animation: fadeUp 0.5s 0.2s ease both; }
        .google-btn {
          display:flex; align-items:center; justify-content:center; gap:0.75rem;
          width:100%; padding:0.875rem 1.5rem;
          background:rgba(255,255,255,0.05);
          border:1px solid rgba(255,255,255,0.12); border-radius:10px;
          cursor:pointer; color:rgba(255,255,255,0.85);
          font-family:'Inter',sans-serif; font-size:0.9rem; font-weight:500;
          transition:all 0.2s ease;
        }
        .google-btn:hover:not(:disabled) {
          background:rgba(255,255,255,0.09); border-color:rgba(255,255,255,0.22);
          transform:translateY(-1px);
        }
        .google-btn:disabled { opacity:0.5; cursor:not-allowed; }
      `}</style>

      {/* Ambient glow */}
      <div style={{ position:'fixed', top:0, left:'50%', transform:'translateX(-50%)', width:'500px', height:'250px', borderRadius:'50%', background:'radial-gradient(ellipse, rgba(200,168,75,0.08) 0%, transparent 70%)', filter:'blur(40px)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:'380px', position:'relative' }}>

        {/* Logo */}
        <div className="fade-up" style={{ textAlign:'center', marginBottom:'2.5rem' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.5rem' }}>
            <div style={{ width:'28px', height:'28px', border:'1.5px solid #c8a84b', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ width:'8px', height:'8px', background:'#c8a84b', borderRadius:'50%' }} />
            </div>
            <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:'1rem', fontWeight:700, color:'#e8f0e4' }}>South City Badminton</span>
          </div>
          <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:'1.6rem', fontWeight:700, color:'#e8f0e4', marginBottom:'0.5rem' }}>Welcome back</h1>
          <p style={{ fontSize:'0.85rem', color:'rgba(255,255,255,0.35)', lineHeight:1.6 }}>Sign in to access your account</p>
        </div>

        {/* Card */}
        <div className="fade-up-2" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'2rem' }}>

          {error && (
            <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'8px', padding:'0.75rem 1rem', marginBottom:'1.25rem', fontSize:'0.8rem', color:'#fca5a5' }}>
              {error === 'OAuthAccountNotLinked'
                ? 'This email is already linked to another provider.'
                : error === 'unauthorized'
                ? 'Your account does not have admin access.'
                : 'Something went wrong. Please try again.'}
            </div>
          )}

          <button className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>

          <p style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.2)', textAlign:'center', marginTop:'1.25rem', lineHeight:1.6 }}>
            By signing in you agree to our terms of service.
            <br />Admin access is granted by the club manager.
          </p>
        </div>

        {/* Back to home */}
        <div className="fade-up-3" style={{ textAlign:'center', marginTop:'1.5rem' }}>
          <a href="/" style={{ fontSize:'0.8rem', color:'rgba(255,255,255,0.25)', textDecoration:'none', transition:'color 0.2s' }}
            onMouseOver={e => (e.currentTarget.style.color = '#c8a84b')}
            onMouseOut={e =>  (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
            ← Back to site
          </a>
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