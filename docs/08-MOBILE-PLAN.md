# 08 — Mobile app plan (phase 2 — after the web app works)

One **Expo React Native** app for Android and iOS. After login it shows the **Owner/Manager/Staff** experience or the **Resident** experience depending on the active membership. It reuses `packages/types` (Zod schemas), `packages/api-client` (hooks) and `packages/ui-tokens`. No new backend needed except push token registration.

## Stack

Expo (latest SDK) · Expo Router · TypeScript · **NativeWind** (Tailwind classes, same tokens) · TanStack Query (+ persist to MMKV for offline lists) · React Hook Form + Zod · expo-secure-store (refresh token) · expo-notifications (push) · expo-image-picker / expo-camera (KYC, bills, complaints) · react-native-reanimated + @gorhom/bottom-sheet · react-native-razorpay · lucide-react-native · i18next · EAS Build + EAS Update.

## Structure

```
apps/mobile/
  app/
    (auth)/login.tsx, otp.tsx, select-workspace.tsx
    (owner)/(tabs)/home.tsx, beds.tsx, residents.tsx, money.tsx, more.tsx
    (owner)/residents/[stayId].tsx, residents/new.tsx, payment/new.tsx, complaints/..., notices/..., expenses/...
    (resident)/(tabs)/home.tsx, payments.tsx, requests.tsx, profile.tsx
    (resident)/invoice/[id].tsx, requests/new.tsx
  components/  (RN versions of StatCard, BedTile, RoomCard, StatusBadge, MoneyText, EmptyState, Sheet...)
  lib/ auth.ts, storage.ts, push.ts
```

## Owner app — tabs

| Tab | Content |
| --- | --- |
| Home | KPIs 2×2, quick actions (Add resident, Record payment, Add expense, Post notice), rent due this week, open complaints |
| Beds | Property switcher, floor tabs, room grid with bed tiles, bed bottom sheet (same actions as web) |
| Residents | Search, filter chips, list; detail with call/WhatsApp buttons |
| Money | Dues (ageing), Record payment (fast: pick resident → amount → mode → save → share receipt), invoices, expenses |
| More | Complaints, notices, food menu, staff, reports (simple), settings, switch workspace, language, logout |

Floating **+** button on Home/Beds/Residents/Money opens quick actions sheet. Goal: any daily task in ≤ 3 taps.

## Resident app — tabs

Home (rent card + Pay, my room, notice, today's menu) · Payments (Razorpay native checkout, receipts) · Requests (raise with camera photo, track, rate) · Profile (KYC with camera guide overlay, agreement, notice to vacate, language).

## Mobile-specific

- **Push**: register Expo push token → `POST /me/devices {token, platform}` (add endpoint + `devices` collection). Notification taps deep-link (`roomora://invoice/123`).
- **Deep links / invites**: `https://app.roomora.in/invite/:code` opens the app if installed (Android App Links / iOS Universal Links), else the web page.
- **Offline**: cache lists with persisted Query; queue "record payment" and "raise complaint" when offline and sync later (show "Pending sync" badge).
- **Low-end Android**: Hermes, FlashList for long lists, image sizes ≤ 1600 px, avoid heavy shadows.
- **Biometric unlock** (optional) with expo-local-authentication after first login.
- Staff role sees a reduced More menu and only assigned properties.

## Build tasks (paste into Claude Code)

- [ ] **M0.1** Create `apps/mobile` with Expo Router, NativeWind using `packages/ui-tokens`, fonts, theme (light/dark), and the API client with SecureStore refresh tokens.
- [ ] **M0.2** RN component kit mirroring the web components (StatCard, BedTile, RoomCard, StatusBadge, MoneyText, ListItem, EmptyState, ErrorState, Sheet, OtpInput, PhoneInput, FAB).
- [ ] **M1.1** Auth screens + workspace selection + role-based tab groups.
- [ ] **M1.2** Owner Home + Beds (bed sheet actions).
- [ ] **M1.3** Residents list/detail + Add resident (bed picker sheet).
- [ ] **M1.4** Money: dues, record payment, receipts share, expenses with camera.
- [ ] **M1.5** More: complaints, notices, menu, staff, settings.
- [ ] **M2.1** Resident tabs + Razorpay native payment.
- [ ] **M2.2** Push notifications + deep links + invite links.
- [ ] **M2.3** Offline cache + queued actions.
- [ ] **M3.1** EAS build profiles (dev, preview, production), app icons/splash from `docs/brand`, Play Store + App Store listings, EAS Update channel.

Prompt pattern: *"Do task M1.2 from @docs/08-MOBILE-PLAN.md. Match the web behaviour in @docs/06-WEB-SCREENS.md (Bed map) and reuse hooks from packages/api-client. Plan first, then implement."*

## Store assets

App name **Roomora – PG Manager** (owner-focused listing) — one app for both roles. Icon: `docs/brand/roomora-icon.svg` exported to 1024×1024 PNG. Screenshots: dashboard, bed map, add resident, resident pay rent, complaints (phone frames, short captions).
