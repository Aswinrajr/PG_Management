import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '../components/ui';
import { useGet } from './api';
import { useAuth } from './auth';

export interface PropertySummary {
  _id: string;
  name: string;
  address?: { city?: string };
  beds: number;
  occupied: number;
  vacant: number;
  amenities: string[];
  rentRules: any;
}

const KEY = 'roomora.property';

const PropertyContext = createContext<{ propertyId: string; setPropertyId: (id: string) => void }>({ propertyId: '', setPropertyId: () => undefined });

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [propertyId, set] = useState(() => localStorage.getItem(KEY) ?? '');
  const value = useMemo(
    () => ({
      propertyId,
      setPropertyId: (id: string) => {
        localStorage.setItem(KEY, id);
        set(id);
      },
    }),
    [propertyId],
  );
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function useProperties() {
  const { orgPath, workspace } = useAuth();
  return useGet<PropertySummary[]>(workspace ? orgPath('/properties') : null);
}

/** The selected property, ignoring a stale id left over from another org. */
export function usePropertyFilter() {
  const { propertyId, setPropertyId } = useContext(PropertyContext);
  const { data } = useProperties();
  const valid = data?.some((p) => p._id === propertyId) ? propertyId : '';
  return { propertyId: valid, setPropertyId, query: valid ? `propertyId=${valid}` : '' };
}

export function PropertySwitcher() {
  const { t } = useTranslation();
  const { data } = useProperties();
  const { propertyId, setPropertyId } = usePropertyFilter();
  return (
    <Select aria-label={t('Property')} className="max-w-44 truncate" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
      <option value="">{t('All properties')}</option>
      {data?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
    </Select>
  );
}
