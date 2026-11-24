# LadyGo — финальный QA snapshot (24.11.2026)

## Android QA build
- Successful signed QA APK: GitHub Actions run #453, source commit 28405b250bb34dec1cedd9e7ec4902ae600f0f30.
- App version 6.9.1, Android versionCode 52, package com.ladygo.app.
- APK size 252,968,198 bytes; SHA-256 e6994a3b6a1794491245d558c9bf048d4ec3dd0c9156892492ca45b649cac790.
- CI apksigner verified APK Signature Scheme v2, one signer, CN=Android Debug. QA only, not a production Google Play signing identity.
- APK downloaded and hashed. Device install/login was not tested because adb/emulator is unavailable.
- Client source src/supabase.js contains project URL and public sb_publishable_ fallback. This is not a service_role key; blank Actions env does not mean the app lacks Supabase URL/key.
- Current PR branch has additional docs/migration commits after build #453. The app source file is unchanged since the APK commit; a current-head CI build is still required before treating the branch as green.

## Live backend
- Supabase project itlzvcklnxznrtaqjttc: ACTIVE_HEALTHY, eu-west-2.
- pricing-service v7 ACTIVE, JWT verification enabled.
- send-driver-offer-push v5 ACTIVE, webhook secret validation is Vault-backed.
- Cron ladygo-expire-stale-offers and ladygo-dispatch-scheduled-orders are active every minute; last observed run succeeded at 07:19 UTC.
- Migrations applied through 20261124200000_ladygo_phone_input_validation.
- Live counts: 2 approved drivers, 0 online drivers, 1 GPS point fresh within 15 minutes, 0 driver push tokens, 0 passenger push tokens, 1 active order. Existing active order was not changed or used for QA.
- Push function log query for the previous 24 hours returned no send-driver-offer-push invocations. Delivery is unverified, not merely missing a receipt.
- Phone validation migration is live; invalid values x, abc1234567, ++++, 12-34 were rejected in rollback-only SQL probes.

## RLS
- Passenger A and passenger B, using separate SET LOCAL ROLE authenticated claim contexts: own profile 1 row; orders, order_offers, driver_locations, driver_presence, trip_tracks, order_ratings, driver_applications, user_push_tokens, driver_push_tokens and support_tickets each 0 rows.
- Approved driver context: own profile 1, visible associated orders 2, own driver application 1; order_offers, driver_locations, driver_presence, trip_tracks, order_ratings, push tokens and support_tickets 0.
- This is SQL role/claim simulation, not two independent signed JWTs on devices. The current data does not contain a seeded passenger-B order, so it is not a direct A-vs-B row fixture.

## SECURITY DEFINER runtime probes
Security Advisor still reports 14 exposed authenticated SECURITY DEFINER RPC warnings. Catalog query confirms 14/14 have function-level search_path, authenticated EXECUTE and no anon EXECUTE.
- ladygo_accept_order: passenger denied (verified-driver guard).
- ladygo_cancel_active_order: passenger A denied cancelling another account's order.
- ladygo_decline_order: passenger denied (verified-driver guard).
- ladygo_dispatch_next_driver: unrelated passenger denied dispatching another account's new order. Before the probe, expired pending offers count was 0, so the function's expiry cleanup did not modify any rows.
- ladygo_driver_heartbeat: passenger denied (verified-driver guard).
- ladygo_get_assigned_driver_contact and ladygo_get_assigned_passenger_contact: unrelated passenger received 0 rows for a new order; active-trip/contact-lease device tests remain open.
- ladygo_list_admins: passenger and transactionally simulated ordinary admin denied.
- ladygo_record_trip_location: request against a new order rejected because no active trip; wrong-actor check during an active trip remains untested.
- ladygo_register_push_token: malformed/short token rejected; valid token/device registration remains untested.
- ladygo_set_admin_by_email: passenger and ordinary admin denied; super-admin self-removal and removal of a second synthetic super-admin were rejected in rollback-only transactions.
- ladygo_unregister_push_token: unknown token was a safe no-op; cross-account token test unavailable because token tables are empty.
- ladygo_update_my_phone: malformed phone rejected before update; other-account phone test not performed.
- ladygo_update_trip_status: passenger denied (verified-driver guard).
All probes used SET LOCAL ROLE authenticated and simulated request.jwt.claim.sub in SQL transactions. These are database probes, not signed-JWT device tests.

## Admin / export / backup / Auth
- Live state: 1 super-admin, 0 ordinary admins. Advisory lock and 15-admin cap code are present. Self-removal and removal of a second super-admin were rejected. Ordinary-admin access was simulated by temporarily changing a test profile role in a transaction with ROLLBACK; it could read 4 orders and 2 driver applications, but could not list or manage admins. No persistent synthetic admin was created.
- 15/16 concurrent cap race was not run: no 15 synthetic admin accounts and no safe concurrent staging harness.
- CSV export is absent from src/LadyGoApp.js and the admin UI. It remains unimplemented pending field scope, permission design and privacy review.
- Supabase organization is Free tier. Supabase documentation states daily automatic backups are for Pro/Team/Enterprise; Free projects should export backups using Supabase CLI and keep off-site copies. No current off-site backup artifact or restore drill was verified. No destructive production changes were made.
- Leaked Password Protection is disabled. Supabase docs state this feature requires Pro or above; owner must decide on upgrade and enable it in Auth settings.

## End-to-end acceptance
- Real passenger order creation, driver offer, Realtime/push delivery, atomic dual accept, trip status transitions, GPS track growth, completion, rating, cancellation, network recovery and two-device RLS are not confirmed.
- One existing active order remains untouched. The database currently reports 0 online drivers and no push tokens.
- PR #11 remains Draft/open. Do not mark ready or merge until current-head CI, device install/login, full real trip, push delivery and legal/privacy sign-off are complete.
- Production Google Play build requires owner-provided persistent release keystore and passwords stored only in GitHub Actions Secrets.
