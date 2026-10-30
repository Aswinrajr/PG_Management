export const GRID_CM = 15;
export const BED_SIZE = { wCm: 90, lCm: 190 };

export const FIXTURES = {
  door: { wCm: 90, lCm: 10, label: 'Door' },
  window: { wCm: 120, lCm: 10, label: 'Window' },
  cupboard: { wCm: 120, lCm: 60, label: 'Cupboard' },
  table: { wCm: 100, lCm: 60, label: 'Study table' },
  bathroom: { wCm: 150, lCm: 180, label: 'Bathroom' },
} as const;

export type FixtureType = keyof typeof FIXTURES;
export type Rotation = 0 | 90 | 180 | 270;

export interface Placed {
  id: string;
  xCm: number;
  yCm: number;
  rot: Rotation;
}
export interface Fixture extends Placed {
  type: FixtureType;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxOf(item: Placed, wCm: number, lCm: number): Box {
  const sideways = item.rot === 90 || item.rot === 270;
  return { x: item.xCm, y: item.yCm, w: sideways ? lCm : wCm, h: sideways ? wCm : lCm };
}

export const bedBox = (bed: Placed) => boxOf(bed, BED_SIZE.wCm, BED_SIZE.lCm);
export const fixtureBox = (f: Fixture) => boxOf(f, FIXTURES[f.type].wCm, FIXTURES[f.type].lCm);

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Gap between two boxes in cm; 0 when they touch or overlap. */
const gap = (a: Box, b: Box) => Math.hypot(Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)), Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)));

/** Doors and windows sit on the wall, so only these block floor space. */
const isSolid = (f: Fixture) => f.type === 'cupboard' || f.type === 'table' || f.type === 'bathroom';

export function validateLayout(room: { widthCm: number; lengthCm: number }, beds: Placed[], fixtures: Fixture[]): string[] {
  const problems: string[] = [];
  const outside = (b: Box) => b.x < 0 || b.y < 0 || b.x + b.w > room.widthCm || b.y + b.h > room.lengthCm;
  const solid = [
    ...beds.map((bed) => ({ name: 'A bed', box: bedBox(bed) })),
    ...fixtures.filter(isSolid).map((f) => ({ name: FIXTURES[f.type].label, box: fixtureBox(f) })),
  ];
  for (const f of fixtures) if (outside(fixtureBox(f))) problems.push(`${FIXTURES[f.type].label} is outside the room`);
  solid.forEach((a, i) => {
    if (outside(a.box)) problems.push(`${a.name} is outside the room`);
    for (const b of solid.slice(i + 1)) if (overlaps(a.box, b.box)) problems.push(`${a.name} overlaps ${b.name.toLowerCase()}`);
  });
  return [...new Set(problems)];
}

/** Tags that come from where a bed stands. */
export function layoutTags(bed: Placed, fixtures: Fixture[]) {
  const near = (type: FixtureType, cm: number) => fixtures.some((f) => f.type === type && gap(bedBox(bed), fixtureBox(f)) <= cm);
  return [...(near('window', 60) ? ['window'] : []), ...(near('door', 100) ? ['near_door'] : [])];
}

/** Lines beds up along the walls, left then right, for a quick starting point. */
export function autoArrange(room: { widthCm: number; lengthCm: number }, count: number): { xCm: number; yCm: number; rot: Rotation }[] {
  const snap = (cm: number) => Math.floor(cm / GRID_CM) * GRID_CM;
  const spots = [
    { xCm: 0, yCm: 0 },
    { xCm: snap(room.widthCm - BED_SIZE.wCm), yCm: 0 },
    { xCm: 0, yCm: snap(room.lengthCm - BED_SIZE.lCm) },
    { xCm: snap(room.widthCm - BED_SIZE.wCm), yCm: snap(room.lengthCm - BED_SIZE.lCm) },
  ];
  return spots.slice(0, count).map((spot) => ({ ...spot, rot: 0 }));
}
