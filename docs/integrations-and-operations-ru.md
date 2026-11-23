# LadyGo — внешние сервисы и эксплуатация

## Карты, геокодирование и маршруты
Текущий клиент использует Yandex MapKit для карты, геокодирования и маршрута. Перед production проверить доступность, лицензию, покрытие, стоимость и условия использования в целевом регионе. Ограничить клиентский SDK key по Android package com.ladygo.app и сертификату подписи. Приватные серверные ключи не включать в APK.

Альтернативы: Google Maps Platform, Mapbox или региональный поставщик. Выбор зависит от страны, договоров, цены и требований к локализации. Серверную цену нельзя рассчитывать по клиентскому расстоянию или сумме.

## Геолокация и Realtime
- driver_presence — существующий аналог online/availability; активный заказ выводится из orders. Не создавать вторую таблицу availability без необходимости.
- driver_locations — последняя позиция; trip_tracks — история координат участников конкретной поездки.
- Realtime используется для orders, order_offers, driver_locations и чата. Публикации и RLS нужно сверить с удалённой БД.
- Android background location использует Expo Location + foreground service; нужны ручные тесты разрешений, энергосбережения и перезапуска.

## Push
Поставщик — Expo Push Service через expo-notifications. Клиент регистрирует токен через ladygo_register_push_token и удаляет через ladygo_unregister_push_token. Edge Function send-driver-offer-push использует Vault secret ladygo_push_webhook_secret и service-role key только на сервере. Требуются Vault, pg_net, применённые миграции, deployment функции и проверка доставки на Android. Push — best effort; при возврате приложения данные обновляются из Supabase.

## SMS и авторизация
Текущая основа — Supabase Auth email/password; телефонная форма с синтетическим email не является полноценным SMS OTP. Выбрать Twilio, Vonage или локального оператора по региону, включить Supabase Phone Auth/OTP или серверную интеграцию, rate limit и антибот. Безопасно мигрировать существующие аккаунты. Восстановление пароля — отдельный сценарий, требующий реализации и теста.

## Тарификация и платежи
Клиент вызывает Edge Function pricing-service. В этой ветке добавлены подписанный HMAC quote (90 секунд), привязка к пассажиру/тарифу/координатам, запись hash quote в БД и атомарный RPC ladygo_create_order_from_quote с idempotency key. Списание денег не выполняется. Текущий UI предлагает только наличные или перевод водителю; это предпочтение, а не процессинг. Цена предварительного предложения пока рассчитывается по серверной геодезической оценке (прямая дистанция × 1,3), а не по дорожному маршруту; для production нужно подключить серверный Directions API и сверить цену с фактическим GPS-треком. Финальная цена в миграции рассчитывается сервером по trip_tracks и времени поездки с тарифным snapshot. Тарифы изначально выключены и нулевые: администратор должен задать реальные ставки и включить их. Для функции требуется Supabase secret LADYGO_PRICING_SECRET (не менее 32 случайных символов). Для явного отказа от неподключённой оплаты добавлена Edge Function payment-service: она проверяет сессию и возвращает HTTP 501 с PAYMENT_PROVIDER_NOT_CONFIGURED, не создавая платёж и не принимая реквизиты. Реальные платежи не реализованы; будущую оплату делать через серверный PaymentProvider adapter и лицензированный эквайринг, без PAN/CVV.

## Supabase deployment checklist
1. Получить актуальный schema snapshot удалённого проекта.
2. Сверить supabase_migrations.schema_migrations с именами файлов.
3. Проверить RLS, grants, triggers, Realtime publication, Storage policies, Vault, pg_net и Edge Functions.
4. Сделать резервную копию и проверить restore plan.
5. Применять миграции сначала в staging, затем после согласования в production.
6. Не запускать миграции повторно вручную и не менять исторические миграции, уже применённые на удалённой БД.

## Секреты
Серверные секреты (только в Supabase secrets/Vault): SUPABASE_SERVICE_ROLE_KEY, webhook secrets, pricing signing secret и секреты OTP/payment provider. Публичный anon/publishable key и ограниченный Maps SDK key могут находиться в клиентской конфигурации. Service-role, JWT signing secret и webhook/payment secrets — только на сервере.

## Диспетчеризация: текущие ограничения
Существующая схема начинает поиск триггером после вставки заказа, выбирает ближайшего свежего online водителя, создаёт персональный оффер с TTL 25 секунд, атомарно принимает его и переходит к следующему при отказе или следующем вызове dispatch после истечения TTL. Новая миграция добавляет обязательную проверку одобренной водительской анкеты и профиля.

Ветка добавляет Edge Function dispatch-loop: она сканирует незавершённые заказы и вызывает серверный dispatch RPC с service_role. Дополнительная миграция пытается подключить pg_cron + pg_net scheduler раз в минуту, только если расширения и Vault secret ladygo_dispatch_secret уже настроены. TTL предложения — 25 секунд; при минутном cron возможна пауза до 35 секунд после истечения. Для более быстрой очереди нужен отдельный scheduler с интервалом 15–30 секунд. Опрос клиента каждые 12 секунд остаётся только дополнительным fallback и не заменяет scheduler. Для функции требуется одинаковый случайный secret LADYGO_DISPATCH_SECRET в Supabase Edge secrets и ladygo_dispatch_secret в Vault (не менее 32 символов); передавать его только заголовком x-ladygo-dispatch-secret из scheduler. Pricing Edge Function отдельно требует LADYGO_PRICING_SECRET. Не помещать секрет в приложение или Git. Текущая сортировка ориентируется прежде всего на расстояние и свежесть GPS, не на acceptance_rate/rating; это не эквивалент алгоритма Яндекс Go.

## Проверка интеграций
- [ ] Карты проверены в целевом регионе на реальных адресах.
- [ ] pricing-service развёрнута, LADYGO_PRICING_SECRET задан, quote подписан и проверяется при создании заказа.
- [ ] Реальный серверный Directions provider настроен; геодезическая предварительная оценка заменена/сверена с road route.
- [ ] В tariff_rates заданы реальные ставки, ставки утверждены владельцем тарифа и is_active=true.
- [ ] Push function развёрнута, Vault/pg_net настроены, доставка проверена.
- [ ] SMS OTP и восстановление пароля проверены.
- [ ] Supabase migrations/RLS/Realtime/Storage сверены с живой БД.
- [ ] Background location проверена при свёрнутом приложении и энергосбережении.
- [ ] dispatch-loop развёрнут, LADYGO_DISPATCH_SECRET настроен, scheduler вызывает функцию после закрытия passenger app.
- [ ] PaymentProvider спроектирован; реальные платежи выключены.
