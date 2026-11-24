# LadyGo — технический аудит и план безопасного завершения
Дата live-сверки: 24.11.2026. Репозиторий: nasral0816-netizen/LadyGo, ветка fix/order-submit-diagnostics-2026-11-24, draft PR #11.

## Подтверждено на live Supabase

- Проект активен: ACTIVE_HEALTHY, регион eu-west-2.
- pricing-service v7 активна, verify_jwt=true; send-driver-offer-push v5 активна, verify_jwt=false с Vault-backed webhook validation.
- Действующая модель тарифов — city_tariff_configs; неактивная/нулевая tariff_rates не используется.
- Создание заказа реализовано в pricing-service v7: JWT/роль пассажира, принадлежащий пассажиру действующий price_quotes, expiry/consumed checks, адреса/координаты; quote хранит pickup/destination и Edge Function + DB trigger сверяют маршрут заказа с рассчитанным маршрутом.
- Диспетчеризация — SQL triggers + RPC + Realtime + клиентский fallback polling. Отдельной dispatch-loop нет и не требуется текущей схеме.
- Cron ladygo-expire-stale-offers и ladygo-dispatch-scheduled-orders активны каждую минуту.
- Миграция GPS-before-online применена: driver_locations сохраняется до переключения driver_presence.
- Миграция сериализации лимита 15 обычных администраторов применена.
- RLS включён на ключевых таблицах orders, order_offers, profiles, driver_locations, driver_presence, trip_tracks, ratings, driver applications, push tokens и support.
- В БД 2 одобренных водителя, 0 онлайн, 0 driver push tokens, 0 user push tokens, 0 обычных администраторов, 1 главный администратор и 1 активный заказ. Активный заказ не трогать.

## Изменения PR #11

- Диагностика ошибок создания заказа и передача координат pickup/destination.
- create_order в pricing-service v7 с использованием текущей price_quotes и city_tariff_configs.
- Совместимость с существующей order_offers и расширенным driver-contact RPC.
- Защита триггерной диспетчеризации от некорректного контекста вызова.
- Проверенные водительские анкеты, атомарное принятие, статусы, GPS tracking и contact lease.
- Push token lifecycle и серверная Edge Function отправки.
- GPS-before-online migration.
- Сериализация лимита администраторов advisory transaction lock.
- Обновлены README, операционные документы, dispatch setup, admin guide, legal checklist и requirements registry; добавлен SECURITY DEFINER audit.

## SECURITY DEFINER / RLS

Supabase Security Advisor сообщает 14 предупреждений по SECURITY DEFINER RPC, доступным authenticated, и отдельное предупреждение Leaked Password Protection Disabled. Для 14 функций проверены закреплённый search_path, grants authenticated/anon, auth.uid и ограничения по владельцу/роли/участию. anon EXECUTE запрещён. Подробная таблица: docs/security-definer-audit-ru.md.

RLS/policy definitions просмотрены SQL. Это не равно runtime negative tests под независимыми JWT. Их ещё нужно провести на staging для чужих заказов, офферов, профилей, контактов, GPS, push tokens и support.

## Не подтверждено

- Runs #404/#405 отменены. Runs #440 и #441 завершились success для commit f57e274c24e96224063d2005948bc2b08336eeaf и artifact получен. APK version 6.9.1 / versionCode 52 (com.ladygo.app), размер 252,968,198 bytes, SHA-256 96040f0e927bda6f582e2b324f441215b0e90650ba692c65798cab3693f0aba6. Однако APK unsigned: APK Signing Block отсутствует, сертификата нет. Он не устанавливаем; исправляется workflow QA debug signing. Production signing key нужен от владельца.
- APK установка, первый запуск, login и runtime permissions на Android.
- Реальный passenger order с авторизованной сессией.
- Online heartbeat с устройства, push token registration и реальная Expo push delivery.
- Полный trip lifecycle: offer → accept → arrived → in_progress → completed, GPS samples, fare finalization, rating/history.
- Пассажирская и водительская отмены, двойное принятие, network loss/reconnect.
- Полная регрессия ролей, CSV export, support, admin audit, password recovery, offline/outbox, backup restore.
- Юридический/privacy sign-off, лицензии перевозчика, страхование и Google Play Data Safety/Background Location.

## Риски и безопасные ограничения

- Не менять существующий активный заказ и не использовать его как тестовый.
- Не публиковать service_role, Vault secrets или приватные ключи; не класть их в APK.
- Не отключать RLS и не отзывать массово EXECUTE у нужных RPC.
- Не применять миграции повторно; live migration history содержит 20261124180000_ladygo_admin_cap_serialization.
- Не считать deploy, SQL policy inspection или CI build доказательством real device E2E.
- Не включать реальные платежи без провайдера, legal/security review и отдельной приёмки.

## Следующие шаги

1. Обновить workflow: подписывать QA APK debug key, проверить apksigner verify; production keystore получить от владельца.
2. Установить APK и проверить запуск/login на Android; если устройство недоступно — явно оставить это непроверенным.
3. Получить два отдельных Android устройства/эмулятора и две тестовые сессии.
4. Проверить push token, online heartbeat, заказ, offer, accept, статусы, GPS, completion, rating и DB state на каждом шаге.
5. Пройти негативные RLS/RBAC тесты и полный регрессионный чек-лист.
6. Получить независимый legal/privacy/security sign-off до пилота.
