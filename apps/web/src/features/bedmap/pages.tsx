import { BedSingle, CalendarClock, LogOut, PencilRuler, Snowflake, Sun, User, Wrench, type LucideIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button, Card, EmptyState, FormError, Input, Money, PageHeader, Query, Select, Sheet, StatusBadge, cx } from '../../components/ui';
import { useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';
import { useProperties, usePropertyFilter } from '../../lib/property';

interface Bed {
  id: string;
  label: string;
  status: 'vacant' | 'reserved' | 'occupied' | 'notice' | 'maintenance';
  tags: string[];
  premiumPaise: number;
  resident?: { name: string; stayId: string; balancePaise: number };
}
interface Room {
  id: string;
  number: string;
  sharing: number;
  isAc: boolean;
  hasAttachedBath: boolean;
  beds: Bed[];
}
interface Bedmap {
  floors: { id: string; label: string; rooms: Room[] }[];
  summary: Record<'total' | Bed['status'], number>;
}

const STATUS_STYLE: Record<Bed['status'], { icon: LucideIcon; tile: string; label: string }> = {
  vacant: { icon: BedSingle, tile: 'border-dashed border-neutral-status text-neutral-text bg-surface', label: 'Vacant' },
  reserved: { icon: CalendarClock, tile: 'border-info text-info-text bg-info/10', label: 'Reserved' },
  occupied: { icon: User, tile: 'border-success text-success-text bg-success/10', label: 'Occupied' },
  notice: { icon: LogOut, tile: 'border-warning text-warning-text bg-warning/10', label: 'On notice' },
  maintenance: { icon: Wrench, tile: 'border-danger text-danger-text stripes', label: 'Maintenance' },
};

const BedTile = memo(function BedTile({ bed, room, onOpen }: { bed: Bed; room: string; onOpen: (bed: Bed) => void }) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[bed.status];
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(bed)}
      aria-label={t('Room {{room}} bed {{bed}}: {{status}}', { room, bed: bed.label, status: t(style.label) }) + (bed.resident ? `, ${bed.resident.name}` : '')}
      className={cx('relative flex h-[72px] w-16 flex-col items-center justify-center gap-0.5 rounded-md border-2 text-xs font-semibold transition-transform duration-150 hover:-translate-y-0.5', style.tile)}
    >
      <span className="absolute left-1 top-0.5 text-[10px]">{bed.label}</span>
      {bed.tags.includes('window') && <Sun className="absolute right-1 top-1 size-3 text-accent" aria-hidden />}
      {bed.resident ? <span className="text-sm">{initials(bed.resident.name)}</span> : <Icon className="size-5" aria-hidden />}
    </button>
  );
});

function BedPanel({ bed, room, propertyId, onClose }: { bed: Bed; room: Room; propertyId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const navigate = useNavigate();
  const update = useSend('patch', orgPath(`/beds/${bed.id}`));
  const setStatus = (status: string) => update.mutate({ status }, { onSuccess: onClose });
  return (
    <div className="space-y-4">
      <StatusBadge kind="bed" status={bed.status} />
      <p className="text-text-muted">{t('{{sharing}}-sharing', { sharing: room.sharing })}{room.isAc ? ` · ${t('AC')}` : ''}{bed.tags.length ? ` · ${bed.tags.join(', ')}` : ''}</p>
      {bed.premiumPaise > 0 && <p>{t('Bed premium')}: <Money paise={bed.premiumPaise} /></p>}
      {bed.resident && (
        <Card>
          <p className="font-semibold">{bed.resident.name}</p>
          <p className="text-text-muted">{t('Balance')}: <Money paise={bed.resident.balancePaise} /></p>
          <Link to={`/app/residents/${bed.resident.stayId}`}><Button variant="secondary" block className="mt-3">{t('View profile')}</Button></Link>
        </Card>
      )}
      <FormError error={update.error} />
      <div className="grid gap-2">
        {(bed.status === 'vacant' || bed.status === 'notice') && (
          <Button onClick={() => navigate(`/app/residents/new?property=${propertyId}&bed=${bed.id}`)}>{t('Book this bed')}</Button>
        )}
        {bed.status === 'vacant' && <Button variant="secondary" loading={update.isPending} onClick={() => setStatus('maintenance')}>{t('Mark maintenance')}</Button>}
        {bed.status === 'maintenance' && <Button loading={update.isPending} onClick={() => setStatus('vacant')}>{t('Mark ready')}</Button>}
      </div>
    </div>
  );
}

export default function BedmapPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const properties = useProperties();
  const { propertyId: selected } = usePropertyFilter();
  const propertyId = selected || properties.data?.[0]?._id || '';
  const query = useGet<Bedmap>(propertyId ? orgPath(`/properties/${propertyId}/bedmap`) : null);
  const [status, setStatus] = useState<'all' | Bed['status']>('all');
  const [sharing, setSharing] = useState('');
  const [ac, setAc] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ bed: Bed; room: Room } | null>(null);

  const floors = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (query.data?.floors ?? [])
      .map((floor) => ({
        ...floor,
        rooms: floor.rooms
          .filter((r) => (!sharing || r.sharing === Number(sharing)) && (!ac || String(r.isAc) === ac))
          .map((r) => ({ ...r, beds: r.beds.filter((b) => (status === 'all' || b.status === status) && (!text || r.number.includes(text) || b.resident?.name.toLowerCase().includes(text))) }))
          .filter((r) => r.beds.length > 0),
      }))
      .filter((floor) => floor.rooms.length > 0);
  }, [query.data, status, sharing, ac, search]);

  const chips: ('all' | Bed['status'])[] = ['all', 'vacant', 'occupied', 'notice', 'reserved', 'maintenance'];
  const summary = query.data?.summary;

  return (
    <>
      <PageHeader title={t('Bed map')} subtitle={properties.data?.find((p) => p._id === propertyId)?.name} />
      {properties.data?.length === 0 ? (
        <EmptyState title={t('No properties yet')} text={t('Add a property to see its beds here.')} action={<Link to="/app/properties/new"><Button>{t('Add property')}</Button></Link>} />
      ) : (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                aria-pressed={status === chip}
                onClick={() => setStatus(chip)}
                className={cx('min-h-11 shrink-0 rounded-full border px-3 text-sm font-medium', status === chip ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text-muted')}
              >
                {chip === 'all' ? t('All') : t(STATUS_STYLE[chip].label)} {summary ? (chip === 'all' ? summary.total : summary[chip]) : ''}
              </button>
            ))}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto]">
            <Input className="col-span-2 md:col-span-1" aria-label={t('Search')} placeholder={t('Search room or resident')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select aria-label={t('Sharing')} value={sharing} onChange={(e) => setSharing(e.target.value)}>
              <option value="">{t('Any sharing')}</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t('{{sharing}}-sharing', { sharing: n })}</option>)}
            </Select>
            <Select aria-label={t('AC')} value={ac} onChange={(e) => setAc(e.target.value)}>
              <option value="">{t('AC and non-AC')}</option>
              <option value="true">{t('AC')}</option>
              <option value="false">{t('Non-AC')}</option>
            </Select>
          </div>
          <Query query={query as never}>
            {() =>
              floors.length === 0 ? <EmptyState title={t('No beds match these filters')} /> : (
                <div className="space-y-6">
                  {floors.map((floor) => (
                    <section key={floor.id} aria-label={floor.label}>
                      <h2 className="mb-2 font-semibold">{floor.label}</h2>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                        {floor.rooms.map((room) => (
                          <div key={room.id} className="rounded-md border border-border bg-surface p-3 shadow-card">
                            <div className="mb-2 flex items-center justify-between">
                              <Link to={`/app/rooms/${room.id}/design`} aria-label={t('Design room {{number}}', { number: room.number })} className="flex items-center gap-1 font-semibold hover:text-primary">{room.number} <PencilRuler className="size-3 text-text-muted" aria-hidden /></Link>
                              <span className="flex items-center gap-1 text-xs text-text-muted">
                                {room.isAc && <Snowflake className="size-3" aria-label={t('AC')} />} {room.sharing}×
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {room.beds.map((bed) => <BedTile key={bed.id} bed={bed} room={room.number} onOpen={(b) => setOpen({ bed: b, room })} />)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )
            }
          </Query>
          <ul aria-label={t('Legend')} className="mt-6 flex flex-wrap gap-3">
            {Object.values(STATUS_STYLE).map(({ icon: Icon, label }) => <li key={label} className="flex items-center gap-1 text-xs text-text-muted"><Icon className="size-3" aria-hidden /> {t(label)}</li>)}
          </ul>
        </>
      )}
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open ? t('Room {{room}}, bed {{bed}}', { room: open.room.number, bed: open.bed.label }) : ''}>
        {open && <BedPanel bed={open.bed} room={open.room} propertyId={propertyId} onClose={() => setOpen(null)} />}
      </Sheet>
    </>
  );
}
