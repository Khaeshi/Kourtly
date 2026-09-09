'use client';
import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { sileo } from 'sileo';
import { Upload, X } from 'lucide-react';
import { useCapabilities } from '@/lib/entitlements';

const SPORTS    = ['badminton', 'pickleball', 'tennis'];
const AMENITIES = ['parking', 'shower', 'locker', 'cafeteria', 'wifi', 'aircon'];
const INPUT     = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-green-400 transition-colors";
const TIER_ORDER = ['basic', 'standard', 'premium', 'elite'] as const;
const TIER_INFO: Record<string, { label: string; description: string }> = {
  basic:    { label: 'Basic',    description: 'Reservations and court schedule blocking.' },
  standard: { label: 'Standard', description: 'Basic plus players and live queue management.' },
  premium:  { label: 'Premium',  description: 'Standard plus items, tabs, and billing.' },
  elite:    { label: 'Elite',    description: 'Premium plus priority support and future capabilities.' },
};

interface Court {
  _id: string; name: string; slug: string; description: string;
  sports: string[]; courtCount: number; logoUrl: string; photos: string[];
  amenities: string[];
  location: { address: string; city: string; province: string; };
  contact:  { phone: string; email: string; facebook: string; instagram: string; website: string; };
  subscription: { status: string; plan: string; amount: number; tier?: string; trialEnds: string; nextBilling: string | null; };
  settings: { timezone: string; currency: string; reservationFee?: number; hourlyRate?: number; weeklySummary?: boolean; };
  payout?: {
    recipientCode: string;
    accountName: string;
    channelCode: string;
    accountNumberLast4: string;
    isConfigured: boolean;
  };
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}

async function uploadImageToCloudinary(file: File): Promise<string> {
  const serverFd = new FormData();
  serverFd.append('file', file);
  const apiRes = await fetch('/api/upload/cloudinary', { method: 'POST', body: serverFd });
  if (apiRes.ok) {
    const j = (await apiRes.json()) as { secure_url?: string; error?: string };
    if (j.secure_url) return j.secure_url;
  }

  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET?.trim();
  if (!cloud || !preset) {
    let msg = 'Cloudinary is not configured.';
    try {
      const j = (await apiRes.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body: fd,
  });
  const data = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || 'Upload failed');
  }
  return data.secure_url;
}

export default function SettingsPage() {
  const { update: updateSession } = useSession();
  const capabilities = useCapabilities();
  const reportedTier = capabilities.currentTier ?? capabilities.tier;
  const activeTier = TIER_ORDER.includes(reportedTier as typeof TIER_ORDER[number])
    ? reportedTier as typeof TIER_ORDER[number]
    : 'basic';
  const [court,   setCourt]   = useState<Court | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState<string | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [downgradeTier, setDowngradeTier] = useState<string | null>(null);
  const [downgradeConfirmation, setDowngradeConfirmation] = useState('');
  const [downgradeStep, setDowngradeStep] = useState<1 | 2>(1);
  const logoInputRef  = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '', description: '', sports: [] as string[],
    courtCount: '4', amenities: [] as string[],
    address: '', city: '', province: '',
    phone: '', email: '', facebook: '', instagram: '', website: '',
    hourlyRate: '210',
    payoutRecipientCode: '',
    payoutAccountName: '',
    payoutChannelCode: '',
    payoutAccountNumber: '',
    weeklySummary: true,
  });

  useEffect(() => {
    fetch('/api/proxy/court/me')
      .then(r => r.json())
      .then(c => {
        setCourt(c);
        setForm({
          name:           c.name           ?? '',
          description:    c.description    ?? '',
          sports:         c.sports         ?? [],
          courtCount:     String(c.courtCount ?? 4),
          amenities:      c.amenities      ?? [],
          address:        c.location?.address  ?? '',
          city:           c.location?.city     ?? '',
          province:       c.location?.province ?? '',
          phone:          c.contact?.phone     ?? '',
          email:          c.contact?.email     ?? '',
          facebook:       c.contact?.facebook  ?? '',
          instagram:      c.contact?.instagram ?? '',
          website:        c.contact?.website   ?? '',
          hourlyRate:     String(c.settings?.hourlyRate ?? c.settings?.reservationFee ?? 210),
          payoutRecipientCode: c.payout?.recipientCode ?? '',
          payoutAccountName: c.payout?.accountName ?? '',
          payoutChannelCode: c.payout?.channelCode ?? '',
          payoutAccountNumber: '',
          weeklySummary: c.settings?.weeklySummary ?? true,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }));
  const toggleSport   = (s: string) => set('sports',    form.sports.includes(s)    ? form.sports.filter(x => x !== s)    : [...form.sports, s]);
  const toggleAmenity = (a: string) => set('amenities', form.amenities.includes(a) ? form.amenities.filter(x => x !== a) : [...form.amenities, a]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/court/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        form.name,
          description: form.description,
          sports:      form.sports,
          courtCount:  Number(form.courtCount),
          amenities:   form.amenities,
          location:    { address: form.address, city: form.city, province: form.province, country: 'Philippines' },
          contact:     { phone: form.phone, email: form.email, facebook: form.facebook, instagram: form.instagram, website: form.website },
          settings:    {
            hourlyRate: Number(form.hourlyRate),
            reservationFee: Number(form.hourlyRate), // keep legacy consumers aligned
            weeklySummary: Boolean(form.weeklySummary),
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      sileo.success({ title: 'Settings saved' });
      const updated = await res.json();
      setCourt(updated);

      if (form.payoutRecipientCode) {
        await fetch('/api/proxy/court/me/payout', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientCode: form.payoutRecipientCode,
            accountName: form.payoutAccountName,
            channelCode: form.payoutChannelCode,
            accountNumber: form.payoutAccountNumber,
          }),
        });
      }
    } catch {
      sileo.error({ title: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const startUpgrade = async () => {
    if (!upgradeTier) return;
    setUpgradeLoading(true);
    try {
      const response = await fetch('/api/proxy/court/me/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: upgradeTier }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start upgrade.');
      if (!data.paymentUrl) throw new Error('Payment provider did not return a checkout link.');
      window.location.assign(data.paymentUrl);
    } catch (err) {
      sileo.error({ title: 'Upgrade failed', description: err instanceof Error ? err.message : 'Could not start upgrade.' });
    } finally {
      setUpgradeLoading(false);
    }
  };

  const scheduleDowngrade = async () => {
    if (!downgradeTier) return;
    setUpgradeLoading(true);
    try {
      const response = await fetch('/api/proxy/court/me/subscription/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: downgradeTier, confirmation: downgradeConfirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not schedule downgrade.');
      sileo.success({ title: 'Downgrade scheduled', description: `Your current tier stays active until ${new Date(data.pendingTierEffectiveAt).toLocaleDateString()}.` });
      setDowngradeTier(null);
      setDowngradeConfirmation('');
      setDowngradeStep(1);
      window.location.reload();
    } catch (err) {
      sileo.error({ title: 'Downgrade failed', description: err instanceof Error ? err.message : 'Could not schedule downgrade.' });
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file);
      const logoRes = await fetch('/api/proxy/court/me/logo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: url }),
      });
      if (!logoRes.ok) {
        const err = await logoRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Could not save logo URL');
      }
      setCourt(c => c ? { ...c, logoUrl: url } : c);
      await updateSession();
      sileo.success({ title: 'Logo updated' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      sileo.error({ title: 'Upload failed', description: message });
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadImageToCloudinary(file);
        await fetch('/api/proxy/court/me/photos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', url }),
        });
        setCourt(c => c ? { ...c, photos: [...(c.photos ?? []), url] } : c);
      }
      sileo.success({ title: 'Photos uploaded' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      sileo.error({ title: 'Upload failed', description: message });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (url: string) => {
    await fetch('/api/proxy/court/me/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', url }),
    });
    setCourt(c => c ? { ...c, photos: c.photos.filter(p => p !== url) } : c);
  };

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">Loading...</div>;

  return (
    <div className="max-w-[760px] font-sans space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-5 border-b border-gray-100">
        <div>
          <p className="text-[0.72rem] font-medium tracking-[0.05em] uppercase text-gray-400 mb-1">Management</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Court Settings</h1>
        </div>
        <button onClick={save} disabled={saving}
          className="text-[0.82rem] font-medium bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50 border-none">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Branding */}
      <Section title="Branding">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
            {court?.logoUrl ? (
              <img src={court.logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <div className="w-8 h-8 bg-gray-200 rounded-lg" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Court Logo</p>
            <button onClick={() => logoInputRef.current?.click()} disabled={uploading}
              className="text-[0.72rem] border border-gray-200 rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors bg-white disabled:opacity-50 flex items-center gap-1.5">
              <Upload size={11} /> {uploading ? 'Uploading...' : 'Upload Logo'}
            </button>
            <p className="text-[0.65rem] text-gray-400 max-w-xs mt-1">
              Uses Cloudinary. Set <code className="text-gray-500">CLOUDINARY_CLOUD_NAME</code> +{' '}
              <code className="text-gray-500">CLOUDINARY_UPLOAD_PRESET</code> in{' '}
              <code className="text-gray-500">frontend/.env</code>, or the{' '}
              <code className="text-gray-500">NEXT_PUBLIC_CLOUDINARY_*</code> pair. Preset must allow unsigned uploads.
            </p>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </div>

        <Field label="Court Name *">
          <input value={form.name} onChange={e => set('name', e.target.value)} className={INPUT} />
        </Field>
        <Field label="Description" hint="Shown on the public listing page">
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={3} className={`${INPUT} resize-none`} />
        </Field>

        {/* Photos */}
        <div>
          <label className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-gray-500 block mb-2">Court Photos</label>
          <div className="grid grid-cols-4 gap-2">
            {(court?.photos ?? []).map(url => (
              <div key={url} className="relative aspect-square rounded-lg overflow-hidden group">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removePhoto(url)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none">
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
            <button onClick={() => photoInputRef.current?.click()} disabled={uploading}
              className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-gray-300 transition-colors bg-transparent disabled:opacity-50">
              <Upload size={16} className="text-gray-400" />
              <span className="text-[0.62rem] text-gray-400">Add Photo</span>
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
          </div>
        </div>
      </Section>

      {/* Sports & Courts */}
      <Section title="Sports & Courts">
        <Field label="Sports Offered">
          <div className="flex gap-2 flex-wrap">
            {SPORTS.map(s => (
              <button key={s} type="button" onClick={() => toggleSport(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer capitalize ${
                  form.sports.includes(s) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>{s}</button>
            ))}
          </div>
        </Field>
        <Field label="Number of Physical Courts">
          <div className="flex gap-2 flex-wrap">
            {['1','2','3','4','5','6','8','10'].map(n => (
              <button key={n} type="button" onClick={() => set('courtCount', n)}
                className={`w-11 h-11 rounded-lg text-sm font-semibold border transition-all cursor-pointer ${
                  form.courtCount === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>{n}</button>
            ))}
          </div>
        </Field>
        <Field label="Amenities">
          <div className="flex gap-2 flex-wrap">
            {AMENITIES.map(a => (
              <button key={a} type="button" onClick={() => toggleAmenity(a)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-all cursor-pointer capitalize ${
                  form.amenities.includes(a) ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>{a}</button>
            ))}
          </div>
        </Field>
        <Field label="Court Rate Per Hour (₱)" hint="Used in public booking computation">
          <input type="number" value={form.hourlyRate} onChange={e => set('hourlyRate', e.target.value)}
            className={`${INPUT} max-w-[160px]`} />
        </Field>
      </Section>

      {/* Location */}
      <Section title="Location">
        <Field label="Street Address">
          <input value={form.address} onChange={e => set('address', e.target.value)}
            placeholder="123 Court St." className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input value={form.city} onChange={e => set('city', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Province">
            <input value={form.province} onChange={e => set('province', e.target.value)} className={INPUT} />
          </Field>
        </div>
      </Section>

      {/* Contact */}
      <Section title="Contact Info">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input value={form.phone} onChange={e => set('phone', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INPUT} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Facebook">
            <input value={form.facebook} onChange={e => set('facebook', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Instagram">
            <input value={form.instagram} onChange={e => set('instagram', e.target.value)} className={INPUT} />
          </Field>
        </div>
        <Field label="Website">
          <input value={form.website} onChange={e => set('website', e.target.value)}
            placeholder="https://yourcourtname.com" className={INPUT} />
        </Field>
      </Section>

      <Section title="Payout Destination (Cocoart Recipient)">
        <p className="text-xs text-gray-500">
          Configure recipient details for reservation payout disbursements. Sensitive bank credentials are not stored here.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Recipient Code *" hint="Provided by Cocoart recipient setup">
            <input value={form.payoutRecipientCode} onChange={e => set('payoutRecipientCode', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Channel Code" hint="e.g. BDO, BPI, GCASH, MAYA">
            <input value={form.payoutChannelCode} onChange={e => set('payoutChannelCode', e.target.value)} className={INPUT} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Account Name">
            <input value={form.payoutAccountName} onChange={e => set('payoutAccountName', e.target.value)} className={INPUT} />
          </Field>
          <Field label="Account Number" hint="Stored as last 4 digits only">
            <input value={form.payoutAccountNumber} onChange={e => set('payoutAccountNumber', e.target.value)} className={INPUT} />
          </Field>
        </div>
        <p className="text-xs text-gray-400">
          Current: {court?.payout?.isConfigured ? `Configured (${court?.payout?.channelCode || 'N/A'} ••••${court?.payout?.accountNumberLast4 || '----'})` : 'Not configured'}
        </p>
      </Section>

      <Section title="Weekly Summary Email">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Send Monday summary email</p>
            <p className="text-xs text-gray-500">Receive a weekly analytics summary every Monday morning (Asia/Manila).</p>
          </div>
          <button
            type="button"
            onClick={() => set('weeklySummary', !form.weeklySummary)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              form.weeklySummary ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {form.weeklySummary ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </Section>

      {/* Subscription */}
      {court && (
        <Section title="Subscription">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Status',      value: court.subscription?.status ?? '—' },
              { label: 'Plan',        value: court.subscription?.plan ?? '—' },
              { label: 'Tier',        value: TIER_INFO[activeTier]?.label ?? 'Basic' },
              { label: 'Amount',      value: court.subscription?.amount ? `₱${court.subscription.amount.toLocaleString()}` : '—' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">{s.label}</p>
                <p className="text-sm font-medium text-gray-700 capitalize">{s.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[0.78rem] text-gray-500">{TIER_INFO[activeTier]?.description}</p>
          {capabilities.pendingTier && capabilities.pendingTierEffectiveAt && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Downgrade scheduled: {TIER_INFO[capabilities.pendingTier]?.label} starts on {new Date(capabilities.pendingTierEffectiveAt).toLocaleDateString()}. Your current tier remains active until then.
            </div>
          )}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Enabled modules</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['booking', 'Booking & scheduling'],
                ['queue', 'Queue management'],
                ['item_tabs', 'Item tabs'],
              ].map(([key, label]) => (
                <span key={key} className={`text-xs px-2.5 py-1 rounded-full border ${capabilities.modules[key as keyof typeof capabilities.modules] ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-400 bg-gray-50 border-gray-200'}`}>
                  {capabilities.modules[key as keyof typeof capabilities.modules] ? 'Enabled' : 'Locked'} · {label}
                </span>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Manage your tier</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TIER_ORDER.map(tier => {
                const currentIndex = TIER_ORDER.indexOf(activeTier as typeof TIER_ORDER[number]);
                const tierIndex = TIER_ORDER.indexOf(tier);
                const isCurrent = tier === activeTier;
                const isPending = tier === capabilities.pendingTier;
                return (
                <button key={tier} type="button" disabled={isCurrent || isPending} onClick={() => tierIndex > currentIndex ? setUpgradeTier(tier) : setDowngradeTier(tier)} className={`text-left p-3 rounded-lg border transition-colors ${isCurrent ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed' : isPending ? 'border-amber-200 bg-amber-50 text-amber-700 cursor-not-allowed' : tierIndex > currentIndex ? 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50' : 'border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50'}`}>
                  <span className="block text-sm font-semibold text-gray-800">{TIER_INFO[tier].label}</span>
                  <span className="block text-xs text-gray-500 mt-1">{TIER_INFO[tier].description}</span>
                  <span className={`block text-xs font-semibold mt-2 ${isCurrent ? 'text-gray-500' : isPending ? 'text-amber-700' : tierIndex > currentIndex ? 'text-green-700' : 'text-amber-700'}`}>
                    {isCurrent ? 'Current tier' : isPending ? 'Downgrade scheduled' : tierIndex > currentIndex ? 'Upgrade' : `Revert to ${TIER_INFO[tier].label}`}
                  </span>
                </button>
                );
              })}
            </div>
            {TIER_ORDER.indexOf(activeTier as typeof TIER_ORDER[number]) === TIER_ORDER.length - 1 && <p className="text-xs text-gray-400">You are on the highest available tier.</p>}
          </div>
        </Section>
      )}
      {upgradeTier && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-xl p-6">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-2">Upgrade confirmation</p>
            <h2 className="text-xl font-semibold text-gray-900">Move to {TIER_INFO[upgradeTier].label}?</h2>
            <p className="text-sm text-gray-500 mt-2">{TIER_INFO[upgradeTier].description}</p>
            <p className="text-sm text-gray-600 mt-4">You will be redirected to secure payment checkout. Your tier and modules change after payment is confirmed.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setUpgradeTier(null)} className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
              <button type="button" onClick={startUpgrade} disabled={upgradeLoading} className="px-3 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg disabled:opacity-50">
                {upgradeLoading ? 'Preparing checkout...' : 'Continue to payment'}
              </button>
            </div>
          </div>
        </div>
      )}
      {downgradeTier && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-xl p-6">
            {downgradeStep === 1 ? (
              <>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-amber-700 mb-2">Downgrade confirmation</p>
                <h2 className="text-xl font-semibold text-gray-900">Revert to {TIER_INFO[downgradeTier].label}?</h2>
                <p className="text-sm text-gray-600 mt-3">Your current {TIER_INFO[activeTier].label} access stays active until the end of your current billing period. The downgrade starts afterward.</p>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={() => setDowngradeTier(null)} className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                  <button type="button" onClick={() => setDowngradeStep(2)} className="px-3 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg">Continue</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-amber-700 mb-2">Final confirmation</p>
                <h2 className="text-xl font-semibold text-gray-900">Schedule {TIER_INFO[downgradeTier].label}</h2>
                <p className="text-sm text-gray-600 mt-3">Type <strong>{TIER_INFO[downgradeTier].label}</strong> below to confirm this scheduled downgrade.</p>
                <input value={downgradeConfirmation} onChange={e => setDowngradeConfirmation(e.target.value)} placeholder={TIER_INFO[downgradeTier].label} className="w-full mt-4 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400" />
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={() => { setDowngradeTier(null); setDowngradeConfirmation(''); setDowngradeStep(1); }} className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                  <button type="button" onClick={scheduleDowngrade} disabled={upgradeLoading || downgradeConfirmation !== TIER_INFO[downgradeTier].label} className="px-3 py-2 text-sm font-semibold text-white bg-amber-700 rounded-lg disabled:opacity-50">{upgradeLoading ? 'Scheduling...' : 'Confirm downgrade'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex justify-end pb-8">
        <button onClick={save} disabled={saving}
          className="text-[0.82rem] font-medium bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50 border-none">
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
}