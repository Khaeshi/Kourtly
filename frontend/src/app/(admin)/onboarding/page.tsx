'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';

const INPUT = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-green-400 transition-colors";

const STEPS = [
  { id: 1, label: 'Court Info' },
  { id: 2, label: 'Location'   },
  { id: 3, label: 'Sports'     },
  { id: 4, label: 'Confirm'    },
];

export default function OnboardingPage() {
  const router              = useRouter();
  const { data: session, update } = useSession();
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [form, setForm] = useState({
    name:         '',
    slug:         '',
    adminEmail:   '',
    courtCount:   '4',
    sports:       ['badminton'] as string[],
    city:         '',
    province:     '',
    address:      '',
    phone:        '',
    facebook:     '',
  });

  // Pre-fill admin email from session
  useEffect(() => {
    if (session?.user?.email && !form.adminEmail) {
      setForm(p => ({ ...p, adminEmail: session.user.email! }));
    }
  }, [session?.user?.email]);

  const set = (k: keyof typeof form, v: any) =>
    setForm(p => ({ ...p, [k]: v }));

  // Auto-generate slug from name
  const setName = (v: string) => {
    const slug = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm(p => ({ ...p, name: v, slug }));
  };

  const toggleSport = (s: string) =>
    set('sports', form.sports.includes(s)
      ? form.sports.filter(x => x !== s)
      : [...form.sports, s]
    );

  const handleSubmit = async () => {
    if (!form.name || !form.adminEmail || !form.slug) {
      setError('Court name, slug, and admin email are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // 1. Register court
      const res = await fetch('/api/public/register-court', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name,
          slug:       form.slug,
          adminEmail: form.adminEmail,
          sports:     form.sports,
          courtCount: Number(form.courtCount),
          location: {
            city:     form.city,
            province: form.province,
            address:  form.address,
          },
          contact: {
            phone:    form.phone,
            facebook: form.facebook,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      // 2. Force session token refresh so courtId is picked up
      await update();

      // 3. Go to admin dashboard
      router.push('/admin');
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-green-700 flex items-center justify-center mx-auto mb-4">
          <div className="w-5 h-5 rounded-full bg-white opacity-90" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Set Up Your Court</h1>
        <p className="text-gray-500 text-sm">Your 14-day free trial starts now. No credit card required.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0 mb-8">
        {STEPS.map((s, i) => {
          const done   = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done   ? 'bg-green-600 text-white' :
                  active ? 'bg-gray-900 text-white' :
                           'bg-gray-100 text-gray-400'
                }`}>
                  {done ? <Check size={12} /> : s.id}
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 sm:w-10 h-px mx-2 ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-5">
            {error}
          </div>
        )}

        {/* Step 1 — Court Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Court Name <span className="text-red-500">*</span>
              </label>
              <input value={form.name} onChange={e => setName(e.target.value)}
                className={INPUT} placeholder="South City Badminton Club" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                URL Slug <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-green-400 transition-colors">
                <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-r border-gray-200 shrink-0">/book/</span>
                <input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1 px-3 py-2.5 text-sm text-gray-900 outline-none bg-white" placeholder="south-city-bc" />
              </div>
              <p className="text-[0.68rem] text-gray-400 mt-1">Your court's booking page URL</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Admin Email <span className="text-red-500">*</span>
              </label>
              <input type="email" value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)}
                className={INPUT} placeholder="you@example.com" />
              <p className="text-[0.68rem] text-green-600 mt-1">Defaulted to your signed-in email</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Number of Physical Courts
              </label>
              <div className="flex gap-2 flex-wrap">
                {['1','2','3','4','5','6','8'].map(n => (
                  <button key={n} type="button" onClick={() => set('courtCount', n)}
                    className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                      form.courtCount === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Location */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Street Address</label>
              <input value={form.address} onChange={e => set('address', e.target.value)}
                className={INPUT} placeholder="123 Court St." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">City</label>
                <input value={form.city} onChange={e => set('city', e.target.value)} className={INPUT} placeholder="Biñan" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Province</label>
                <input value={form.province} onChange={e => set('province', e.target.value)} className={INPUT} placeholder="Laguna" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Phone (optional)</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className={INPUT} placeholder="09XX XXX XXXX" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Facebook Page (optional)</label>
              <input value={form.facebook} onChange={e => set('facebook', e.target.value)}
                className={INPUT} placeholder="https://facebook.com/yourpage" />
            </div>
          </div>
        )}

        {/* Step 3 — Sports */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Sports Offered <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {['badminton', 'pickleball', 'tennis'].map(s => {
                  const selected = form.sports.includes(s);
                  const icons: Record<string, string> = { badminton: '🏸', pickleball: '🎾', tennis: '🎾' };
                  return (
                    <button key={s} type="button" onClick={() => toggleSport(s)}
                      className={`py-5 rounded-xl border-2 text-center cursor-pointer transition-all ${
                        selected ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      <div className="text-2xl mb-2">{icons[s]}</div>
                      <div className={`text-xs font-semibold capitalize ${selected ? 'text-green-700' : 'text-gray-500'}`}>{s}</div>
                      {selected && <div className="text-[0.6rem] text-green-500 mt-1">✓ Selected</div>}
                    </button>
                  );
                })}
              </div>
              {form.sports.length === 0 && (
                <p className="text-red-500 text-xs mt-2">Please select at least one sport.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Confirm */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              {[
                ['Court Name',  form.name],
                ['Booking URL', `/book/${form.slug}`],
                ['Admin Email', form.adminEmail],
                ['Courts',      `${form.courtCount} physical court${form.courtCount !== '1' ? 's' : ''}`],
                ['Sports',      form.sports.join(', ')],
                ['City',        form.city || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-start gap-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 shrink-0">{label}</span>
                  <span className="text-sm text-gray-700 text-right">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-green-800 text-sm font-medium mb-1">14-day free trial</p>
              <p className="text-green-600 text-xs">No credit card required. Full access to all features during trial.</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-5 border-t border-gray-100">
          <button onClick={() => { setStep(p => p - 1); setError(''); }}
            disabled={step === 1}
            className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-0 cursor-pointer transition-colors">
            ← Back
          </button>

          {step < 4 ? (
            <button
              onClick={() => {
                if (step === 1 && (!form.name || !form.adminEmail)) {
                  setError('Court name and admin email are required.');
                  return;
                }
                if (step === 3 && form.sports.length === 0) {
                  setError('Please select at least one sport.');
                  return;
                }
                setError('');
                setStep(p => p + 1);
              }}
              className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 cursor-pointer transition-colors">
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer transition-colors">
              {loading ? 'Creating...' : 'Launch My Court'} {!loading && <ArrowRight size={14} />}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        You can update all these details later in Court Settings.
      </p>
    </div>
  );
}