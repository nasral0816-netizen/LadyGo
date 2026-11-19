# LadyGo

## Version 1.5.0

- Added a clear passenger trip progress timeline.
- Added driver trip history for the latest loaded orders.
- Added a driver dashboard summary for completed trips and recorded fares.
- Deferred profile loading until the Supabase auth callback has returned, reducing the risk of a sign-in lock/freeze.
- Android versionCode: 6.

Build validation is performed by GitHub Actions. A successful APK build confirms compilation and artifact creation, not a full live-device test of sign-in, GPS, notifications, or ride dispatch.
