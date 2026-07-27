'use client';
import { useMemo, useState } from 'react';
import {
  Map,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MapControls,
} from '@/app/components/ui/mapcn-map-arc';
import CourtMapModal, { type CourtMapItem } from './CourtMapModal';

/** Fallback coordinates for common PH cities when courts lack stored lat/lng */
const CITY_COORDS: Record<string, [number, number]> = {
  manila: [120.9842, 14.5995],
  makati: [121.0244, 14.5547],
  quezon: [121.0437, 14.676],
  pasig: [121.085, 14.5764],
  taguig: [121.0509, 14.5176],
  mandaluyong: [121.0365, 14.5832],
  paranaque: [121.0198, 14.4793],
  laspinas: [120.9822, 14.45],
  muntinlupa: [121.0223, 14.4081],
  caloocan: [120.9667, 14.65],
  cebu: [123.8854, 10.3157],
  davao: [125.6128, 7.0731],
};

function resolveCoords(court: CourtMapItem): [number, number] | null {
  const lat = court.location?.coordinates?.lat;
  const lng = court.location?.coordinates?.lng;
  if (lat != null && lng != null) return [lng, lat];

  const city = (court.location?.city ?? '').toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (city.includes(key)) return coords;
  }
  return null;
}

interface CourtsGlobeMapProps {
  courts: CourtMapItem[];
}

export default function CourtsGlobeMap({ courts }: CourtsGlobeMapProps) {
  const [selected, setSelected] = useState<CourtMapItem | null>(null);

  const mappable = useMemo(
    () =>
      courts
        .map((court) => ({ court, coords: resolveCoords(court) }))
        .filter((entry): entry is { court: CourtMapItem; coords: [number, number] } => entry.coords != null),
    [courts],
  );

  if (mappable.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-[320px] border border-dashed border-[var(--divider)] text-[var(--line-dim)] text-sm text-center px-6"
        style={{ borderRadius: 'var(--r-block)' }}
      >
        Map pins appear when courts add a location or city.
      </div>
    );
  }

  const center = mappable[0].coords;

  return (
    <>
      <div
        className="h-[380px] overflow-hidden border border-[var(--divider)]"
        style={{ borderRadius: 'var(--r-block)' }}
      >
        <Map
          center={center}
          zoom={mappable.length === 1 ? 10 : 5.5}
          theme="dark"
          projection={{ type: 'globe' }}
          className="h-full w-full"
        >
          <MapControls showZoom showLocate position="bottom-right" />
          {mappable.map(({ court, coords }) => (
            <MapMarker
              key={court._id}
              longitude={coords[0]}
              latitude={coords[1]}
              onClick={() => setSelected(court)}
            >
              <MarkerContent>
                <button
                  type="button"
                  className="size-3 rounded-full border-2 border-[var(--line)] bg-[var(--amber)] shadow-md cursor-pointer"
                  aria-label={`View ${court.name}`}
                />
                <MarkerLabel
                  position="top"
                  className="bg-[var(--teal-mid)]/90 text-[var(--line)] rounded-sm px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm border border-[var(--divider)]"
                >
                  {court.name}
                </MarkerLabel>
              </MarkerContent>
            </MapMarker>
          ))}
        </Map>
      </div>

      <CourtMapModal court={selected} onClose={() => setSelected(null)} />
    </>
  );
}
