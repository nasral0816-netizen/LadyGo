# LadyGo 2.0

LadyGo 2.0 is an additive upgrade of the existing Expo + Supabase app. The production database was upgraded through migrations 001–014; existing profiles and orders were preserved.

## Backend now connected
- Order lifecycle: new → accepted → arrived → in progress → completed; passenger cancellation is restricted to their own unassigned new order.
- Driver applications: admin review, automatic role promotion, and support for a new application after rejection.
- Driver-only order offers: an order is offered to one approved driver at a time. Skipping or timing out moves the offer to the next eligible approved driver; acceptance closes competing offers.
- Server-side expiry: a scheduled job checks stale offers every minute. The app's own 25-second timer handles an active driver session; the server sweep is a fallback when the app is closed.
- Atomic acceptance and server-validated trip-stage transitions.
- In-app notifications for trip status changes.
- Driver foreground location sharing during an assigned active trip; passengers can read only their assigned driver's location.
- Passenger saved-place storage.
- Expo push-token storage and a private push-dispatch pipeline: pg_net sends offer events to the Edge Function, the webhook secret is stored in Supabase Vault, and the function validates the event before sending Expo Push.
- Realtime publication includes driver locations, notifications, and order offers.

## Database migrations
The migrations in `supabase/migrations` are applied to the connected production project in filename order through `202611170014`. The upgrade is additive and does not replace existing user or order records.

## Mobile app behavior
- Passenger can create an order, add pickup/destination addresses, set a requested time and note, and follow the order status.
- Driver receives a full-screen offer panel with route details, fare entry, and a 25-second response timer.
- Driver can accept, skip, mark arrival, start, and complete a trip.
- Passenger sees the driver's live foreground location while the trip is active.
- The driver app registers Expo push tokens and receives server push when the app is backgrounded or closed, provided the installed EAS build has valid push credentials and the user granted notification permission.
- Duplicate local and remote alert scheduling was removed; the server push is the sound/banner alert and realtime opens the in-app offer panel.

## Important limitations before public release
This is a comparable independently built ride-hailing workflow, not a copy of Yandex Go's proprietary code or private dispatch algorithms. It is not yet a fully equivalent commercial platform.
- The dispatch queue currently chooses the next approved driver by account creation order, not by live distance, driver availability, or traffic.
- The 25-second client timer is exact while the driver app is active; the server fallback sweep runs every minute, so a closed-app timeout can take up to roughly a minute longer.
- Road-following route geometry, traffic-aware ETA, turn-by-turn navigation, automatic fare calculation, in-app payment, driver online/offline controls, ratings, receipts, support chat, and production analytics are not yet implemented.
- Push delivery has not yet been verified on a real EAS-installed Android device; no driver device token was registered during the database inspection.
- The Expo Android JavaScript bundle export now passes in GitHub Actions. This is not a signed APK/AAB build and does not replace physical-device QA or store review.

## Release checklist
1. Build an Android development/preview build with EAS and install it on a real device.
2. Register a driver device, grant notification permission, and verify a real push offer while the app is backgrounded and closed. The webhook endpoint's authenticated no-op smoke test returned HTTP 200; real device delivery is still unverified.
3. Test passenger order creation, sequential driver offers, skip/timeout, concurrent acceptance, each trip status, passenger cancellation, and live location access.
4. Test with separate passenger, driver, and admin accounts.
5. Review privacy policy, driver verification process, local transport rules, support contacts, and Google Play declarations before public release.

Never place the Supabase service-role key in the app or repository. Push webhook authentication uses a secret stored in Supabase Vault. Location sharing is foreground-only and limited to an active assigned trip.
