const SUPPORTED_SPORTS = new Set(['badminton', 'pickleball', 'tennis']);

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function coordinate(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCourtRegistration(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const location = input.location && typeof input.location === 'object' ? input.location : {};
  const contact = input.contact && typeof input.contact === 'object' ? input.contact : {};
  const contactPerson = input.contactPerson && typeof input.contactPerson === 'object'
    ? input.contactPerson
    : {};

  const name = trimmedString(input.name);
  const slug = trimmedString(input.slug).toLowerCase();
  const city = trimmedString(location.city);
  const lat = coordinate(location.lat);
  const lng = coordinate(location.lng);
  const contactName = trimmedString(contactPerson.name);
  const contactPhone = trimmedString(contactPerson.phone);
  const sports = input.sports === undefined ? ['badminton'] : input.sports;
  const courtCount = input.courtCount === undefined ? 4 : Number(input.courtCount);

  if (!name || !slug) return { error: 'name and slug are required.' };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: 'slug must contain lowercase letters, numbers, and single hyphens only.' };
  }
  if (!city || lat === null || lng === null) {
    return { error: 'location.city, location.lat, and location.lng are required.' };
  }
  if (!contactName || !contactPhone) {
    return { error: 'contactPerson.name and contactPerson.phone are required.' };
  }
  if (!Array.isArray(sports) || sports.length === 0 || sports.some(sport => !SUPPORTED_SPORTS.has(sport))) {
    return { error: 'sports must contain at least one supported sport.' };
  }
  if (!Number.isInteger(courtCount) || courtCount < 1) {
    return { error: 'courtCount must be a positive whole number.' };
  }

  return {
    value: {
      name,
      slug,
      sports,
      courtCount,
      location: {
        address: trimmedString(location.address),
        city,
        province: trimmedString(location.province),
        country: trimmedString(location.country) || 'Philippines',
        lat,
        lng,
        coordinates: location.coordinates,
      },
      contact: {
        phone: contactPhone,
        email: trimmedString(contact.email),
        facebook: trimmedString(contact.facebook),
        instagram: trimmedString(contact.instagram),
        website: trimmedString(contact.website),
      },
      contactPerson: { name: contactName, phone: contactPhone },
    },
  };
}
