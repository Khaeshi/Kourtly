'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Portal } from '@/app/components/ui/Modal';
import { StatusDot } from '@/app/components/ui/StatusDot';

// Hex classes on purpose: this page can render outside the admin shell, so it does not rely on shell tokens.
const INPUT = "w-full min-h-[44px] rounded-md border border-[#C9C3B3] bg-[#FBF9F3] px-3 py-2.5 text-[15px] text-[#0E2420] shadow-[inset_0_1px_2px_rgba(14,36,32,.1)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E2420]";
const INVALID = "!border-[#B8431F]";
const LABEL = "block mb-1.5 font-mono-data text-xs font-semibold uppercase tracking-[0.08em] text-[#5B6B66]";
const MUTED = "text-[#5B6B66]";
const ERR = "mt-1.5 text-[13px] text-[#B8431F]";
const CHIP = "min-h-[44px] rounded-md border text-sm font-medium cursor-pointer transition-[transform,color,border-color] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 motion-reduce:transition-none";

const STEPS = [
  { id: 1, label: 'Court Info' },
  { id: 2, label: 'Location'   },
  { id: 3, label: 'Sports'     },
  { id: 4, label: 'Confirm'    },
];

const NEXT = [
  { t: 'Send your details',            d: 'About 2 minutes.' },
  { t: 'We review your court',         d: 'Nothing is public until we approve it.' },
  { t: 'Set up and open for bookings', d: 'Hours, rates and your booking link.' },
];

function Joy({ sprite, size }: { sprite: string; size: number }) {
  // Decorative. Hidden on phones and if the sprite is missing.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/mascot/${sprite}.webp`} alt="" aria-hidden="true" width={size} height={Math.round(size * 0.955)}
      className="hidden md:block mx-auto" onError={e => { e.currentTarget.style.display = 'none'; }} />
  );
}

function Frame({ side, children }: { side: React.ReactNode; children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0E2420]">
        <div className="min-h-full flex items-start justify-center sm:p-8 lg:p-12">
          <div className="w-full max-w-[1040px] grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] overflow-hidden bg-[#F4F0E6] text-[#0E2420] sm:rounded-3xl shadow-[-12px_0_32px_rgba(0,0,0,.38),0_0_0_1px_rgba(245,241,232,.05),inset_0_1px_0_rgba(255,255,255,.7)]">
            <div className="bg-[#E8E3D4] px-5 py-6 sm:px-9 sm:py-10 flex flex-col gap-5">{side}</div>
            <div className="px-5 py-6 sm:px-11 sm:py-10 min-w-0">{children}</div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default function OnboardingPage() {
  const { data: session } = useSession();
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pasted, setPasted] = useState('');

  const [form, setForm] = useState({
    name:         '',
    slug:         '',
    courtCount:   '4',
    sports:       ['badminton'] as string[],
    city:         '',
    province:     '',
    address:      '',
    lat:          '',
    lng:          '',
    contactName:  '',
    phone:        '',
    facebook:     '',
  });

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

  // UX shortcut only: "14.5995, 120.9842" fills both coordinate fields.
  const applyPasted = (v: string) => {
    setPasted(v);
    const m = v.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) { set('lat', m[1]); set('lng', m[2]); }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.slug) {
      setError('Court name and slug are required.');
      return;
    }
    if (!form.city || form.lat === '' || form.lng === '' ||
        !Number.isFinite(Number(form.lat)) || !Number.isFinite(Number(form.lng))) {
      setError('City, latitude, and longitude are required.');
      setStep(2);
      return;
    }
    if (!form.contactName.trim() || !form.phone.trim()) {
      setError('Contact person and phone are required.');
      setStep(2);
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
          sports:     form.sports,
          courtCount: Number(form.courtCount),
          location: {
            city:     form.city,
            province: form.province,
            address:  form.address,
            lat:      Number(form.lat),
            lng:      Number(form.lng),
          },
          contact: {
            phone:    form.phone,
            facebook: form.facebook,
          },
          contactPerson: {
            name: form.contactName.trim(),
            phone: form.phone.trim(),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  // Which problem is the message about? Used to show it next to the field instead of in a banner.
  const nameMissing  = !!error && step === 1 && !form.name;
  const geoBad       = form.lat === '' || form.lng === '' || !Number.isFinite(Number(form.lat)) || !Number.isFinite(Number(form.lng));
  const cityMissing  = !!error && step === 2 && !form.city;
  const geoMissing   = !!error && step === 2 && geoBad;
  const contactMissing = !!error && step === 2 && !form.contactName.trim();
  const phoneMissing = !!error && step === 2 && !form.phone.trim();
  const sportMissing = !!error && step === 3 && form.sports.length === 0;
  const showBanner   = !!error && !nameMissing && !cityMissing && !geoMissing &&
    !contactMissing && !phoneMissing && !sportMissing;

  const side = (sprite: string, title: string, lead: string, now: number) => (
    <>
      <p className="font-bold text-[22px] tracking-tight">Kourtly</p>
      <Joy sprite={sprite} size={150} />
      <div>
        <h1 className="font-display text-[2.4rem]">{title}</h1>
        <p className={`${MUTED} mt-2.5`}>{lead}</p>
      </div>
      <div className="hidden sm:block">
        <p className="ad-eyebrow mb-1">What happens next</p>
        {NEXT.map((n, i) => (
          <div key={n.t} className="flex gap-3.5 items-start py-2.5">
            <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center font-mono-data text-xs font-bold border-2 ${
              i < now ? 'bg-[#1F8A7A] border-[#1F8A7A] text-white' : i === now ? 'bg-[#0E2420] border-[#0E2420] text-[#F5F1E8]' : 'border-[#8A9A94] text-[#5B6B66]'
            }`}>{i < now ? '✓' : i + 1}</span>
            <div><b>{n.t}</b><p className={`${MUTED} text-sm`}>{n.d}</p></div>
          </div>
        ))}
      </div>
    </>
  );

  if (submitted) {
    return (
      <Frame side={side('state_cheer', 'Almost there', 'Your details are with our team. You do not need to do anything else right now.', 1)}>
        <p className="ad-eyebrow">Status</p>
        <h2 className="text-[26px] font-bold mt-1.5 mb-2">Registration submitted</h2>
        <p className="max-w-lg">
          Your court is awaiting approval. Your 14-day trial will begin after a superadmin approves it.
        </p>
        <div className="mt-6 border-t-2 border-[#0E2420]">
          {[['Court', form.name], ['Booking link', `/book/${form.slug}`], ['City', form.city || '—'],
            ['Contact person', form.contactName], ['Contact phone', form.phone]].map(([a, b]) => (
            <div key={a} className="flex justify-between gap-4 py-2.5 border-b border-[#E1DBCB]">
              <span className={MUTED}>{a}</span><span className="text-right">{b}</span>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  const current = STEPS[step - 1];

  return (
    <Frame side={side('gaze_c', 'Register your court', 'Tell us the basics. It takes about two minutes and we review every court before it goes live.', 0)}>
      {/* Step indicator */}
      <div className="mb-6">
        <p className="ad-eyebrow">Step {step} of {STEPS.length} · {current.label}</p>
        <div className="flex gap-1.5 mt-3" role="list" aria-label="Progress">
          {STEPS.map(s => (
            <span key={s.id} role="listitem" aria-current={s.id === step ? 'step' : undefined}
              className={`h-1.5 flex-1 rounded-full ${s.id < step ? 'bg-[#1F8A7A]' : s.id === step ? 'bg-[#0E2420]' : 'bg-[#E1DBCB]'}`} />
          ))}
        </div>
      </div>

      {showBanner && (
        <p role="alert" className="mb-5 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">{error}</p>
      )}

      {/* Step 1 — Court Info */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label htmlFor="ob-name" className={LABEL}>Court name *</label>
            <input id="ob-name" value={form.name} onChange={e => setName(e.target.value)}
              aria-invalid={nameMissing}
              className={`${INPUT} ${nameMissing ? INVALID : ''}`} placeholder="South City Badminton Club" />
            {nameMissing && <p className={ERR}>Enter your court name.</p>}
          </div>
          <div>
            <label htmlFor="ob-slug" className={LABEL}>Your booking link *</label>
            <div className="flex items-stretch">
              <span className={`flex items-center px-3 rounded-l-md border border-r-0 border-[#C9C3B3] bg-[#EDE8D8] font-mono-data text-[13px] ${MUTED}`}>/book/</span>
              <input id="ob-slug" value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className={`${INPUT} !rounded-l-none`} placeholder="south-city-bc" />
            </div>
            <p className={`${MUTED} text-[13px] mt-1.5`}>Your court’s booking page address. Made from the name, and you can edit it.</p>
          </div>
          <div>
            <label htmlFor="ob-email" className={LABEL}>Admin email</label>
            <input id="ob-email" type="email" value={session?.user?.email || ''} readOnly
              className={`${INPUT} opacity-70`} />
            <p className="mt-1.5 text-[13px] text-[#1F8A7A]">Your signed-in account will be linked as the court admin.</p>
          </div>
          <div>
            <p className={LABEL}>Number of physical courts</p>
            <div className="flex gap-2 flex-wrap">
              {['1','2','3','4','5','6','8'].map(n => (
                <button key={n} type="button" aria-pressed={form.courtCount === n} onClick={() => set('courtCount', n)}
                  className={`${CHIP} w-11 font-mono-data ${form.courtCount === n ? 'bg-[#0E2420] border-[#0E2420] text-[#F5F1E8]' : 'bg-[#FBF9F3] border-[#C9C3B3] hover:border-[#0E2420]'}`}>{n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — Location */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label htmlFor="ob-addr" className={LABEL}>Street address</label>
            <input id="ob-addr" value={form.address} onChange={e => set('address', e.target.value)}
              className={INPUT} placeholder="123 Court St." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ob-city" className={LABEL}>City *</label>
              <input id="ob-city" value={form.city} onChange={e => set('city', e.target.value)} aria-invalid={cityMissing}
                className={`${INPUT} ${cityMissing ? INVALID : ''}`} placeholder="Biñan" />
              {cityMissing && <p className={ERR}>Enter your city.</p>}
            </div>
            <div>
              <label htmlFor="ob-prov" className={LABEL}>Province</label>
              <input id="ob-prov" value={form.province} onChange={e => set('province', e.target.value)} className={INPUT} placeholder="Laguna" />
            </div>
          </div>

          <div className="border-t border-[#E1DBCB] pt-5">
            <p className="font-bold">Pin your court on the map</p>
            <p className={`${MUTED} text-sm mt-0.5 mb-3`}>On Google Maps, press and hold your court, then copy the two numbers shown at the top (for example 14.5995, 120.9842).</p>
            <label htmlFor="ob-paste" className={LABEL}>Paste both numbers (shortcut)</label>
            <input id="ob-paste" value={pasted} onChange={e => applyPasted(e.target.value)} className={INPUT} placeholder="14.5995, 120.9842" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="ob-lat" className={LABEL}>Latitude *</label>
                <input id="ob-lat" type="number" inputMode="decimal" step="any" value={form.lat} onChange={e => set('lat', e.target.value)}
                  aria-invalid={geoMissing} className={`${INPUT} font-mono-data ${geoMissing && (form.lat === '' || !Number.isFinite(Number(form.lat))) ? INVALID : ''}`} placeholder="14.5995" />
              </div>
              <div>
                <label htmlFor="ob-lng" className={LABEL}>Longitude *</label>
                <input id="ob-lng" type="number" inputMode="decimal" step="any" value={form.lng} onChange={e => set('lng', e.target.value)}
                  aria-invalid={geoMissing} className={`${INPUT} font-mono-data ${geoMissing && (form.lng === '' || !Number.isFinite(Number(form.lng))) ? INVALID : ''}`} placeholder="120.9842" />
              </div>
            </div>
            {geoMissing && <p className={ERR}>Enter both numbers so players can find you on the map.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#E1DBCB] pt-5">
            <div className="sm:col-span-2">
              <label htmlFor="ob-contact-name" className={LABEL}>Contact person *</label>
              <input id="ob-contact-name" value={form.contactName} onChange={e => set('contactName', e.target.value)}
                aria-invalid={contactMissing} autoComplete="name" className={`${INPUT} ${contactMissing ? INVALID : ''}`}
                placeholder="Juan Dela Cruz" />
              {contactMissing && <p className={ERR}>Enter the name of the person we can contact.</p>}
            </div>
            <div>
              <label htmlFor="ob-phone" className={LABEL}>Contact phone *</label>
              <input id="ob-phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                aria-invalid={phoneMissing} autoComplete="tel"
                className={`${INPUT} ${phoneMissing ? INVALID : ''}`} placeholder="09XX XXX XXXX" />
              {phoneMissing && <p className={ERR}>Enter a contact phone number.</p>}
            </div>
            <div>
              <label htmlFor="ob-fb" className={LABEL}>Facebook page (optional)</label>
              <input id="ob-fb" value={form.facebook} onChange={e => set('facebook', e.target.value)}
                className={INPUT} placeholder="https://facebook.com/yourpage" />
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Sports */}
      {step === 3 && (
        <div>
          <p className={LABEL}>Sports offered *</p>
          <div className="flex gap-2 flex-wrap">
            {['badminton', 'pickleball', 'tennis'].map(s => {
              const selected = form.sports.includes(s);
              return (
                <button key={s} type="button" aria-pressed={selected} onClick={() => toggleSport(s)}
                  className={`${CHIP} px-6 capitalize ${selected ? 'bg-[#0E2420] border-[#0E2420] text-[#F5F1E8]' : 'bg-[#FBF9F3] border-[#C9C3B3] hover:border-[#0E2420]'}`}>
                  {s}
                </button>
              );
            })}
          </div>
          {sportMissing && <p className={ERR}>Choose at least one sport.</p>}
        </div>
      )}

      {/* Step 4 — Confirm */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="border-t-2 border-[#0E2420]">
            {[
              ['Court Name',  form.name],
              ['Booking URL', `/book/${form.slug}`],
              ['Admin Email', session?.user?.email || '—'],
              ['Courts',      `${form.courtCount} physical court${form.courtCount !== '1' ? 's' : ''}`],
              ['Sports',      form.sports.join(', ')],
              ['City',        form.city || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-start gap-4 py-2.5 border-b border-[#E1DBCB]">
                <span className="ad-eyebrow shrink-0">{label}</span>
                <span className="text-sm text-right break-words min-w-0">{value}</span>
              </div>
            ))}
          </div>
          <div>
            <StatusDot tone="ok"><b>14-day free trial after approval</b></StatusDot>
            <p className={`${MUTED} text-sm mt-1`}>No credit card required. The trial starts when your registration is approved.</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between gap-3 mt-8 pt-5 border-t border-[#E1DBCB]">
        <Button v="ghost" className={step === 1 ? 'invisible' : ''} disabled={step === 1}
          onClick={() => { setStep(p => p - 1); setError(''); }}>
          ← Back
        </Button>

        {step < 4 ? (
          <Button v="primary"
            onClick={() => {
              if (step === 1 && !form.name) {
                setError('Court name is required.');
                return;
              }
              if (step === 2 && (!form.city || form.lat === '' || form.lng === '' ||
                  !Number.isFinite(Number(form.lat)) || !Number.isFinite(Number(form.lng)))) {
                setError('City, latitude, and longitude are required.');
                return;
              }
              if (step === 2 && (!form.contactName.trim() || !form.phone.trim())) {
                setError('Contact person and phone are required.');
                return;
              }
              if (step === 3 && form.sports.length === 0) {
                setError('Please select at least one sport.');
                return;
              }
              setError('');
              setStep(p => p + 1);
            }}>
            Continue <ArrowRight size={14} />
          </Button>
        ) : (
          <Button v="primary" onClick={handleSubmit} loading={loading}>
            {loading ? 'Submitting...' : <>Submit for approval <ArrowRight size={14} /></>}
          </Button>
        )}
      </div>

      <p className={`${MUTED} text-sm mt-4`}>
        You can update all these details later in Court Settings.
      </p>
    </Frame>
  );
}
