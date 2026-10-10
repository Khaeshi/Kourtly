function plainCourt(court) {
  return typeof court?.toObject === 'function' ? court.toObject() : court;
}

export function tenantCourtResponse(court) {
  const value = plainCourt(court);
  if (!value) return value;
  const { xendit, ...courtFields } = value;
  return {
    ...courtFields,
    ...(xendit ? { xendit: { status: xendit.status ?? '' } } : {}),
  };
}

export function superadminCourtResponse(court) {
  const value = plainCourt(court);
  if (!value) return value;
  const { xendit, ...courtFields } = value;
  return {
    ...courtFields,
    ...(xendit
      ? {
          xendit: {
            status: xendit.status ?? '',
            ...(xendit.subAccountId ? { subAccountId: xendit.subAccountId } : {}),
          },
        }
      : {}),
  };
}
