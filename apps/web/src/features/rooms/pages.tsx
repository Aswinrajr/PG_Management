import { autoArrange, FIXTURES, validateLayout, type Fixture, type FixtureType, type Rotation } from '@roomora/types';
import { RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button, Card, CardTitle, ErrorState, Field, FormError, Input, PageHeader, Query } from '../../components/ui';
import { useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { RoomCanvas, type CanvasBed } from './RoomCanvas';

const CM_PER_FT = 30.48;
const toFeet = (cm: number) => String(Math.round((cm / CM_PER_FT) * 10) / 10);
const toCm = (feet: string) => Math.round((Number(feet) * CM_PER_FT) / 15) * 15;

function Designer({ room }: { room: any }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [widthFt, setWidthFt] = useState(toFeet(room.widthCm));
  const [lengthFt, setLengthFt] = useState(toFeet(room.lengthCm));
  const widthCm = toCm(widthFt);
  const lengthCm = toCm(lengthFt);
  const start = autoArrange(room, room.beds.length);
  const [beds, setBeds] = useState<CanvasBed[]>(room.beds.map((b: any, i: number) => ({ id: b.id, label: b.label, status: b.status, ...(b.layout ?? start[i]) })));
  const [fixtures, setFixtures] = useState<Fixture[]>(room.fixtures);
  const [selected, setSelected] = useState<string | null>(null);
  const save = useSend('put', orgPath(`/rooms/${room.id}/layout`));
  const problems = widthCm >= 150 && lengthCm >= 150 ? validateLayout({ widthCm, lengthCm }, beds, fixtures) : [t('Enter the room size')];

  const onMove = (id: string, xCm: number, yCm: number) => {
    setBeds((list) => list.map((b) => (b.id === id ? { ...b, xCm, yCm } : b)));
    setFixtures((list) => list.map((f) => (f.id === id ? { ...f, xCm, yCm } : f)));
  };
  const rotate = () => {
    const next = (rot: Rotation) => ((rot + 90) % 360) as Rotation;
    setBeds((list) => list.map((b) => (b.id === selected ? { ...b, rot: next(b.rot) } : b)));
    setFixtures((list) => list.map((f) => (f.id === selected ? { ...f, rot: next(f.rot) } : f)));
  };
  const addFixture = (type: FixtureType) => {
    const id = crypto.randomUUID();
    setFixtures([...fixtures, { id, type, xCm: 0, yCm: 0, rot: 0 }]);
    setSelected(id);
  };
  const removable = fixtures.some((f) => f.id === selected);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card className="p-2 md:p-3">
        <RoomCanvas widthCm={widthCm} lengthCm={lengthCm} beds={beds} fixtures={fixtures} selected={selected} onSelect={setSelected} onMove={onMove} />
      </Card>
      <div className="space-y-4">
        <Card>
          <CardTitle>{t('Room size (feet)')}</CardTitle>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('Width')}><Input inputMode="decimal" value={widthFt} onChange={(e) => setWidthFt(e.target.value)} /></Field>
            <Field label={t('Length')}><Input inputMode="decimal" value={lengthFt} onChange={(e) => setLengthFt(e.target.value)} /></Field>
          </div>
        </Card>
        <Card>
          <CardTitle>{t('Add to room')}</CardTitle>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FIXTURES) as FixtureType[]).map((type) => <Button key={type} variant="secondary" onClick={() => addFixture(type)}>{t(FIXTURES[type].label)}</Button>)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="secondary" aria-label={t('Rotate')} disabled={!selected} onClick={rotate}><RotateCw className="size-4" aria-hidden /></Button>
            <Button variant="secondary" aria-label={t('Remove')} disabled={!removable} onClick={() => { setFixtures(fixtures.filter((f) => f.id !== selected)); setSelected(null); }}><Trash2 className="size-4" aria-hidden /></Button>
            <Button variant="secondary" aria-label={t('Auto-arrange beds')} onClick={() => setBeds(beds.map((b, i) => ({ ...b, ...autoArrange({ widthCm, lengthCm }, beds.length)[i] })))}><Sparkles className="size-4" aria-hidden /></Button>
          </div>
          <p className="mt-2 text-xs text-text-muted">{t('Drag to move. Tap an item, then rotate or remove it.')}</p>
        </Card>
        {problems.map((p) => <p key={p} role="alert" className="text-sm text-danger-text">{t(p)}</p>)}
        <FormError error={save.error} />
        {save.isSuccess && !save.isPending && <p className="text-success-text">{t('Saved. Beds near a window or door are tagged.')}</p>}
        <Button block loading={save.isPending} disabled={problems.length > 0} onClick={() => save.mutate({ widthCm, lengthCm, beds: beds.map(({ id, xCm, yCm, rot }) => ({ id, xCm, yCm, rot })), fixtures })}>{t('Save design')}</Button>
      </div>
    </div>
  );
}

export function RoomDesignPage() {
  const { t } = useTranslation();
  const { roomId } = useParams();
  const { orgPath } = useAuth();
  const query = useGet<any>(orgPath(`/rooms/${roomId}/layout`));
  return (
    <>
      <PageHeader title={t('Design room {{number}}', { number: query.data?.number ?? '' })} subtitle={t('Place the beds and furniture as they are in the real room.')} actions={<Link to="/app/bedmap"><Button variant="secondary">{t('Back to bed map')}</Button></Link>} />
      <Query query={query}>{(room) => <Designer room={room} />}</Query>
    </>
  );
}

export function MyRoomPage() {
  const { t } = useTranslation();
  const query = useGet<any>('/me/room', { retry: false });
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <div className="mx-auto max-w-[960px] text-base">
      <PageHeader title={t('My room')} subtitle={query.data ? t('Room {{number}}', { number: query.data.number }) : undefined} />
      <Query query={query}>
        {(room) => {
          const start = autoArrange(room, room.beds.length);
          const beds: CanvasBed[] = room.beds.map((b: any, i: number) => ({ id: b.id, label: b.label, status: b.status, ...(b.layout ?? start[i]) }));
          return (
            <Card className="rounded-lg">
              <div className="mx-auto max-w-md"><RoomCanvas widthCm={room.widthCm} lengthCm={room.lengthCm} beds={beds} fixtures={room.fixtures} myBedId={room.myBedId} /></div>
              <p className="mt-3 text-center text-sm text-text-muted">{t('The blue dot marks your bed.')}</p>
              {!room.designed && <p className="text-center text-sm text-text-muted">{t('Your PG has not drawn this room yet, so this is a rough layout.')}</p>}
            </Card>
          );
        }}
      </Query>
    </div>
  );
}
