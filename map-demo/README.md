# LadyGo — Yandex MapKit demo

This is a separate, non-operational map demonstration. It does not connect to Supabase, create rides, use live device location, dispatch drivers, or track real people.

## Requirements

- Node.js 22.13+
- Expo SDK 57 / React Native 0.86
- A Yandex MapKit Mobile SDK key supplied as the environment variable `YANDEX_MAPKIT_API_KEY`
- An EAS account for cloud APK builds

## Build an APK

From this directory:

```bash
npm install
npx eas-cli@latest login
# Set YANDEX_MAPKIT_API_KEY in the build environment / EAS project environment.
npx eas-cli@latest build --platform android --profile preview
```

The MapKit key is intentionally not committed to this repository. Do not paste it into source files or public commits.

The demo map opens around Kislovodsk and shows fixed pickup/destination points plus a car marker that moves only when the demo button is pressed.
