# LadyGo — финальный QA snapshot (24.11.2026)

## Build
- Successful signed QA APK: GitHub Actions run #453, commit `28405b250bb34dec1cedd9e7ec4902ae600f0f30`.
- App version `6.9.1`, Android versionCode `52`, package `com.ladygo.app`.
- APK size `252968198` bytes.
- SHA-256 `e6994a3b6a1794491245d558c9bf048d4ec3dd0c9156892492ca45b649cac790`.
- CI apksigner verified APK Signature Scheme v2. Certificate is Android Debug; QA only, not a production Google Play signing identity.
- APK was downloaded and hashed. Device install/login was not tested because adb/emulator is unavailable in the execution environment.
- Client source `src/supabase.js` contains project URL and public `sb_publishable_` fallback; this is not a service-role key.

## Live backend
- Supabase project `itlzvcklnxznrtaqjttc`: ACTIVE_HEALTHY, eu-west-2.
- `pricing-service` v7 ACTIVE, JWT verification enabled.
- `send-driver-offer-push` v5 ACTIVE, webhook secret validated from Vault.
- Cron `ladygo-expire-stale-offers` and `ladygo-dispatch-scheduled-orders` are active each minute.
- Migrations applied through `20261124200000_ladygo_phone_input_validation`.
- Live counts at recheck: 2 approved drivers, 0 online drivers, 1 GPS point fresh within 15 minutes, 0 driver push tokens, 0 passenger push tokens, 1 active order. The active order was not changed or used for a test.
- Phone validation regression fixed by additive migration; invalid inputs `x`, `abc1234567`, `++++`, `12-34` were rejected in rollback-only SQL probes.

## RLS and RPC probes
- Passenger A and passenger B, using separate `SET LOCAL ROLE authenticated` claim contexts: own profile 1 row; orders, order_offers, driver_locations, driver_presence, trip_tracks, order_ratings, driver_applications, user_push_tokens, driver_push_tokens and support_tickets 0 rows.
- Approved driver context: own profile 1, visible orders 2, own driver application 1; offers, locations, presence, tracks, ratings, push tokens and support tickets 0.
- Negative RPC probes passed for passenger accept/decline/heartbeat/cancel foreign order/list admins/grant admins; unassigned driver status change/contact; invalid push token; invalid phone; super-admin self-removal.
- 13 of 14 Advisor-listed SECURITY DEFINER RPCs had a negative or validation probe. `ladygo_dispatch_next_driver` was intentionally not called because it may expire offers or dispatch a driver. SQL claim simulation is not equivalent to independent signed JWTs on devices.
- Advisor still reports 14 authenticated SECURITY DEFINER warnings and leaked password protection disabled.

## Admin / export / backup
- 1 super-admin, 0 ordinary admins. Passenger cannot list/grant admins; super-admin cannot remove own rights.
- The 15/16 concurrent cap race and ordinary-admin isolation were not tested; no safe concurrent staging sessions or synthetic Auth account were available.
- CSV export is absent from `src/LadyGoApp.js`. It remains open pending agreed field scope, role permissions and privacy review.
- Backup/PITR status and restore drill were not exposed by available project metadata; owner must verify and run a restore drill on a separate environment.

## End-to-end acceptance
- Real passenger order creation, driver offer, Realtime/push delivery, atomic dual accept, trip status transitions, GPS track growth, completion, rating, cancellation, network recovery and two-device RLS are not confirmed.
- Push delivery is unverified: live token counts are zero.
- PR #11 remains Draft/open. Do not mark ready or merge until latest-head CI, device install/login, full real trip, push delivery and legal/privacy sign-off are complete.
- Production Google Play build requires owner-provided persistent release keystore and passwords stored only in GitHub Actions Secrets.
