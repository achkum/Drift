# Drift mobile (Expo)

The phone app. It shares parsers, analysis and Ask Drift with the web app through the `@/` alias (`../src`), and keeps everything on the device in SQLite.

```bash
cd mobile
npm install
npx expo start          # scan the QR code with Expo Go, or press i / a for a simulator
```

Checks: `npx tsc --noEmit` and `npx expo export --platform android`. Data-layer tests run from the repo root (`npm test`).

Browser testing without a device: `npx expo export --platform web`, then serve `dist` with COOP/COEP headers (expo-sqlite's wasm build needs them).

Not in the mobile app yet: live household mode (needs React Native crypto and storage), automatic Google sync, the on-device topic model and title lookup (the switches are stored but have no effect).
