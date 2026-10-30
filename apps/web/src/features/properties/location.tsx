import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, FormError, Input } from '../../components/ui';

export interface PgAddress {
  line1: string;
  city: string;
  state: string;
  pincode: string;
  geo?: { lat: number; lng: number };
}

export const EMPTY_ADDRESS: PgAddress = { line1: '', city: '', state: '', pincode: '' };

const GEOCODER = 'https://nominatim.openstreetmap.org';
const INDIA = { lat: 20.59, lng: 78.96 };
const STREET_ZOOM = 16;

const PIN = L.divIcon({
  className: '',
  html: '<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:#4F46E5;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(15,23,42,.4)"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

interface GeocodeResult {
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

function toAddress(result: GeocodeResult): PgAddress {
  const a = result.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  return {
    line1: [street, a.neighbourhood ?? a.suburb].filter(Boolean).join(', '),
    city: a.city ?? a.town ?? a.village ?? a.county ?? '',
    state: a.state ?? '',
    pincode: (a.postcode ?? '').replace(/\s/g, ''),
    geo: { lat: Number(result.lat), lng: Number(result.lon) },
  };
}

async function reverseGeocode(lat: number, lng: number) {
  const res = await fetch(`${GEOCODER}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`);
  if (!res.ok) throw new Error('lookup failed');
  return toAddress({ ...(await res.json()), lat: String(lat), lon: String(lng) });
}

async function searchAddress(text: string) {
  const res = await fetch(`${GEOCODER}/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=1&q=${encodeURIComponent(text)}`);
  if (!res.ok) throw new Error('lookup failed');
  const [first] = (await res.json()) as GeocodeResult[];
  return first ? toAddress(first) : null;
}

/** Address fields tied to a map. Typed fields always stay editable if the lookup fails. */
export function LocationPicker({ value, onChange, errors = {} }: { value: PgAddress; onChange: (next: PgAddress) => void; errors?: Record<string, string> }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const [busy, setBusy] = useState<'locate' | 'search' | null>(null);
  const [error, setError] = useState<Error | null>(null);

  /** A moved pin fills the address, but keeps what was typed if the lookup fails. */
  const placePin = async (lat: number, lng: number) => {
    latest.current.onChange({ ...latest.current.value, geo: { lat, lng } });
    try {
      const found = await reverseGeocode(lat, lng);
      const typed = latest.current.value;
      latest.current.onChange({
        line1: found.line1 || typed.line1,
        city: found.city || typed.city,
        state: found.state || typed.state,
        pincode: found.pincode || typed.pincode,
        geo: { lat, lng },
      });
    } catch {
      setError(new Error(t('Pin saved, but we could not read the address. Please type it.')));
    }
  };

  useEffect(() => {
    const start = latest.current.value.geo;
    const instance = L.map(box.current!).setView(start ?? INDIA, start ? STREET_ZOOM : 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(instance);
    instance.on('click', (e: L.LeafletMouseEvent) => void placePin(e.latlng.lat, e.latlng.lng));
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!value.geo) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker(value.geo, { icon: PIN, draggable: true }).addTo(instance);
      marker.current.on('dragend', () => {
        const { lat, lng } = marker.current!.getLatLng();
        void placePin(lat, lng);
      });
    } else {
      marker.current.setLatLng(value.geo);
    }
    if (!instance.getBounds().pad(-0.1).contains(value.geo) || instance.getZoom() < STREET_ZOOM) instance.setView(value.geo, STREET_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.geo?.lat, value.geo?.lng]);

  function useCurrentLocation() {
    if (!navigator.geolocation) return setError(new Error(t('This browser cannot share location. Search for the address instead.')));
    setBusy('locate');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        await placePin(coords.latitude, coords.longitude);
        setBusy(null);
      },
      (failure) => {
        setBusy(null);
        setError(new Error(failure.code === failure.PERMISSION_DENIED ? t('Location is blocked. Allow it in your browser, or search for the address.') : t('Could not find your location. Search for the address instead.')));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function findAddress() {
    const text = [value.line1, value.city, value.state, value.pincode].filter(Boolean).join(', ');
    if (!text) return setError(new Error(t('Type the address first.')));
    setBusy('search');
    setError(null);
    try {
      const found = await searchAddress(text);
      if (!found) throw new Error(t('Address not found. Try a nearby area, or tap the map.'));
      onChange({ ...value, geo: found.geo, city: value.city || found.city, state: value.state || found.state, pincode: value.pincode || found.pincode });
    } catch (err) {
      setError(err instanceof TypeError ? new Error(t('Could not reach the map service.')) : (err as Error));
    } finally {
      setBusy(null);
    }
  }

  const set = (key: 'line1' | 'city' | 'state' | 'pincode') => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-3">
      <Button variant="secondary" block loading={busy === 'locate'} onClick={useCurrentLocation}><LocateFixed className="size-4" aria-hidden /> {t('Use current location')}</Button>
      <div ref={box} role="application" aria-label={t('Map. Tap to place the PG, or drag the pin.')} className="isolate h-64 w-full rounded-md border border-border md:h-72" />
      <p className="text-xs text-text-muted">{value.geo ? t('Drag the pin if it is not exactly on your PG.') : t('Tap the map where your PG is.')}</p>
      <FormError error={error} />
      <Field label={t('Address')} error={errors.line1}><Input autoComplete="street-address" value={value.line1} onChange={set('line1')} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('City')} error={errors.city}><Input value={value.city} onChange={set('city')} /></Field>
        <Field label={t('State')} error={errors.state}><Input value={value.state} onChange={set('state')} /></Field>
        <Field label={t('Pincode')} error={errors.pincode}><Input inputMode="numeric" maxLength={6} value={value.pincode} onChange={set('pincode')} /></Field>
      </div>
      <Button variant="secondary" block loading={busy === 'search'} onClick={() => void findAddress()}><Search className="size-4" aria-hidden /> {t('Find this address on the map')}</Button>
    </div>
  );
}

export const mapLink = (geo?: { lat?: number | null; lng?: number | null } | null) =>
  geo?.lat != null && geo.lng != null ? `https://www.google.com/maps?q=${geo.lat},${geo.lng}` : null;
