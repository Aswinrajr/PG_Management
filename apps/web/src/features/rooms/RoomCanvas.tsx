import { BED_SIZE, FIXTURES, GRID_CM, type Fixture, type FixtureType, type Placed } from '@roomora/types';
import { useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface CanvasBed extends Placed {
  label: string;
  status: string;
}

const STATUS_FILL: Record<string, string> = {
  vacant: 'var(--color-surface)',
  reserved: 'var(--color-info)',
  occupied: 'var(--color-success)',
  notice: 'var(--color-warning)',
  maintenance: 'var(--color-danger)',
};

const FIXTURE_FILL: Record<FixtureType, string> = {
  door: 'var(--color-accent)',
  window: 'var(--color-info)',
  cupboard: 'var(--color-neutral-status)',
  table: 'var(--color-secondary)',
  bathroom: 'var(--color-surface-muted)',
};

const sizeOf = (w: number, l: number, rot: number) => (rot === 90 || rot === 270 ? { w: l, h: w } : { w, h: l });

function BedShape({ bed, mine, selected }: { bed: CanvasBed; mine?: boolean; selected?: boolean }) {
  const { w, h } = sizeOf(BED_SIZE.wCm, BED_SIZE.lCm, bed.rot);
  const pillow = { 0: [10, 8, w - 20, 34], 180: [10, h - 42, w - 20, 34], 90: [w - 42, 10, 34, h - 20], 270: [8, 10, 34, h - 20] }[bed.rot];
  return (
    <g>
      <rect width={w} height={h} rx={10} fill="var(--color-surface)" stroke={selected ? 'var(--color-primary)' : 'var(--color-text-muted)'} strokeWidth={selected ? 5 : 2} />
      <rect x={4} y={4} width={w - 8} height={h - 8} rx={8} fill={STATUS_FILL[bed.status] ?? 'var(--color-surface)'} fillOpacity={0.3} />
      <rect x={pillow[0]} y={pillow[1]} width={pillow[2]} height={pillow[3]} rx={8} fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth={2} />
      <text x={w / 2} y={h / 2 + 12} textAnchor="middle" fontSize={34} fontWeight={700} fill="var(--color-text)">{bed.label}</text>
      {mine && <circle cx={w / 2} cy={h / 2 + 34} r={8} fill="var(--color-primary)" />}
    </g>
  );
}

function FixtureShape({ fixture, selected }: { fixture: Fixture; selected?: boolean }) {
  const { t } = useTranslation();
  const spec = FIXTURES[fixture.type];
  const { w, h } = sizeOf(spec.wCm, spec.lCm, fixture.rot);
  const thin = fixture.type === 'door' || fixture.type === 'window';
  return (
    <g>
      <rect width={w} height={h} rx={thin ? 2 : 8} fill={FIXTURE_FILL[fixture.type]} fillOpacity={thin ? 1 : 0.45} stroke={selected ? 'var(--color-primary)' : 'var(--color-text-muted)'} strokeWidth={selected ? 5 : 2} />
      {!thin && <text x={w / 2} y={h / 2 + 8} textAnchor="middle" fontSize={22} fill="var(--color-text)">{t(spec.label)}</text>}
    </g>
  );
}

interface Props {
  widthCm: number;
  lengthCm: number;
  beds: CanvasBed[];
  fixtures: Fixture[];
  myBedId?: string;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, xCm: number, yCm: number) => void;
}

/** Top-down room. Pass onMove to make it editable; drag works with mouse and touch. */
export function RoomCanvas({ widthCm, lengthCm, beds, fixtures, myBedId, selected, onSelect, onMove }: Props) {
  const { t } = useTranslation();
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; w: number; h: number } | null>(null);
  const editable = Boolean(onMove);

  const toRoom = (e: PointerEvent) => {
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  };

  const grab = (e: PointerEvent, item: Placed, w: number, h: number) => {
    if (!editable) return;
    e.stopPropagation();
    svg.current!.setPointerCapture(e.pointerId);
    const { x, y } = toRoom(e);
    setDrag({ id: item.id, dx: x - item.xCm, dy: y - item.yCm, w, h });
    onSelect?.(item.id);
  };

  const move = (e: PointerEvent) => {
    if (!drag) return;
    const { x, y } = toRoom(e);
    const snap = (v: number, max: number) => Math.min(Math.max(0, Math.round(v / GRID_CM) * GRID_CM), Math.max(0, Math.floor(max / GRID_CM) * GRID_CM));
    onMove!(drag.id, snap(x - drag.dx, widthCm - drag.w), snap(y - drag.dy, lengthCm - drag.h));
  };

  const pad = 14;
  return (
    <svg
      ref={svg}
      viewBox={`${-pad} ${-pad} ${widthCm + pad * 2} ${lengthCm + pad * 2}`}
      role="img"
      aria-label={t('Room plan, {{w}} by {{l}} cm', { w: widthCm, l: lengthCm })}
      className="mx-auto block max-h-[70dvh] w-full"
      style={{ touchAction: editable ? 'none' : 'auto' }}
      onPointerDown={() => onSelect?.(null)}
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
    >
      <rect x={-pad / 2} y={-pad / 2} width={widthCm + pad} height={lengthCm + pad} rx={6} fill="var(--color-secondary)" fillOpacity={0.12} stroke="var(--color-text)" strokeWidth={pad / 2} />
      {fixtures.map((f) => {
        const { w, h } = sizeOf(FIXTURES[f.type].wCm, FIXTURES[f.type].lCm, f.rot);
        return <g key={f.id} transform={`translate(${f.xCm} ${f.yCm})`} className={editable ? 'cursor-move' : ''} onPointerDown={(e) => grab(e, f, w, h)}><FixtureShape fixture={f} selected={selected === f.id} /></g>;
      })}
      {beds.map((bed) => {
        const { w, h } = sizeOf(BED_SIZE.wCm, BED_SIZE.lCm, bed.rot);
        return <g key={bed.id} data-bed={bed.label} transform={`translate(${bed.xCm} ${bed.yCm})`} className={editable ? 'cursor-move' : ''} onPointerDown={(e) => grab(e, bed, w, h)}><BedShape bed={bed} mine={bed.id === myBedId} selected={selected === bed.id} /></g>;
      })}
    </svg>
  );
}
