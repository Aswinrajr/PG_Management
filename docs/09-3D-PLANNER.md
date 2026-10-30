# 09 — 3D building and room planner (phase 3)

Owners build a simple 3D model of their PG from data they already entered (floors, rooms) plus room size, doors and windows, then drag 3D beds into place. Residents see the room and choose a bed (e.g. by the window) before booking. Bed layout = real beds in billing, so they never disagree.

## Views

| View | Shows | Users |
| --- | --- | --- |
| Building | Stacked floors, rooms coloured by occupancy, tap floor to lift it out | Owner, admin (read-only), resident when booking |
| Floor | Top-down 3D of one floor: rooms, corridor, beds coloured by status | Owner, manager |
| Room editor | One room: walls, door, windows, AC, fan, cupboards, tables, beds — drag, rotate, snap | Owner, manager |
| Room viewer | Same room, read-only, free beds highlighted, prices | Resident |

Every 3D view has a **2D top-down toggle** (easier for many owners, works on small phones).

## Room editor flow

1. Shape (rectangle, L-shape) + size in ft or m (stored in cm) + ceiling height.
2. Click a wall → add door / window: width, offset along the wall, sill height (windows).
3. Add fixtures: attached bathroom block, AC (wall), fan (ceiling), cupboards, study tables.
4. Sharing 1–4 → **auto-arrange** beds (algorithm below).
5. Drag beds: snap to walls and a 15 cm grid; rotate 90°; single ↔ bunk.
6. Live validation: bed blocks door swing or window, walkway < 60 cm, overlap with fixtures, bed outside room.
7. Auto tags from geometry: `window` (bed edge within 60 cm of a window), `near_door` (≤ 100 cm), `near_bath`, `ac_side` (within 150 cm of AC wall), `corner`, `lower_bunk/upper_bunk`. Owner sets premium per tag (e.g. window +₹500).
8. Save → `PUT /org/:orgId/rooms/:id/layout` (server re-validates with the same shared geometry code) → beds' `layout`, `tags`, `premiumPaise` updated.

### Auto-arrange algorithm (v1)
- Candidate positions: along each wall, every 15 cm, bed long side against wall, both orientations.
- Score = +3 touching wall, +2 window access for at least one bed per window, −∞ blocks door swing (90 cm arc) or window, −5 walkway < 60 cm, +1 corner. Greedy place best-scoring bed, repeat for N beds; if not possible, try bunk beds.

## Data

```ts
// rooms (additions)
widthCm: number; lengthCm: number; heightCm: number;
shape: 'rect' | 'L'; notch?: { wCm: number; lCm: number; corner: 'NE'|'NW'|'SE'|'SW' };
openings: { id: string; type: 'door'|'window'|'balcony_door'; wall: 'N'|'E'|'S'|'W'; offsetCm: number; widthCm: number; sillCm?: number; heightCm?: number; swing?: 'in_left'|'in_right' }[];
fixtures: { id: string; type: 'cupboard'|'table'|'ac'|'fan'|'bathroom'|'shelf'; xCm: number; yCm: number; wCm: number; dCm: number; rot: 0|90|180|270 }[];

// beds (additions)
layout?: { xCm: number; yCm: number; rot: 0|90|180|270; kind: 'single'|'bunk_lower'|'bunk_upper'; wCm: 90; lCm: 190 };

// floors (additions)
outline?: { xCm: number; yCm: number }[];   // polygon, optional; else rooms auto-packed
roomPositions?: { roomId: string; xCm: number; yCm: number }[];
```

Coordinates: origin = room's south-west inner corner, x → east, y → north, centimetres. Shared geometry lives in `packages/geometry` (pure TS, no Three.js): rectangles, collisions, walkway check, tag rules, auto-arrange. Used by web, mobile and API.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/org/:orgId/properties/:id/model` | whole building: floors, rooms (geometry), beds (layout, status, resident initials) |
| PUT | `/org/:orgId/rooms/:id/geometry` | size, shape, openings, fixtures |
| PUT | `/org/:orgId/rooms/:id/layout` | beds layout; returns computed tags + validation |
| POST | `/org/:orgId/rooms/:id/auto-arrange` | returns proposed layout (not saved) |
| GET | `/me/room/model` | resident's room |
| GET | `/public/listings/:propertySlug/rooms/:id/model` | for booking page (P2) |

## Tech

- **Web**: React Three Fiber + @react-three/drei (OrbitControls, Html labels, Grid, Environment, ContactShadows), `zustand` editor store with undo/redo, pointer-drag on the floor plane with snapping, lazy-loaded route chunk (`/app/planner/:roomId`).
- **Mobile**: viewer with `@react-three/fiber/native` + `expo-gl`; editing in **2D** with `@shopify/react-native-skia` (3D editing on tablets later).
- Walls/floors/openings generated as simple boxes from data; furniture as low-poly **GLB** (bed, bunk, cupboard, table, AC, fan) ≤ 150 KB each with Draco, from CC0 packs (e.g. Kenney) or Blender. Store in `apps/web/public/models`.
- Style: soft, clean "isometric illustration" look matching the logo — white walls, teal floor tint, amber window light, indigo for selected bed; bed colour = status colour.
- Performance: instanced meshes for repeated furniture, one material per status, `frameloop="demand"`, max DPR 2. Building view uses simple boxes only.

## Tasks

- [ ] **3D.1** `packages/geometry` with tests (collisions, walkway, tags, auto-arrange).
- [ ] **3D.2** Room geometry + layout API with server validation.
- [ ] **3D.3** Web 2D room editor (SVG) — fastest win, ship first.
- [ ] **3D.4** Web 3D room editor (R3F) sharing the editor store with 2D.
- [ ] **3D.5** Floor and Building views; "3D" toggle on the bed map.
- [ ] **3D.6** Resident room viewer + bed choice during booking (window filter, prices).
- [ ] **3D.7** Mobile viewer + 2D editor.
- [ ] **3D.8** Complaint from 3D: tap fan/AC/window → prefilled complaint.

Prompt pattern: *"Do task 3D.3 from @docs/09-3D-PLANNER.md. Plan first."*
