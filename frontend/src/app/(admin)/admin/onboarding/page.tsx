'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Check, ChevronRight, ArrowRight } from 'lucide-react';

const SPORTS    = ['badminton', 'pickleball', 'tennis'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TIMES     = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`);

const INPUT = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-green-400 transition-colors";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-gray-500">{label}</label>
      {children}
      {hint && <p className="text-[0.68rem] text-gray-400">{hint}</p>}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [profile, setProfile] = useState({
    name: '', description: '', sports: ['badminton'] as string[], courtCount: '4',
  });
  const [hours, setHours] = useState(
    DAY_NAMES.map((_, i) => ({ dayOfWeek: i, isClosed: i === 1, openTime: '09:00', closeTime: '22:00' }))
  );
  const [contact, setContact] = useState({
    phone: '', email: '', facebook: '', instagram: '', website: '',
    address: '', city: '', province: '',
  });

  const setP = (k: keyof typeof profile, v: any) => setProfile(p => ({ ...p, [k]: v }));
  const setC = (k: keyof typeof contact, v: string) => setContact(p => ({ ...p, [k]: v }));
  const toggleSport = (s: string) => setProfile(p => ({
    ...p, sports: p.sports.includes(s) ? p.sports.filter(x => x !== s) : [...p.sports, s],
  }));
  const updateHour = (i: number, k: string, v: any) =>
    setHours(h => h.map((d, idx) => idx === i ? { ...d, [k]: v } : d));

  const STEPS = ['Profile', 'Hours', 'Contact & Location', 'Done'];

  const saveStep = async () => {
    setLoading(true); setError(null);
    try {
      if (step === 1) {
        const res = await fetch('/api/proxy/court/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:        profile.name,
            description: profile.description,
            sports:      profile.sports,
            courtCount:  Number(profile.courtCount),
          }),
        });
        if (!res.ok) throw new Error('Failed to save profile');
      }
      if (step === 2) {
        await Promise.all(hours.map(h =>
          fetch(`/api/proxy/schedule/rules/${h.dayOfWeek}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isClosed: h.isClosed, openTime: h.openTime, closeTime: h.closeTime }),
          })
        ));
      }
      if (step === 3) {
        const res = await fetch('/api/proxy/court/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact:  { phone: contact.phone, email: contact.email, facebook: contact.facebook, instagram: contact.instagram, website: contact.website },
            location: { address: contact.address, city: contact.city, province: contact.province, country: 'Philippines' },
          }),
        });
        if (!res.ok) throw new Error('Failed to save contact');

        // Mark onboarding complete
        await fetch('/api/proxy/court/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onboardingComplete: true }),
        });
      }
      setStep(s => s + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (step === 4) return (
    <div className="max-w-[480px] mx-auto font-sans py-16 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <Check size={28} className="text-green-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">All set!</h1>
      <p className="text-gray-500 text-sm mb-8 leading-relaxed">
        Your court is configured. You can update any of these settings later from the Settings page.
      </p>
      <button onClick={() => router.push('/admin')}
        className="bg-gray-900 text-white px-8 py-3 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors cursor-pointer border-none">
        Go to Dashboard
      </button>
    </div>
  );

  return (
    <div className="max-w-[640px] mx-auto font-sans">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-gray-100">
        <p className="text-[0.72rem] uppercase tracking-[0.05em] text-gray-400 mb-1">Setup</p>
        <h1 className="text-2xl font-bold text-gray-900">Welcome! Let's set up your court</h1>
        <p className="text-sm text-gray-400 mt-1">This takes about 2 minutes</p>
        <div className="flex items-center gap-2 mt-5">
          {STEPS.slice(0,3).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-bold transition-colors ${
                  i+1 < step ? 'bg-green-600 text-white' : i+1 === step ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {i+1 < step ? <Check size={10}/> : i+1}
                </div>
                <span className={`text-[0.72rem] font-medium hidden sm:inline ${i+1 === step ? 'text-gray-900' : 'text-gray-400'}`}>{s}</span>
              </div>
              {i < 2 && <ChevronRight size={12} className="text-gray-300 shrink-0"/>}
            </div>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-[0.78rem] text-red-700 mb-5">{error}</div>}

      {/* Step 1 — Profile */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
          <Field label="Court Name *">
            <input value={profile.name} onChange={e => setP('name', e.target.value)}
              placeholder="South City Badminton Court" className={INPUT} />
          </Field>
          <Field label="Description" hint="Shown on the public listing page">
            <textarea value={profile.description} onChange={e => setP('description', e.target.value)}
              placeholder="Tell players about your venue, facilities, and vibe..."
              rows={3}
              className={`${INPUT} resize-none`} />
          </Field>
          <Field label="Sports Offered *">
            <div className="flex gap-2 flex-wrap">
              {SPORTS.map(s => (
                <button key={s} type="button" onClick={() => toggleSport(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer capitalize ${
                    profile.sports.includes(s) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>{s}</button>
              ))}
            </div>
          </Field>
          <Field label="Number of Physical Courts">
            <div className="flex gap-2 flex-wrap">
              {['1','2','3','4','5','6','8','10'].map(n => (
                <button key={n} type="button" onClick={() => setP('courtCount', n)}
                  className={`w-11 h-11 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                    profile.courtCount === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>{n}</button>
              ))}
            </div>
          </Field>
        </div>
      )}

      {/* Step 2 — Hours */}
      {step === 2 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Operating Hours</p>
            <p className="text-xs text-gray-400 mt-0.5">Set your default open hours per day</p>
          </div>
          <div className="divide-y divide-gray-50">
            {hours.map((h, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4 flex-wrap">
                <div className="w-24 shrink-0 text-sm font-medium text-gray-700">{DAY_NAMES[i]}</div>
                <div className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${h.isClosed ? 'bg-red-400' : 'bg-green-400'}`}
                  onClick={() => updateHour(i, 'isClosed', !h.isClosed)}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${h.isClosed ? 'translate-x-0.5' : 'translate-x-4'}`} />
                </div>
                <span className={`text-xs font-medium ${h.isClosed ? 'text-red-500' : 'text-green-600'}`}>
                  {h.isClosed ? 'Closed' : 'Open'}
                </span>
                {!h.isClosed && (
                  <div className="flex items-center gap-2">
                    <select value={h.openTime} onChange={e => updateHour(i, 'openTime', e.target.value)}
                      className="bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 outline-none">
                      {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-xs text-gray-400">to</span>
                    <select value={h.closeTime} onChange={e => updateHour(i, 'closeTime', e.target.value)}
                      className="bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 outline-none">
                      {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Contact */}
      {step === 3 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={contact.phone} onChange={e => setC('phone', e.target.value)}
                placeholder="+63 9XX XXX XXXX" className={INPUT} />
            </Field>
            <Field label="Contact Email">
              <input type="email" value={contact.email} onChange={e => setC('email', e.target.value)}
                placeholder="info@court.com" className={INPUT} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Facebook">
              <input value={contact.facebook} onChange={e => setC('facebook', e.target.value)}
                placeholder="https://facebook.com/page" className={INPUT} />
            </Field>
            <Field label="Instagram">
              <input value={contact.instagram} onChange={e => setC('instagram', e.target.value)}
                placeholder="@yourcourtname" className={INPUT} />
            </Field>
          </div>
          <Field label="Street Address">
            <input value={contact.address} onChange={e => setC('address', e.target.value)}
              placeholder="123 Court St." className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <input value={contact.city} onChange={e => setC('city', e.target.value)}
                placeholder="Taguig" className={INPUT} />
            </Field>
            <Field label="Province">
              <input value={contact.province} onChange={e => setC('province', e.target.value)}
                placeholder="Metro Manila" className={INPUT} />
            </Field>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-3 mt-6">
        {step > 1 && (
          <button onClick={() => setStep(s => s - 1)}
            className="flex-1 py-2.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
            Back
          </button>
        )}
        <button onClick={saveStep} disabled={loading}
          className="flex-1 py-2.5 rounded-lg text-sm bg-gray-900 text-white hover:bg-gray-700 cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? 'Saving...' : step === 3 ? 'Finish Setup' : 'Save & Continue'}
          {!loading && <ArrowRight size={14}/>}
        </button>
      </div>

      <button onClick={() => router.push('/admin')}
        className="w-full mt-3 py-2 text-xs text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none">
        Skip for now — I'll set this up later
      </button>
    </div>
  );
}