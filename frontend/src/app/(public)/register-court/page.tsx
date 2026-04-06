'use client';
import { useState } from 'react';
import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { Check, ArrowRight, ChevronRight } from 'lucide-react';

const SPORTS    = ['badminton', 'pickleball', 'tennis'];
const PROVINCES = [
  'Metro Manila','Cebu','Davao del Sur','Laguna','Cavite',
  'Rizal','Bulacan','Pampanga','Batangas','Iloilo','Other',
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-gray-500">{label}</label>
      {children}
      {hint && <p className="text-[0.68rem] text-gray-400">{hint}</p>}
    </div>
  );
}

const INPUT = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors";

export default function RegisterCourtPage() {
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [form,    setForm]    = useState({
    name: '', slug: '', adminEmail: '',
    sports: ['badminton'] as string[], courtCount: '4',
    city: '', province: '', address: '',
    phone: '', email: '', facebook: '', instagram: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const toggleSport = (s: string) => setForm(p => ({
    ...p, sports: p.sports.includes(s) ? p.sports.filter(x => x !== s) : [...p.sports, s],
  }));

  const validate = () => {
    if (step === 1) {
      if (!form.name || !form.slug || !form.adminEmail) { setError('Please fill in all required fields.'); return false; }
      if (!form.adminEmail.includes('@')) { setError('Enter a valid email.'); return false; }
    }
    if (step === 2 && form.sports.length === 0) { setError('Select at least one sport.'); return false; }
    if (step === 3 && !form.city) { setError('City is required.'); return false; }
    setError(null); return true;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const back = () => { setError(null); setStep(s => s - 1); };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/public/register-court', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, slug: form.slug, adminEmail: form.adminEmail,
          sports: form.sports, courtCount: Number(form.courtCount),
          location: { address: form.address, city: form.city, province: form.province, country: 'Philippines' },
          contact:  { phone: form.phone, email: form.email, facebook: form.facebook, instagram: form.instagram },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const STEPS = ['Identity', 'Sports & Courts', 'Location', 'Contact'];

  if (done) return (
    <div className="min-h-screen bg-[#0c1409] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-10 max-w-[460px] w-full text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check size={24} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">You're registered!</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          Your 14-day free trial has started. Sign in with Google using <strong>{form.adminEmail}</strong> to access your dashboard.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-[0.78rem] text-amber-800 mb-5 text-left">
          Our team has been notified and will reach out within 24 hours.
        </div>
        <Link href="/auth/signin"
          className="block w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-medium no-underline text-center hover:bg-gray-700 transition-colors">
          Sign In to Dashboard
        </Link>
        <Link href="/" className="block mt-3 text-sm text-gray-400 no-underline hover:text-gray-600">← Back to home</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0c1409] flex flex-col items-center justify-center p-6">
      <Link href="/" className="flex items-center gap-2.5 mb-8 no-underline">
        <div className="w-7 h-7 border-[1.5px] border-[#c8a84b] rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-[#c8a84b] rounded-full" />
        </div>
        <span className="font-bold text-[#e8f0e4] text-sm">{APP_NAME}</span>
      </Link>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[540px] overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <p className="text-[0.72rem] uppercase tracking-[0.05em] text-gray-400 mb-1">Court Registration</p>
          <h1 className="text-xl font-bold text-gray-900">Start your free trial</h1>
          <p className="text-sm text-gray-400 mt-1">14 days free · No credit card required</p>
          <div className="flex items-center gap-2 mt-5">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-bold transition-colors ${
                    i+1 < step ? 'bg-green-600 text-white' : i+1 === step ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {i+1 < step ? <Check size={10}/> : i+1}
                  </div>
                  <span className={`text-[0.72rem] font-medium hidden sm:inline ${i+1 === step ? 'text-gray-900' : 'text-gray-400'}`}>{s}</span>
                </div>
                {i < STEPS.length-1 && <ChevronRight size={12} className="text-gray-300 shrink-0"/>}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6 flex flex-col gap-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-[0.78rem] text-red-700">{error}</div>}

          {step === 1 && <>
            <Field label="Court Name *">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, slug: slugify(e.target.value) }))}
                placeholder="South City Badminton Court" className={INPUT} />
            </Field>
            <Field label="URL Slug *" hint={`Booking page: /book/${form.slug || 'your-slug'}`}>
              <input value={form.slug} onChange={e => set('slug', slugify(e.target.value))}
                placeholder="south-city-bc" className={`${INPUT} font-mono`} />
            </Field>
            <Field label="Admin Email *" hint="Sign in with this Google account">
              <input type="email" value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)}
                placeholder="admin@yourcourtname.com" className={INPUT} />
            </Field>
          </>}

          {step === 2 && <>
            <Field label="Sports Offered *">
              <div className="flex gap-2 flex-wrap">
                {SPORTS.map(s => (
                  <button key={s} type="button" onClick={() => toggleSport(s)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer capitalize ${
                      form.sports.includes(s) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}>{s}</button>
                ))}
              </div>
            </Field>
            <Field label="Number of Courts *">
              <div className="flex gap-2 flex-wrap">
                {['1','2','3','4','5','6','8','10'].map(n => (
                  <button key={n} type="button" onClick={() => set('courtCount', n)}
                    className={`w-12 h-12 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                      form.courtCount === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}>{n}</button>
                ))}
              </div>
            </Field>
          </>}

          {step === 3 && <>
            <Field label="Street Address">
              <input value={form.address} onChange={e => set('address', e.target.value)}
                placeholder="123 Court St." className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City *">
                <input value={form.city} onChange={e => set('city', e.target.value)}
                  placeholder="Taguig" className={INPUT} />
              </Field>
              <Field label="Province">
                <select value={form.province} onChange={e => set('province', e.target.value)} className={INPUT}>
                  <option value="">Select...</option>
                  {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
          </>}

          {step === 4 && <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input value={form.phone} onChange={e => set('phone', e.target.value)}
                  placeholder="+63 9XX XXX XXXX" className={INPUT} />
              </Field>
              <Field label="Contact Email">
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="info@court.com" className={INPUT} />
              </Field>
            </div>
            <Field label="Facebook Page">
              <input value={form.facebook} onChange={e => set('facebook', e.target.value)}
                placeholder="https://facebook.com/yourpage" className={INPUT} />
            </Field>
            <Field label="Instagram">
              <input value={form.instagram} onChange={e => set('instagram', e.target.value)}
                placeholder="@yourcourtname" className={INPUT} />
            </Field>
          </>}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex gap-3">
          {step > 1 && (
            <button onClick={back}
              className="flex-1 py-2.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              Back
            </button>
          )}
          {step < 4 ? (
            <button onClick={next}
              className="flex-1 py-2.5 rounded-lg text-sm bg-gray-900 text-white hover:bg-gray-700 cursor-pointer transition-colors flex items-center justify-center gap-2">
              Continue <ArrowRight size={14}/>
            </button>
          ) : (
            <button onClick={submit} disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm bg-gray-900 text-white hover:bg-gray-700 cursor-pointer transition-colors disabled:opacity-50">
              {loading ? 'Registering...' : 'Start Free Trial'}
            </button>
          )}
        </div>
      </div>

      <p className="text-[0.72rem] text-white/20 mt-6">
        Already registered?{' '}
        <Link href="/auth/signin" className="text-[#c8a84b] no-underline hover:underline">Sign in</Link>
      </p>
    </div>
  );
}