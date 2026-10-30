# 05 — Design system

One system, three faces: **dense admin dashboard** (Super Admin, Owner web), **task-first** (Owner on phone), **friendly consumer** (Resident). Same tokens and components everywhere. Source of truth: `packages/ui-tokens/tokens.json` (copy of `docs/brand/tokens.json`).

## 1. Brand

- Name: **Roomora** — tagline *Smart PG & co-living*.
- Logo: `docs/brand/roomora-logo.svg` (horizontal), `roomora-icon.svg` (app icon / favicon). Minimum logo width 120 px; clear space = height of the "r".
- Personality: calm, trustworthy, warm. Not playful-cartoon inside the app (marketing site can use illustrations).

## 2. Colour tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `primary` | `#4F46E5` (indigo-600) | `#818CF8` | Primary buttons, active nav, links, focus ring |
| `primary-hover` | `#4338CA` | `#A5B4FC` | |
| `primary-soft` | `#EEF2FF` | `#1E1B4B` | Selected rows, active nav background |
| `secondary` | `#14B8A6` (teal-500) | `#2DD4BF` | Resident accents, success highlights, charts series 2 |
| `accent` | `#F59E0B` (amber-500) | `#FBBF24` | Window/sunlight in 3D, highlights, "new" badges |
| `background` | `#F8FAFC` | `#0B1120` | App background |
| `surface` | `#FFFFFF` | `#111827` | Cards, tables, sheets |
| `surface-muted` | `#F1F5F9` | `#1F2937` | Table header, inputs disabled |
| `border` | `#E2E8F0` | `#273244` | |
| `text` | `#0F172A` | `#F1F5F9` | |
| `text-muted` | `#64748B` | `#94A3B8` | |
| `success` | `#16A34A` | `#22C55E` | Paid, occupied, resolved |
| `warning` | `#D97706` | `#F59E0B` | Due soon, notice period, in progress |
| `danger` | `#DC2626` | `#F87171` | Overdue, urgent, delete |
| `info` | `#2563EB` | `#60A5FA` | Reserved, info banners |
| `neutral-status` | `#94A3B8` | `#64748B` | Vacant, closed, inactive |

### Status mapping (must be identical everywhere)

| Status | Colour | Icon (lucide) | Label |
| --- | --- | --- | --- |
| Bed vacant | neutral-status (outline tile) | `BedSingle` | Vacant |
| Bed reserved | info | `CalendarClock` | Reserved |
| Bed occupied | success | `User` | Occupied |
| Bed notice | warning | `LogOut` | On notice |
| Bed maintenance | danger (striped) | `Wrench` | Maintenance |
| Invoice paid | success | `CheckCircle2` | Paid |
| Invoice due / partially paid | warning | `Clock` | Due / Part paid |
| Invoice overdue | danger | `AlertCircle` | Overdue |
| Ticket open / in progress / resolved / closed | danger / warning / success / neutral | | |

Never use colour alone: every status badge has icon + text.

## 3. Typography

- Font: **Inter** (variable) for UI; **Poppins 600/700** only for the logo wordmark and marketing headings.
- Numbers in tables and KPIs: `font-variant-numeric: tabular-nums`.

| Token | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 32/40 | 700 | Landing / empty hero |
| `h1` | 24/32 | 700 | Page title |
| `h2` | 20/28 | 600 | Section title, card title large |
| `h3` | 16/24 | 600 | Card title |
| `body` | 14/20 | 400 | Default UI text (web) |
| `body-lg` | 16/24 | 400 | Resident screens, mobile default |
| `small` | 12/16 | 500 | Labels, badges, table meta |
| `kpi` | 28/36 | 700 | Stat card numbers |

## 4. Spacing, radius, shadow

- 4 px grid: `1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`.
- Page padding: 16 (mobile) / 24 (tablet) / 32 (desktop). Card padding 16 / 20 / 24. Gap between cards 16 / 24.
- Radius: `sm 6` (inputs, badges), `md 8` (buttons, cards web), `lg 12` (cards mobile/resident), `xl 16` (sheets, modals), `full` (avatars, pills).
- Shadow: `card: 0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.08)`; `overlay: 0 10px 30px rgba(15,23,42,.18)`. Prefer borders over heavy shadows.

## 5. Responsive rules

Breakpoints (Tailwind): `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Design mobile-first. Test at **360, 390, 768, 1024, 1280, 1440**.

| Element | < 768 (phone) | 768–1023 (tablet) | ≥ 1024 (desktop) |
| --- | --- | --- | --- |
| Navigation (owner/admin) | Top bar + **bottom tab bar** (5 items) + "More" sheet | Collapsed icon sidebar (72 px) | Full sidebar (248 px), collapsible |
| Navigation (resident) | Bottom tab bar (Home, Payments, Requests, Profile) | Bottom tabs | Top nav, centered content max 960 |
| KPI cards | 2 per row, horizontal scroll if > 4 | 2–4 per row | 4 per row |
| Data tables | **Card list** (key fields + status + chevron) | Table with fewer columns | Full table |
| Filters | "Filters" button → bottom sheet | Inline row | Inline row + saved views |
| Detail views | Full page | Full page | **Side drawer** (480 px) over list |
| Forms | Single column, sticky bottom action bar | 2 columns | 2 columns, max 720 |
| Modals | Bottom sheet (full width) | Centered dialog | Centered dialog |
| Bed map | Floor tabs, rooms as 2-column grid | 3-column | Floors stacked, rooms auto-fill grid (min 180 px) |
| Primary action | Floating action button (bottom-right, above tabs) | Button in page header | Button in page header |

Other rules: content max width 1440 on desktop; touch targets ≥ 44×44; no hover-only actions (add a menu); sticky table headers; avoid horizontal page scroll (only inside tables/carousels).

## 6. Components (build once in `apps/web/src/components`)

Base from **shadcn/ui**: Button, Input, Textarea, Select, Combobox, Checkbox, Switch, RadioGroup, Dialog, Sheet, Drawer (vaul), DropdownMenu, Tabs, Tooltip, Popover, Calendar/DatePicker, Toast (sonner), Skeleton, Avatar, Badge, Card, Separator, Table, Command (⌘K search), Form.

App components:

| Component | Spec |
| --- | --- |
| `AppShell` | Sidebar + Topbar + content; switches to bottom tabs < md. Props: `nav`, `user`, `workspace`. |
| `Topbar` | Workspace switcher (org + property), global search (⌘K), notifications bell with count, language, theme, avatar menu. |
| `PageHeader` | Title, subtitle, breadcrumbs, actions slot; on mobile actions collapse into a `⋯` menu. |
| `StatCard` | Icon, label, value (kpi), delta vs last month (▲ green / ▼ red), optional sparkline, click → filtered list. |
| `DataTable` | TanStack Table: sort, column visibility, row selection + bulk actions bar, pagination, sticky header, skeleton rows, empty state; `mobileCard` render prop for < md. |
| `StatusBadge` | `kind` + `status` → colour, icon, label from mapping table. |
| `MoneyText` | Formats paise → `₹8,500` (Indian grouping `₹1,25,000`), negative red. |
| `BedTile` | 64×72 tile: bed label, status colour, resident initials/avatar, small tag icons (window ☀, AC ❄); states: hover, selected, disabled. |
| `RoomCard` | Room number, sharing, AC/bath icons, rent, grid of `BedTile`s. |
| `ResidentCard` | Avatar, name, room/bed, phone (tap to call / WhatsApp), balance, status. |
| `InvoiceCard` | Period, amount, due date, status, Pay / Record payment. |
| `Stepper` / `WizardLayout` | Steps header (numbers on mobile, labels on desktop), back/next sticky footer, save draft. |
| `FileUpload` | Drag-drop + camera on mobile, preview, progress, compress images client-side, 5 MB limit. |
| `EmptyState` | Illustration (simple line art), title, text, primary action. |
| `ErrorState` | Message + Retry. |
| `ConfirmDialog` | Destructive confirm with typed confirmation for dangerous actions (void invoice, delete property). |
| `FilterBar` | Search + chips + "Filters" sheet on mobile. |
| `Timeline` | Ticket/stay history entries. |
| `KanbanBoard` | Ticket columns with drag (dnd-kit); on mobile becomes status tabs. |
| `ChartCard` | Recharts wrapper with title, legend, empty state; colours from tokens. |
| `PhoneInput` / `OtpInput` | +91 prefix, 10 digits; 6 boxes with auto-advance and paste support, auto-submit. |
| `WhatsAppShareButton` | `https://wa.me/?text=` with prefilled message + link. |

## 7. Motion

150–200 ms ease-out for hovers, sheets 250 ms. Respect `prefers-reduced-motion`. No bouncing.

## 8. Writing style (UI copy)

Plain words, short. "Rent pending" not "Outstanding receivables". Buttons are verbs: "Add resident", "Record payment", "Send reminder". Dates `3 Nov 2026`; money `₹8,500`. Empty states tell the next action: "No residents yet — add your first resident to start collecting rent."

## 9. Accessibility

WCAG 2.2 AA contrast; visible focus ring (`ring-2 ring-primary ring-offset-2`); all icons-only buttons have `aria-label`; forms show errors under fields and in a summary; keyboard navigable tables and dialogs.

## 10. Tailwind setup

Tailwind v4 with CSS variables in `globals.css` (`@theme` block) generated from `tokens.json`; dark mode via `.dark` class on `<html>` (toggle in avatar menu, default = system). shadcn components use these variables (`--primary`, `--background`, ...).
