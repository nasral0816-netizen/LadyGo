# LadyGo

LadyGo — существующее Android-приложение сервиса поездок на React Native / Expo SDK 55. Этот репозиторий продолжает текущий продукт; отдельное приложение не создаётся.

## Технологии и структура

- React Native / Expo SDK 55, Android release через Gradle.
- Supabase Auth, PostgreSQL, RLS, Realtime, Storage, Edge Functions.
- src/LadyGoApp.js — клиентское приложение и роли.
- supabase/migrations/ — миграции БД; перед новым rollout сверять их с live schema.
- supabase/functions/ — серверные Edge Functions.
- docs/requirements-registry-ru.md — реестр требований и статусы.
- docs/integrations-and-operations-ru.md — фактическая схема интеграций.
- DISPATCH_SETUP_RU.md — архитектура диспетчеризации.
- docs/legal-and-compliance.md — юридический/privacy checklist.
- docs/passenger-guide-ru.md, docs/driver-guide-ru.md, docs/admin-guide-ru.md — инструкции ролей.

## Локальный запуск

Требуются Node.js 22 и Java 17 для Android release-сборки.

    npm install
    cp .env.example .env
    npx expo-doctor
    npx expo start

В клиентской конфигурации допускаются только публичные переменные: EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY, а также ограниченные клиентские ключи карт/геокодирования, если они нужны сборке.

Никогда не добавляйте service_role, webhook secrets, signing secrets или ключи платёжного провайдера в EXPO_PUBLIC_*, APK, .env.example или Git.

## Текущая серверная конфигурация (24.11.2026)

- Supabase project активен, статус ACTIVE_HEALTHY, регион eu-west-2.
- pricing-service — последняя подтверждённая в ходе диагностики версия 9, JWT verification включён; допускает создание заказа пассажиром и одобренным водителем через защищённый authenticated RPC. Создание заказа проверяет авторизованного пассажира, действующую запись price_quotes, срок действия и координаты; вставка заказа запускает существующий DB dispatch trigger.
- Тарификация использует действующую модель city_tariff_configs; не переключать её на неактивную/нулевую tariff_rates без отдельной миграции тарифов.
- send-driver-offer-push — активная версия 5, JWT verification выключен для webhook вызова; авторизация выполняется через секрет из Supabase Vault и RPC-проверку. Service-role key используется только серверной функцией.
- TTL предложения водителю — 15 секунд в БД. Диспетчеризация работает через DB triggers, клиентский fallback poll и cron для истечения офферов/запланированных заказов. Отдельная dispatch-loop не развёрнута и не требуется текущей схеме; LADYGO_DISPATCH_SECRET не нужен.
- Cron ladygo-expire-stale-offers и ladygo-dispatch-scheduled-orders активны, выполняются раз в минуту.
- Миграция GPS-before-online, сериализация лимита 15 обычных администраторов и привязка quote к координатам маршрута применены к live БД.
- RLS включён на ключевых таблицах заказов, предложений, профилей, геолокации, push-токенов, поддержки и треков.

## Текущий статус GitHub / Android

- Рабочая ветка: fix/order-submit-diagnostics-2026-11-24.
- Draft PR #11: https://github.com/nasral0816-netizen/LadyGo/pull/11
- APK workflow: https://github.com/nasral0816-netizen/LadyGo/actions
- Сборки №404/405 отменены. Runs #440 и #441 успешно собрали APK для commit f57e274c24e96224063d2005948bc2b08336eeaf. Полученный app-release.apk (version 6.9.1, versionCode 52) оказался БЕЗ подписи; этот файл не устанавливать и не распространять. Workflow обновляется, чтобы собирать installable QA APK с debug signing; это не production signing.
- Установка, запуск, авторизация и поездка на физическом устройстве пока не подтверждены.

## Ограничения и обязательные приёмочные проверки

На момент последней сверки: 2 одобренных водительских аккаунта, 0 онлайн-водителей, 0 driver push-токенов и 0 user push-токенов. В БД есть один активный заказ — не использовать его как тестовый и не изменять.

Поэтому реальный цикл «пассажир → оффер → водитель → GPS → завершение → рейтинг» и доставка push на устройство пока не подтверждены. Нужны две авторизованные Android-сессии (пассажир и одобренный водитель), разрешения геолокации/уведомлений и тестовый сценарий без затрагивания чужих заказов.

Supabase Security Advisor сообщает 14 предупреждений о доступности SECURITY DEFINER RPC для authenticated, а также предупреждение об отключённой защите от скомпрометированных паролей. Эти функции проверяются индивидуально; не отключать нужные RPC и не снимать RLS массово. Отдельный отчёт: docs/security-definer-audit-ru.md.

Реальные платежи не подключены. Выбор «наличные/перевод водителю» — только предпочтение способа расчёта, не подтверждение платежа. Юридическая проверка перевозчика, страхования, персональных данных, Google Play disclosures и согласий ещё требует независимого sign-off.

## Android APK

APK run #441 (2026-11-24 06:31 UTC) version 6.9.1 (versionCode 52), package com.ladygo.app, размер 252,968,198 bytes, SHA-256 `96040f0e927bda6f582e2b324f441215b0e90650ba692c65798cab3693f0aba6`. Архив CI: 110,242,761 bytes, SHA-256 `33f8aeccb547064bd7f067d2a3728713af7103fc67f73247d58f3fc63a26e10d`. ВАЖНО: проверка архива показала, что APK не подписан (нет APK Signing Block и сертификата); это успешная компиляция, но не installable release. Требуется QA build с debug signing и отдельный release keystore от владельца для production/update.

Release APK собирается GitHub Actions workflow .github/workflows/android-apk.yml. Для каждого релизного файла фиксируйте commit SHA, build run, версию приложения, размер, SHA-256 и дату скачивания. Сам факт успешной сборки не подтверждает E2E/production готовность.


Дополнительная защита цены: миграция 20261124190000_ladygo_quote_route_binding добавляет координаты подачи/назначения в price_quotes; Edge Function и DB trigger сверяют их с маршрутом заказа. Старые quote без координат требуют повторного расчёта.


## QA-сверка 24.11.2026 — актуальное дополнение

- Android Actions run [#453](https://github.com/nasral0816-netizen/LadyGo/actions/runs/45342314598) собрал APK version 6.9.1 / versionCode 52, package `com.ladygo.app`. Скачанный `app-release.apk`: 252,968,198 bytes; SHA-256 `e6994a3b6a1794491245d558c9bf048d4ec3dd0c9156892492ca45b649cac790`; скачан 2026-11-24 07:02 UTC. CI `apksigner` подтвердил APK Signature v2. Это QA APK с Android Debug certificate, не production Play release. Установка на физическом устройстве/эмуляторе не проверена (adb отсутствует).
- Клиентский `src/supabase.js` содержит URL проекта и публичный `sb_publishable_` fallback. Пустые GitHub Actions env secrets сами по себе не отключают Supabase client в этой сборке. Публичный publishable key не является service_role; приватные ключи в клиент не добавлять.
- Live Supabase остаётся ACTIVE_HEALTHY, eu-west-2; pricing-service v7 и send-driver-offer-push v5 активны. Последняя миграция `20261124200000_ladygo_phone_input_validation` применена; исправлена проверка телефонного ввода.
- Live DB snapshot: 2 approved drivers, 0 online drivers, 1 GPS position fresh within 15 minutes, 0 driver push tokens, 0 passenger push tokens, 1 active order. Активный заказ не использовался и не изменялся. Реальный оффер/поездка/push не подтверждены.
- SQL role-context probes: пассажиры A и B видели только собственный профиль (1 row) и 0 rows в orders, order_offers, driver_locations, driver_presence, trip_tracks, order_ratings, driver_applications, user_push_tokens, driver_push_tokens, support_tickets. Одобренный водитель видел свой профиль (1), 2 доступных ему заказа и свою заявку (1); другие проверенные таблицы — 0. Это имитация JWT claims через SET LOCAL ROLE, не независимые подписанные мобильные JWT.
- Дополнительные RPC негативные пробы: passenger не смог cancel foreign order, accept/decline, heartbeat, list/grant admins; не назначенный driver не смог менять trip status или получать passenger contact. Главный администратор не смог снять собственные права. 16-й admin concurrency и ordinary-admin isolation остаются непроверенными.
- CSV export в `src/LadyGoApp.js` не найден. Backup/restore не проверен: доступный Supabase project metadata не предоставляет состояние backup/PITR. Leaked Password Protection остаётся disabled по Security Advisor; требуется владелец проекта.
- PR #11 остаётся Draft/open и не переводится в Ready/merge до устройства, двух независимых сессий, реального trip E2E, push delivery и legal sign-off.


## Актуальная сверка после QA build #453 (24.11.2026; этот раздел имеет приоритет над историческими снимками выше)

- GitHub Actions run #453: https://github.com/nasral0816-netizen/LadyGo/actions/runs/45342314598 — Gradle BUILD SUCCESSFUL; APK подписан debug-сертификатом и проверен apksigner (APK Signature Scheme v2=true, 1 signer, CN=Android Debug). Это QA APK, не Play Store release.
- Артефакт: https://github.com/nasral0816-netizen/LadyGo/actions/runs/45342314598/artifacts/14896897554 (retention 14 дней). Версия 6.9.1, versionCode 52, package com.ladygo.app, 252,968,198 bytes, SHA-256 e6994a3b6a1794491245d558c9bf048d4ec3dd0c9156892492ca45b649cac790. Файл скачан и контрольная сумма повторно вычислена локально.
- Важное уточнение конфигурации: Actions env для EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY в этом запуске пусты, но src/supabase.js содержит fallback на URL проекта и публичный sb_publishable_ ключ. Поэтому утверждать, что APK лишён Supabase URL/key, неверно. Публичный publishable key допустим в клиенте; service_role и Vault secrets в приложении отсутствуют.
- На runner нет установленного adb; доступного Android-устройства/эмулятора нет. Установка, первый запуск, вход и runtime-проверка на телефоне не подтверждены.
- Live Supabase на последней сверке: ACTIVE_HEALTHY, eu-west-2; 2 одобренных водителя, 0 online, 1 GPS location свежее 15 минут, 0 driver push tokens, 0 user push tokens, 1 активный заказ. Активный заказ не использовался и не изменялся. Поездка и push delivery не подтверждены.
- RLS SQL-пробы с разными request.jwt.claim.sub: два passenger-контекста видят только собственный профиль (1) и 0 строк в orders, order_offers, driver_locations, driver_presence, trip_tracks, order_ratings, driver_applications, push tokens и support_tickets. Одобренный driver-контекст видит собственный профиль и 2 связанные с ним записи orders; не видит offers, locations, tokens, support или trip_tracks. Это SQL role/claim simulation, не две сессии с реальными подписанными JWT.
- Security Advisor: 14 exposed SECURITY DEFINER RPC warnings; 14/14 имеют function-level search_path, authenticated EXECUTE, anon EXECUTE отсутствует. Проведены ограниченные негативные SQL-пробы; см. docs/security-definer-audit-ru.md. Не отзывать grants массово.
- Администраторы: 1 super-admin, 0 обычных admin. В транзакционных probes подтверждены запрет self-removal главного, запрет снятия другого super-admin, запрет обычному admin управлять admin-ролями. Обычный admin тестировался временной сменой роли существующего тестового профиля с ROLLBACK; постоянный аккаунт не создавался. Concurrent 15/16 test не выполнен.
- CSV export в админ-панели не найден в исходниках; функция отсутствует и не должна считаться реализованной. Backup/restore и наличие свежего backup через доступные интеграции проверить не удалось; destructive DB-изменения не выполнялись.
- Leaked Password Protection отключена по Security Advisor. Организация Supabase на Free plan; Supabase указывает, что эта функция доступна на Pro и выше. Владелец должен решить вопрос тарифа и включить настройку в Auth settings.
- PR #11 остаётся Draft. Не переводить в Ready и не объединять до подтверждения реального trip cycle, push delivery, device QA и оставшихся security gates.


## Дополнение после исправления отмены (24.11.2026)

- Заказ владельца по маршруту Зеленогорская улица, 28 → Мечеть, Кисловодск отменён в БД через authenticated RPC; статус `cancelled`, запись сохранена в истории. Активных заказов по маршруту не осталось.
- Исправлено имя RPC в клиенте: `cancel_my_order` → `ladygo_cancel_my_order`. Серверная проверка ограничивает отмену собственным новым неназначенным заказом.
- Применены migrations `20261124072817_ladygo_owner_cancel_unassigned_order` и `20261124072830_ladygo_passenger_cancel_order_rpc`.
- Прямой EXECUTE для `ladygo_dispatch_next_driver` отозван у authenticated/anon; service_role доступ сохранён. Проверено ACL-запросом.
- Live snapshot после отмены: 1 online driver, 1 свежая GPS-точка, 0 push-токенов водителя/пассажира, 0 активных заказов. Push delivery и реальный trip E2E остаются непроверенными.
- Сборка с этими изменениями выполняется; предыдущий APK #453 не содержит последнюю правку отмены и не является актуальной сборкой для проверки кнопки.


## Повторная проверка release gates (24.11.2026, 11:35 UTC)

Актуальный статус подтверждается также в `docs/qa/2026-11-24-final-qa-snapshot.md` и `docs/requirements-registry-ru.md`.

- Live Supabase: `ACTIVE_HEALTHY`, PostgreSQL 17.11, регион `eu-west-2`. Edge Function `pricing-service` — v9, JWT verification включён; `send-driver-offer-push` — v5, секрет webhook проверяется сервером через Vault.
- Live dispatch triggers присутствуют; оба cron задания `ladygo-expire-stale-offers` и `ladygo-dispatch-scheduled-orders` завершили последние запуски со статусом `succeeded` в 11:34 UTC.
- Read-only DB snapshot: 2 одобренных driver profiles, 0 online; 1 существующий accepted order, который не изменяется и не используется для теста; 0 driver push tokens и 0 user push tokens. Реальная поездка и push delivery не подтверждены.
- RLS включён на 23/23 обычных таблиц `public`. Live catalog содержит 38 `SECURITY DEFINER` функций; 16 имеют EXECUTE для authenticated, 0 для anon. Это не отменяет необходимости JWT runtime tests.
- Android: app version 6.9.1, versionCode 52, package `com.ladygo.app`. Build runs #552/#553 и #554–#558 были отменены при конкурирующих push/PR событиях. Workflow исправлен: один push build на ветку, документационные изменения не запускают APK build, добавлен `npx expo-doctor`. Run #559 запущен/ожидает выполнения на commit `f6aaececd7129d15ce1d7c96c2cd99662d1e7ad0`; пока нет подтверждённого artifact для этого head.
- CI signing — временный Android Debug certificate для QA. Google Play release keystore владельца отсутствует/не подтверждён.
- CSV export отсутствует; Leaked Password Protection отключён; backup/restore drill не подтверждён; legal/privacy sign-off отсутствует.

**Релизный статус: НЕ ГОТОВО К РЕЛИЗУ.** Не публиковать текущую сборку в Google Play. Нужны полный trip E2E на отдельном тестовом заказе, push/device QA, APK artifact с проверенным сертификатом, release keystore и юридическая приёмка.
