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


## Дополнение после обращения пассажира — 24.11.2026 07:28 UTC
- Найден и отменён заказ владельца: `e1a4ebef-cbe7-4ad0-8cda-854e4cca77ae`, маршрут Зеленогорская улица, 28 → Мечеть, Кисловодск, 195 ₽. RPC вернула `status=cancelled`; запись оставлена в истории. Активных заказов по маршруту 0.
- Исправлен mismatch UI/RPC: приложение вызывало отсутствующую `cancel_my_order`; теперь вызывает `ladygo_cancel_my_order(p_order_id,p_reason)`. RPC ограничивает отмену владельцем его нового неназначенного заказа. Guard разрешает owner cancellation, если роль профиля driver, но заказ был создан как пассажирский и ещё не назначен.
- Cancellation migrations live: `20261124072817_ladygo_owner_cancel_unassigned_order`, `20261124072830_ladygo_passenger_cancel_order_rpc`.
- Direct dispatch RPC hardened: migration `20261124073317_ladygo_restrict_direct_dispatch_rpc`; authenticated=false, anon=false, service_role=true; direct authenticated invocation was rejected in a rollback probe.
- Live recheck: 1 online driver, 1 GPS sample newer than 15m, 0 driver push tokens, 0 passenger push tokens, 0 active orders, 1 super-admin, 0 ordinary admins. This makes an offer test possible only after a passenger session creates a new order; push remains blocked by zero tokens.
- Current-head Android build after cancellation and dispatch ACL changes is running in GitHub Actions; no claim of a new APK until signature verification and artifact download complete.


## Повторная live-сверка и CI (24.11.2026, 11:32 UTC)

Проверено непосредственно через GitHub Actions и SQL в Supabase project `itlzvcklnxznrtaqjttc`. Это снимок состояния, а не утверждение о полном E2E.

### Текущий Android CI
- PR head: `71ef3376d4555a4f7e6b65bbbe3b5ecb8a50c705` (ветка `fix/order-submit-diagnostics-2026-11-24`).
- Runs #552 (push) и #553 (pull_request) для одного head SHA на момент сверки находятся в `in_progress`. Установка зависимостей, Expo prebuild, конфигурация Gradle и создание QA debug signing identity завершились успешно; `assembleRelease` ещё выполняется. Шаги `apksigner verify` и upload artifact ещё не запускались. Поэтому текущего APK для этого head пока нет.
- Workflow использует временный Android Debug keystore, созданный в CI, и явно маркирует его как QA-only. Постоянный release keystore владельца не подтверждён.
- app.json: version `6.9.1`, Android versionCode `52`, package `com.ladygo.app`. В манифесте запрошены fine/coarse location, notifications, background location и foreground location service; background location используется для включённой смены водителя и требует отдельного Google Play declaration/review.

### Live dispatch / данные — только read-only проверка
- В live `public.orders` обнаружено: 1 `accepted`, 7 `cancelled`, 2 `completed`. Существующий `accepted` заказ не изменялся и не использовался для QA.
- Два профиля водителя имеют одобренные анкеты. У одного нет строки `driver_presence` и GPS; у второго `is_online=false`. На момент SQL-снимка доступных онлайн-водителей нет.
- `driver_push_tokens` = 0, `user_push_tokens` = 0. Push-доставка на устройствах не проверена и сейчас не может быть подтверждена этим снимком.
- Каталог подтверждает цепочку триггеров: INSERT `orders` → `ladygo_create_order_offers()`; INSERT `order_offers` → push trigger; UPDATE `order_offers` → dispatch continuation; INSERT/UPDATE `driver_presence` → presence dispatch handler. Это подтверждает наличие wiring в БД, но не успешную отправку оффера реальному водителю.
- RLS включён на 23 из 23 обычных таблиц схемы `public`. Это не заменяет A↛B тест двумя независимыми подписанными JWT.

### SECURITY DEFINER / Auth
- Live catalog содержит 36 функций `SECURITY DEFINER`, а не 14. У всех зафиксирован function-level `search_path` (33 с явным путём, 3 с пустым путём); у пустого пути тела используют schema-qualified обращения, что не даёт подменять объекты через пользовательский search_path.
- 16 функций имеют EXECUTE для `authenticated`, ни одна — для `anon`; `ladygo_dispatch_next_driver(uuid)` доступна только `service_role`. Это каталог/grant audit, не runtime-тест под независимыми JWT.
- Security Advisor на текущем снимке сообщает 16 предупреждений об authenticated SECURITY DEFINER. Это предупреждение об exposed RPC; каждый RPC всё равно требует проверки авторизации и негативных сценариев.
- Security Advisor сообщает `Leaked Password Protection Disabled`. Владелец должен включить защиту в Supabase Auth после решения по тарифу/доступности.

### Нерешённые release gates
- Реальный полный trip E2E не выполнен: нет онлайн-водителя с актуальным GPS, а существующий accepted заказ неприкосновенен.
- Atomic dual-accept, timeout/redispatch, рост `trip_tracks`, завершение, rating, passenger/driver cancellation и network recovery на новом тестовом заказе не подтверждены.
- Доставка push не подтверждена; токенов в обеих таблицах нет.
- Установка APK, вход и основные сценарии на Android-устройстве не проверены.
- CSV export отсутствует в админском UI; оставить как явно не реализованную функцию до утверждения полей экспорта, модели доступа и privacy review.
- 15→16 concurrent admin race не запускался; ordinary-admin и cross-account RLS probes на двух реальных JWT не выполнены.
- Backup artifact/restore drill не подтверждены. Не выполнять новые live DDL-изменения до внешнего backup/restore подтверждения владельцем.
- Юридический sign-off, privacy policy, перевозочные разрешения/страхование, Google Play Data Safety и release keystore не подтверждены.

**Вердикт этого снимка: НЕ ГОТОВО К РЕЛИЗУ.** Технически можно продолжать QA после появления отдельной тестовой водительской сессии и устройства; не объявлять готовность к закрытому тесту до успешной установки и поездки.


## Storage policy review — 24.11.2026 11:42 UTC

- Bucket `ladygo-driver-media` is private (`public=false`), file limit 5 MiB, MIME allowlist JPEG/PNG/WebP. Four objects exist; filenames/content were not read.
- Storage policy catalog shows a second, legacy permissive SELECT policy `ladygo driver media read own or active passenger` that allows an assigned passenger to read any object under the driver's folder. A narrower policy `ladygo driver media read owner admin assigned passenger` also exists and restricts assigned-passenger reads to the exact `avatar_url` / `vehicle_photo_url` paths during an active trip.
- Because permissive RLS policies combine with OR, the broader legacy policy weakens the narrower rule. A review migration was committed: `20261124114000_ladygo_remove_broad_driver_media_select_policy.sql`.
- Migration is **not applied to live Supabase** because a current backup/restore artifact is not confirmed. Keep existing production policy until owner confirms backup and review the migration before applying.
