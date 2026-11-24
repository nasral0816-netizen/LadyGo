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
- pricing-service — активная версия 6, JWT verification включён. Создание заказа проверяет авторизованного пассажира, действующую запись price_quotes, срок действия и координаты; вставка заказа запускает существующий DB dispatch trigger.
- Тарификация использует действующую модель city_tariff_configs; не переключать её на неактивную/нулевую tariff_rates без отдельной миграции тарифов.
- send-driver-offer-push — активная версия 5, JWT verification выключен для webhook вызова; авторизация выполняется через секрет из Supabase Vault и RPC-проверку. Service-role key используется только серверной функцией.
- Диспетчеризация работает через DB triggers, клиентский fallback poll и cron для истечения офферов/запланированных заказов. Отдельная dispatch-loop не развёрнута и не требуется текущей схеме; LADYGO_DISPATCH_SECRET не нужен.
- Cron ladygo-expire-stale-offers и ladygo-dispatch-scheduled-orders активны, выполняются раз в минуту.
- Миграция GPS-before-online, сериализация лимита 15 обычных администраторов и привязка quote к координатам маршрута применены к live БД.
- RLS включён на ключевых таблицах заказов, предложений, профилей, геолокации, push-токенов, поддержки и треков.

## Текущий статус GitHub / Android

- Рабочая ветка: fix/order-submit-diagnostics-2026-11-24.
- Draft PR #11: https://github.com/nasral0816-netizen/LadyGo/pull/11
- APK workflow: https://github.com/nasral0816-netizen/LadyGo/actions
- Сборки №404 и №405 на последней проверке находились на шаге Build release APK; артефакты ещё не опубликованы. Не распространяйте APK до успешного CI, скачивания артефакта и проверки SHA-256.
- Установка, запуск, авторизация и поездка на физическом устройстве пока не подтверждены.

## Ограничения и обязательные приёмочные проверки

На момент последней сверки: 2 одобренных водительских аккаунта, 0 онлайн-водителей, 0 driver push-токенов и 0 user push-токенов. В БД есть один активный заказ — не использовать его как тестовый и не изменять.

Поэтому реальный цикл «пассажир → оффер → водитель → GPS → завершение → рейтинг» и доставка push на устройство пока не подтверждены. Нужны две авторизованные Android-сессии (пассажир и одобренный водитель), разрешения геолокации/уведомлений и тестовый сценарий без затрагивания чужих заказов.

Supabase Security Advisor сообщает 14 предупреждений о доступности SECURITY DEFINER RPC для authenticated, а также предупреждение об отключённой защите от скомпрометированных паролей. Эти функции проверяются индивидуально; не отключать нужные RPC и не снимать RLS массово. Отдельный отчёт: docs/security-definer-audit-ru.md.

Реальные платежи не подключены. Выбор «наличные/перевод водителю» — только предпочтение способа расчёта, не подтверждение платежа. Юридическая проверка перевозчика, страхования, персональных данных, Google Play disclosures и согласий ещё требует независимого sign-off.

## Android APK

Release APK собирается GitHub Actions workflow .github/workflows/android-apk.yml. Для каждого релизного файла фиксируйте commit SHA, build run, версию приложения, размер, SHA-256 и дату скачивания. Сам факт успешной сборки не подтверждает E2E/production готовность.


Дополнительная защита цены: миграция 20261124190000_ladygo_quote_route_binding добавляет координаты подачи/назначения в price_quotes; Edge Function и DB trigger сверяют их с маршрутом заказа. Старые quote без координат требуют повторного расчёта.
