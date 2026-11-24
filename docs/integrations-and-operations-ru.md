# LadyGo — внешние сервисы и эксплуатация

## Supabase: live snapshot на 24.11.2026

Проект активен (ACTIVE_HEALTHY), регион eu-west-2. Перед изменением live схемы сначала сверяйте migration history и schema diff. Не создавать дублирующие таблицы и не трогать активный заказ.

## Карты, геокодирование и маршруты

Клиент использует картографические компоненты проекта и публичные/ограниченные клиентские ключи. Проверить package/signing restrictions и покрытие целевого региона. Серверная тарификация запрашивает OSRM route endpoint; доступность внешнего маршрутизатора, SLA и условия использования требуют отдельного production решения.

## Геолокация и Realtime

- driver_presence — статус линии; driver_locations — последняя позиция; trip_tracks — точки конкретной поездки.
- Heartbeat доступен одобренному водителю. При переходе online сначала сохраняется свежая GPS-точка, затем меняется presence, чтобы dispatch trigger не увидел водителя без координат.
- Realtime используется для заказов, офферов и локации; клиентский polling — дополнительный fallback.
- Android background location требует реальной проверки permissions, foreground service, энергосбережения и поведения после сворачивания приложения.

## Диспетчеризация

Текущая архитектура — SQL triggers + RPC + cron, без отдельной Edge Function dispatch-loop.

1. Заказ пассажира вставляется через pricing-service после проверки пользователя и записи price_quotes.
2. DB trigger запускает ladygo_dispatch_next_driver.
3. Подбор ограничен одобренными водителями с профилем, свежим heartbeat/GPS, без активной поездки и другого незакрытого оффера.
4. Оффер адресный, TTL — 25 секунд; водитель видит только собственные предложения.
5. ladygo_accept_order блокирует строку заказа и проверяет действующий оффер. Одновременное принятие одним заказом двумя водителями должно завершиться отказом для второго.
6. Отказ/истечение переводит очередь к следующему подходящему водителю; cron закрывает просроченные офферы каждую минуту, клиентский fallback повторяет dispatch RPC при активном ожидании.
7. ladygo_driver_heartbeat пишет координаты до обновления driver_presence.
8. Переходы статусов, contact lease и GPS трек ограничены серверными RPC.

Активные cron jobs:
- ladygo-expire-stale-offers — * * * * *.
- ladygo-dispatch-scheduled-orders — * * * * *.

Отдельный dispatch-loop и LADYGO_DISPATCH_SECRET не используются этой конфигурацией. Не разворачивать их без отдельного архитектурного решения.

## Edge Functions и секреты

- pricing-service: ACTIVE v7, verify_jwt=true. Использует стандартные Supabase Edge environment variables (SUPABASE_URL, anon key, service-role key); JWT пользователя проверяется перед операциями. Отдельный LADYGO_PRICING_SECRET текущей версии не нужен.
- send-driver-offer-push: ACTIVE v5, verify_jwt=false для webhook вызова. Функция проверяет заголовок через ladygo_verify_push_webhook_secret, секрет хранится в Vault; service-role key доступен только в серверной среде.
- Не помещать секреты в приложение, APK, клиентские переменные или Git. Не публиковать ключи в отчётах.

## Push

Клиент регистрирует Expo token через ladygo_register_push_token после авторизации и удаляет его через ladygo_unregister_push_token. Edge Function отправляет уведомления через Expo Push Service и проверяет результат ticket. На момент snapshot в БД 0 driver tokens и 0 user tokens; поэтому доставка на физическое устройство НЕ проверена. Не считать push готовым только по факту deploy функции.

Для проверки нужен Android с разрешением POST_NOTIFICATIONS, успешной регистрацией токена в обеих таблицах согласно роли и подтверждением Expo ticket/delivery.

## Тарификация и платежи

pricing-service использует действующие активные строки city_tariff_configs для города/тарифа, строит дорожный маршрут через OSRM, учитывает параметры тарифа/дополнительных опций и записывает серверную строку price_quotes с истечением срока и координатами pickup/destination. При create_order функция проверяет JWT, роль passenger, quote ownership/expiry/consumed state и совпадение всех координат маршрута, затем вставляет заказ через пользовательскую сессию; DB trigger выполняет серверную проверку quote и запускает dispatch.

Не использовать tariff_rates: эта модель сейчас не активирована и содержит нулевые/неактивные ставки. Не менять активные тарифы без утверждения владельца тарифной сетки.

Реальные платежи не реализованы. payment_method — выбор предпочтительного способа расчёта, а не платёжная транзакция. Не принимать PAN/CVV и не заявлять успешные списания.

## RLS и SECURITY DEFINER

RLS включён на ключевых таблицах: orders, order_offers, profiles, driver_locations, driver_presence, trip_tracks, order_ratings, driver_applications, user_push_tokens, driver_push_tokens, support_tickets. Политики ограничивают чтение заказов участником/администратором/водителем с действующим оффером, а координат — собственным водителем или пассажиром назначенной активной поездки.

Security Advisor на 24.11.2026 показывает 14 предупреждений по SECURITY DEFINER RPC и предупреждение по leaked-password protection. Подробный разбор функций — docs/security-definer-audit-ru.md. Негативные RLS тесты под двумя реальными JWT и тесты admin RBAC на устройствах/стейджинге остаются обязательными.

## Регрессия и эксплуатация

Перед релизом проверить:
- пассажир / водитель / обычный администратор / главный администратор / поддержка;
- чужие заказы, офферы, профили, контакты, GPS треки и push-токены;
- отмену пассажиром и водителем, двойное принятие, истечение оффера, потерю сети и reconnect;
- CSV export, историю, отзывы, рейтинг, уведомления, пустые состояния и повторные нажатия;
- резервную копию и фактическое восстановление;
- Google Play permissions, privacy policy, Data safety, background location и юридический sign-off.

## Что нужно для финального E2E

1. Успешный APK artifact из текущего commit.
2. Android устройство пассажира и устройство одобренного водителя (или эквивалентный эмуляторный setup с реальными сессиями).
3. Авторизация обоих аккаунтов; геолокация и уведомления разрешены.
4. Проверка токена в БД, online heartbeat, order row, offer row, принятие, статусы, GPS, completion, rating.
5. Повторить негативные сценарии и проверить БД после каждого шага.

До выполнения этих шагов реальный цикл поездки и push delivery остаются непроверенными.


## Повторная операционная сверка 24.11.2026

- Android QA build #453 подписан debug identity; файл проверен CI apksigner (v2), но установка и вход на устройстве не выполнены. Build metadata/checksum находятся в README.
- `src/supabase.js` имеет публичный Supabase URL и `sb_publishable_` fallback; это не service_role и не webhook secret. Не считать пустые env secrets CI доказательством отсутствия подключения в APK.
- Live counts: approved drivers=2; online=0; fresh GPS <15m=1; driver push tokens=0; user push tokens=0; active orders=1 (не трогать).
- RLS SQL probes подтверждают ограничения в simulated authenticated contexts; для passenger A/B по 10 не-профильным таблицам получено 0 rows. Это не real JWT/device test.
- Admin probes: пассажир не может list/grant admins; super-admin не может снять собственные права. Concurrency 15/16 и ordinary admin не тестировались.
- Migration `20261124200000_ladygo_phone_input_validation` исправила принятие произвольных букв как команды очистки телефона; live migration применена.
- CSV export не найден в app source. Backup/PITR status и restore drill недоступны через используемые project metadata; owner action required.
- Leaked Password Protection отключён (Security Advisor). Включение требует владельца Supabase Auth settings.
- До двух реальных аккаунтов/устройств, heartbeat online, token registration и end-to-end trip/push не заявлять production readiness.
