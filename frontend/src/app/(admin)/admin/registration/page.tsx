'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCourtRegistration,
  resubmitCourtRegistration,
  type CourtRegistrationPayload,
  type CourtRegistrationStatus,
} from '@/lib/api';

const SPORTS = ['badminton', 'pickleball', 'tennis'];
const inputClass = 'mt-1.5 w-full rounded-md border border-[var(--divider-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--line)]';

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function RegistrationStatusPage() {
  const [court, setCourt] = useState<CourtRegistrationStatus | null>(null);
  const [form, setForm] = useState<CourtRegistrationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCourt = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const current = await getCourtRegistration();
      setCourt(current);
      setForm({
        name: current.name,
        slug: current.slug,
        sports: current.sports ?? [],
        courtCount: current.courtCount,
        location: {
          address: current.location?.address ?? '',
          city: current.location?.city ?? '',
          province: current.location?.province ?? '',
          country: current.location?.country ?? 'Philippines',
          lat: Number(current.location?.lat),
          lng: Number(current.location?.lng),
        },
        contact: {
          phone: current.contactPerson?.phone ?? current.contact?.phone ?? '',
          email: current.contact?.email ?? '',
          facebook: current.contact?.facebook ?? '',
          instagram: current.contact?.instagram ?? '',
          website: current.contact?.website ?? '',
        },
        contactPerson: {
          name: current.contactPerson?.name ?? '',
          phone: current.contactPerson?.phone ?? current.contact?.phone ?? '',
        },
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load registration status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCourt();
  }, [loadCourt]);

  const submitResubmission = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.slug.trim() || !form.location.city.trim() ||
        !form.contactPerson.name.trim() || !form.contactPerson.phone.trim() ||
        !Number.isFinite(form.location.lat) || !Number.isFinite(form.location.lng) ||
        form.sports.length === 0 || !Number.isInteger(form.courtCount) || form.courtCount < 1) {
      setError('Complete the required court, location, sports, and contact fields before resubmitting.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await resubmitCourtRegistration(form);
      setCourt(result.court);
      setEditing(false);
      setNotice('Your updated details were submitted for review.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not resubmit your registration.');
    } finally {
      setSaving(false);
    }
  };

  const updateTopLevel = (key: 'name' | 'slug' | 'courtCount', value: string) => {
    setForm(current => current ? {
      ...current,
      [key]: key === 'courtCount' ? Number(value) : value,
    } : current);
  };

  const updateLocation = (key: keyof CourtRegistrationPayload['location'], value: string) => {
    setForm(current => current ? {
      ...current,
      location: {
        ...current.location,
        [key]: key === 'lat' || key === 'lng' ? Number(value) : value,
      },
    } : current);
  };

  const updateContact = (key: keyof CourtRegistrationPayload['contact'], value: string) => {
    setForm(current => current ? {
      ...current,
      contact: { ...current.contact, [key]: value },
      ...(key === 'phone'
        ? { contactPerson: { ...current.contactPerson, phone: value } }
        : {}),
    } : current);
  };

  const updateContactName = (value: string) => {
    setForm(current => current ? {
      ...current,
      contactPerson: { ...current.contactPerson, name: value },
    } : current);
  };

  const toggleSport = (sport: string) => {
    setForm(current => current ? {
      ...current,
      sports: current.sports.includes(sport)
        ? current.sports.filter(value => value !== sport)
        : [...current.sports, sport],
    } : current);
  };

  if (loading) {
    return <main className="w-full max-w-3xl"><p role="status">Loading registration status…</p></main>;
  }

  if (!court || !form) {
    return (
      <main className="w-full max-w-3xl">
        <h1 className="text-xl font-bold">Registration status</h1>
        {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
        <button type="button" className="mt-4 underline" onClick={() => void loadCourt(true)} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Try again'}
        </button>
      </main>
    );
  }

  if (court.registrationStatus === 'approved') {
    return (
      <main className="w-full max-w-3xl">
        <p className="ad-eyebrow">Registration status</p>
        <h1 className="mt-2 text-2xl font-bold">Your court is approved</h1>
        <p className="mt-3">You can continue setting up your hours, rates, and booking page.</p>
        <Link className="mt-5 inline-block underline" href="/admin">Go to dashboard</Link>
      </main>
    );
  }

  return (
    <main className="w-full max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="ad-eyebrow">Court registration</p>
          <h1 className="mt-2 text-2xl font-bold">
            {court.registrationStatus === 'pending'
              ? `We’re reviewing ${court.name}`
              : 'Your registration was not approved'}
          </h1>
          <p className="mt-2 text-sm text-[var(--line-dim)]">
            {court.registrationStatus === 'pending'
              ? 'Your details are with our team. You do not need to do anything else right now.'
              : 'Nothing was published. Review the reason, update your details, and send them again.'}
          </p>
        </div>
        <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => void loadCourt(true)} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-[var(--divider-strong)] bg-[var(--surface)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--line-dim)]">Status</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
            court.registrationStatus === 'pending'
              ? 'bg-amber-100 text-amber-900'
              : 'bg-red-100 text-red-900'
          }`}>
            {court.registrationStatus === 'pending' ? 'In review' : 'Not approved'}
          </span>
          <span className="text-sm text-[var(--line-dim)]">Submitted {displayDate(court.createdAt)}</span>
        </div>
        {court.registrationStatus === 'pending' && (
          <p className="mt-4 text-sm">Your 14-day trial begins after approval.</p>
        )}
        {court.registrationStatus === 'rejected' && (
          <div className="mt-4 border-l-4 border-red-500 bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide">Reason from our team</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{court.rejectionReason || 'No reason was provided.'}</p>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-lg border border-[var(--divider-strong)] p-5">
        <h2 className="font-semibold">Submitted details</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-[var(--line-dim)]">Court</dt><dd>{court.name}</dd></div>
          <div><dt className="text-[var(--line-dim)]">Booking link</dt><dd>/book/{court.slug}</dd></div>
          <div><dt className="text-[var(--line-dim)]">City</dt><dd>{[court.location.city, court.location.province].filter(Boolean).join(', ')}</dd></div>
          <div><dt className="text-[var(--line-dim)]">Contact</dt><dd>{court.contactPerson.name} · {court.contactPerson.phone}</dd></div>
        </dl>
      </div>

      {notice && <p role="status" className="mt-4 text-sm text-green-800">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      {court.registrationStatus === 'rejected' && !editing && (
        <button type="button" className="mt-5 rounded-md bg-[var(--ink)] px-4 py-2.5 text-sm text-white"
          onClick={() => { setError(''); setEditing(true); }}>
          Edit and resubmit
        </button>
      )}

      {editing && (
        <section className="mt-6 rounded-lg border border-[var(--divider-strong)] p-5">
          <h2 className="text-lg font-semibold">Update your registration</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Court name *
              <input className={inputClass} value={form.name} onChange={event => updateTopLevel('name', event.target.value)} />
            </label>
            <label className="text-sm">Booking link slug *
              <input className={inputClass} value={form.slug} onChange={event => updateTopLevel('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
            </label>
            <label className="text-sm">Court count *
              <input className={inputClass} type="number" min="1" step="1" value={form.courtCount}
                onChange={event => updateTopLevel('courtCount', event.target.value)} />
            </label>
            <label className="text-sm">City *
              <input className={inputClass} value={form.location.city} onChange={event => updateLocation('city', event.target.value)} />
            </label>
            <label className="text-sm">Province
              <input className={inputClass} value={form.location.province ?? ''} onChange={event => updateLocation('province', event.target.value)} />
            </label>
            <label className="text-sm">Street address
              <input className={inputClass} value={form.location.address ?? ''} onChange={event => updateLocation('address', event.target.value)} />
            </label>
            <label className="text-sm">Latitude *
              <input className={inputClass} type="number" step="any" value={form.location.lat}
                onChange={event => updateLocation('lat', event.target.value)} />
            </label>
            <label className="text-sm">Longitude *
              <input className={inputClass} type="number" step="any" value={form.location.lng}
                onChange={event => updateLocation('lng', event.target.value)} />
            </label>
            <label className="text-sm">Contact person *
              <input className={inputClass} value={form.contactPerson.name} onChange={event => updateContactName(event.target.value)} />
            </label>
            <label className="text-sm">Contact phone *
              <input className={inputClass} type="tel" value={form.contact.phone} onChange={event => updateContact('phone', event.target.value)} />
            </label>
            <label className="text-sm">Contact email
              <input className={inputClass} type="email" value={form.contact.email ?? ''} onChange={event => updateContact('email', event.target.value)} />
            </label>
            <label className="text-sm">Facebook page
              <input className={inputClass} value={form.contact.facebook ?? ''} onChange={event => updateContact('facebook', event.target.value)} />
            </label>
            <label className="text-sm">Instagram
              <input className={inputClass} value={form.contact.instagram ?? ''} onChange={event => updateContact('instagram', event.target.value)} />
            </label>
            <label className="text-sm">Website
              <input className={inputClass} value={form.contact.website ?? ''} onChange={event => updateContact('website', event.target.value)} />
            </label>
          </div>
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">Sports offered *</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPORTS.map(sport => (
                <button key={sport} type="button" aria-pressed={form.sports.includes(sport)}
                  onClick={() => toggleSport(sport)}
                  className={`rounded-md border px-3 py-2 text-sm capitalize ${
                    form.sports.includes(sport) ? 'bg-[var(--ink)] text-white' : ''
                  }`}>
                  {sport}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="rounded-md bg-[var(--ink)] px-4 py-2.5 text-sm text-white"
              onClick={() => void submitResubmission()} disabled={saving}>
              {saving ? 'Submitting…' : 'Resubmit for approval'}
            </button>
            <button type="button" className="rounded-md border px-4 py-2.5 text-sm"
              onClick={() => { setEditing(false); setError(''); }}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
