# LadyGo — Yandex MapKit demo

A separate, non-operational Android map demonstration. It does not connect to Supabase, create real rides, request device location, dispatch drivers, or track people.

## Compatibility

- Node.js 22.13+
- Expo SDK 57 / React Native 0.86
- `expo-yandex-mapkit` 2.23.0
- Android 8.0+ (API 26+)
- A Yandex MapKit Mobile SDK key

The app uses the `full` MapKit flavor and includes:
- Yandex vector map centered on Kislovodsk
- Yandex place/address search within the Kislovodsk map area
- Driving route preview between a fixed demo pickup point and the selected search result
- 2D/3D tilt and zoom controls
- Clearly marked demo pickup/destination pins and a simulated car marker

The car position is changed only by the demo button. No device geolocation or real passenger/driver data is used.

## Add the Yandex key

Do not send the key in chat and do not commit it to GitHub.

1. Open the EAS project for this demo (first build may ask you to create/link one).
2. Open **Project settings → Environment variables**.
3. Add variable name `YANDEX_MAPKIT_API_KEY` and paste the MapKit Mobile SDK key as its value.
4. Select the **preview** environment and mark the variable as sensitive if the dashboard offers that option.
5. Confirm the key is enabled for **MapKit Mobile SDK** in the Yandex Developer Dashboard.

The app config reads this variable during the native build and writes it into the Android app manifest through the MapKit config plugin. The build intentionally stops with a clear error if an EAS build starts without the variable.

## Build the APK

From the `map-demo` directory:

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

EAS produces an installable APK when the build completes. This repository change does not itself start a cloud build.

## Demo controls

- Drag and pinch the map normally.
- Enter an address and tap **Найти**; choose a result to preview a route.
- `+` / `−` zoom in and out.
- `2D / 3D` changes camera tilt.
- `⌖` resets the camera to Kislovodsk.
- The blue car marker moves only when the simulation button is pressed.

If address search or route preview fails, first check that the MapKit key is valid and enabled for MapKit Mobile SDK. Search and routing require the `full` flavor.
