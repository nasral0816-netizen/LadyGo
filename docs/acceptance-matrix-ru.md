# LadyGo — матрица полноты требований и приёмки

Статус относится к исходникам GitHub и статическим проверкам ветки tech/stabilize-android-dispatch-2026-11-23. «Есть» означает наличие кода/SQL, но не подтверждает работу на удалённом Supabase или Android.

| Функция | Есть в проекте | Работает / подтверждено | Что исправить / проверить |
|---|---|---|---|
| LadyGo, #E84F87, слоган | Да в клиенте и Expo config | Фирменный цвет выровнен в app.json и UI; слоган отображается в шапке | Финально проверить контраст и маркетинговые экраны |
| Регистрация/вход | Да | Supabase Auth код есть; live-тест не выполнен | Проверить подтверждение email и rate limits |
| Восстановление пароля | Не найдено | Нет | Добавить reset flow и deep link |
| Телефон/SMS OTP | Частично | Синтетический email mapping в клиенте | Перейти на Phone Auth/OTP, безопасно мигрировать аккаунты |
| Сессия/logout | Да | AsyncStorage и auth listener есть | Проверить multi-device и отзыв токенов |
| Профиль пассажира | Частично | Чтение есть; в PR добавлен RPC редактирования собственного контактного телефона | Применить migration и проверить валидацию/RLS на live DB; остальные поля профиля требуют доработки |
| Passenger/driver/admin роли | Да | UI и SQL проверки есть | Проверить все grants/RLS на live DB |
| Главный админ | Частично | UI ожидает is_super_admin и admin RPC | Проверить definitions и запрет self-escalation |
| Лимит 15 админов | Исторически заявлено в GitHub Issue #7: миграция add_main_admin_hierarchy применена и лимит реализован RPC | Live DB сейчас недоступна, факт не перепроверен | Получить schema snapshot и негативно проверить 16-го администратора и защиту главного админа |
| Водительская анкета | Да | Форма и SQL review trigger есть | Проверить повторную подачу и блокировку после одобрения |
| Фото/документы | Да | Storage upload и signed URLs есть | Применить private bucket migration, MIME/size/AV |
| Проверка водителя | Частично | Approved application материализует driver_profiles; новая миграция фильтрует verified driver | Применить и проверить блокировку невалидного driver |
| Автомобильный профиль | Да | UI + driver_profiles | Проверить редактирование и signed URLs |
| Создание заказа | Добавлено в ветке | Клиент вызывает pricing-service; HMAC quote проверяется Edge Function; RPC атомарно создаёт заказ и сохраняет idempotency key | Развернуть Edge Function, задать LADYGO_PRICING_SECRET и применить миграцию на staging/live |
| История поездок | Да | orders + загрузка/realtime код | Проверить RLS, пагинацию, multi-device |
| Тестовые заявки | Да | demo_orders отдельно от orders | Маркировка и запрет dispatch для demo |
| Отмена | Да | RPC ladygo_cancel_my_order | Проверить каждый статус и освобождение водителя |
| Подбор водителя | Да, в SQL ветки | Триггер после создания заказа выбирает свежего online verified driver; персональный TTL offer, отказ/истечение ведут к следующему, atomic accept | Применить миграции, deploy dispatch-loop и cron, проверить конкуренцию на staging; улучшить ranking и региональную географию |
| Гонка accept | Да | FOR UPDATE в RPC | Интеграционный тест двух водителей |
| TTL оффера | Да, в SQL ветки | 25 секунд; expire при следующем dispatch | Настроить scheduler; pg_cron fallback — раз в минуту |
| Допуск только проверенных водителей | Добавлено в ветке | SQL проверяет approved application + driver_profiles | Применить миграцию и негативный тест |
| GPS водителя | Да | Expo foreground/background task + heartbeat | Реальный Android тест обязателен |
| GPS пассажиру | Частично | Passenger подписывается на driver_locations | Проверить Realtime и stale state |
| trip_tracks | Добавлено в ветке | Таблица, RLS, RPC; водительские GPS-точки пишутся во время активной поездки | Подключить passenger track и утвердить retention |
| order_events | Добавлено в ветке | DB trigger и RLS | Применить и проверить журнал |
| contact_shares | Добавлено в ветке | Lease + RLS; обе роли получают телефон через узкие RPC, UI показывает контакт и dialer только при активной поездке | Применить миграцию и проверить звонок на Android |
| Чат поездки | Частично | trip_messages client code + realtime | Проверить миграцию, RLS и UI |
| Push токены | Да | Register/unregister RPC в ветке | Применить и проверить token lifecycle |
| Push доставка | Частично | Edge Function и trigger есть | Deploy, Vault/pg_net, Android test |
| Карты/геокодирование | Да | Yandex MapKit | Проверить ключ, лицензию, маршруты |
| Серверная тарификация | Частично реализована в ветке | Подписанный quote, тарифные snapshot и single-use token; оценка пока геодезическая, не дорожная | Подключить server-side Directions API и задать утверждённые тарифы |
| Server final fare | Добавлено в ветке | RPC рассчитывает distance по trip_tracks, duration по времени и final_price по snapshot тарифу; отдельная guard migration разрешает изменение суммы только через RPC завершения | Применить миграции; проверить GPS трек, trigger guard и итоговую цену на двух устройствах |
| Способ оплаты | Частично | payment_method UI | Не считать оплатой |
| Реальные платежи | Нет | Не реализуются в этой задаче | Отдельный PaymentProvider/PCI DSS |
| Поддержка | Да | Tickets/replies/UI есть | Проверить вложения, статусы и push |
| Admin dashboard | Частично | UI пользователей/анкет/заказов/поддержки | Проверить источники статистики и права |
| Admin audit log | Не подтверждено | Полное хранилище не найдено | Добавить после schema snapshot |
| CSV export | Не подтверждено | Не найден | Реализовать с проверкой доступа |
| Избранные/дом/работа/недавние адреса | Не подтверждено | Не найдено | Добавить persistence/UI |
| Язык/тема | Частично | Фиксированная светлая тема | Реализовать или убрать inert controls |
| Offline/retry/drafts | Частично | Перевод сетевых ошибок | Outbox, retry, draft persistence |
| Backup/restore | Не подтверждено | Нет operational proof | Настроить backup и restore drill |
| RLS/Storage | Частично | Миграции есть, private bucket fix в PR; .env исключён из текущего дерева | Проверить live policies/grants и Git history secrets |
| Антивирус документов | Нет | Не найден | Hook/scan before approval |
| Android config | Да | Expo SDK 55, RN 0.83.10, permissions | Проверить rationale/target SDK |
| APK | CI выполняется | На последнем commit проверка/сборка ещё не завершена | Дождаться Gradle и загрузки артефакта, затем установить на Android |
| Android device test | Нет | Физического устройства нет | Два устройства/два аккаунта |
| Юридическая готовность | Нет | Legal checklist подготовлен | Независимый sign-off |

## Подтверждено только по исходникам
Expo SDK 55 и Supabase client; UI пассажира/водителя/админа; анкета и поддержка; SQL/client foundation заказов, офферов и GPS; в PR добавлены статические проверки и SQL hardening.

## Частично реализовано
Реальные заказы, назначение водителя, push, GPS, чат, водительские документы, администрирование, тарификация и синхронизация. Диспетчеризация реализована в коде ветки (trigger + RPC + offer + scheduler), но live Supabase deployment и multi-device E2E ещё не выполнены.

## Отсутствует или не подтверждено
production Directions API для цены; server pricing-service требует deploy/secret; signed create_order и GPS final fare добавлены в PR, но ещё не применены; scheduler требует Vault secret и deployment; подключённая запись trip_tracks; contact UI; полноценный SMS OTP/recovery; admin audit log и лимит 15; offline/outbox; restore test; Android device test.

## Внешние сервисы
Supabase Auth/Postgres/Storage/Realtime/Edge/Vault/pg_net, Expo Push, Yandex Maps или другой региональный провайдер, SMS OTP, антивирус/модерация. Эквайринг — отдельный этап.

## Юридическое согласование
Модель перевозчика, договоры/допуск водителей, поездки с детьми, геолокация, 152-ФЗ/GDPR, retention, privacy policy, Google Play Data Safety/Background Location, страхование и безопасность.

## Не проверено на физическом Android
Фоновый GPS, push при свёрнутом приложении, энергосбережение, dialer, multi-device Realtime и полный цикл на двух аккаунтах. Не объявлять эти сценарии протестированными.


## Live acceptance update — 24.11.2026 (имеет приоритет над исторической матрицей выше)

- Backend Supabase активен. pricing-service v7 (JWT on), send-driver-offer-push v5 (Vault webhook auth) активны.
- Текущая цена и create_order используют city_tariff_configs и price_quotes; tariff_rates/dispatch-loop architecture не включать без отдельной миграции.
- Dispatch triggers/RPC, cron expiration/scheduled-order jobs и GPS-before-online миграция применены; cron активен раз в минуту.
- Лимит 15 обычных администраторов защищён advisory transaction lock в миграции 20261124180000_ladygo_admin_cap_serialization.
- RLS enabled на ключевых таблицах; policy definitions просмотрены, но runtime negative tests под двумя JWT ещё не выполнены.
- Security Advisor: 14 SECURITY DEFINER warnings (authenticated execution) и leaked-password protection disabled. Индивидуальный разбор — docs/security-definer-audit-ru.md.
- 0 online drivers, 0 driver tokens, 0 user tokens, 1 active order (не трогать). Реальный поездочный цикл и push delivery не проверены.
- Runs #404/#405 отменены последующими коммитами; актуальный run #417 выполняет build для head SHA 147e61845aa4f3c4a769b59f3c6de784b72c2fe8. APK artifact ещё не получен, install/login не проверены.
- Платежи, SMS OTP/password recovery, CSV export, admin audit, offline/outbox, backup restore и юридический sign-off остаются непроверенными/незавершёнными.


## Quote route binding — live update 24.11.2026

- pricing-service v7 ACTIVE, verify_jwt=true.
- Миграция 20261124190000_ladygo_quote_route_binding применена: price_quotes хранит координаты pickup/destination, DB trigger сверяет их с заказом; старые quote без координат не принимаются для нового заказа.
- Edge Function create_order дополнительно проверяет совпадение координат quote с запросом.
- Статически подтверждён deploy и наличие колонок; authenticated device order request не выполнялся.



## Live release gate update — 24.11.2026 11:39 UTC (перекрывает исторические статусы выше)

| Модуль | Статус сейчас | Доказательство / следующий шаг |
|---|---|---|
| Пассажирские поездки | Частично | Код читает собственные orders без проверки profile.role; Realtime + polling 5s добавлены для same-account Driver mode. Проверить на APK и двух независимых сессиях. |
| Driver offers | Частично | UI показывает 60-секундный countdown; live DB триггеры dispatch/offer есть. Нет online driver и push tokens, поэтому device offer не подтверждён. |
| Atomic accept | Реализовано по SQL | RPC блокирует строку заказа FOR UPDATE, проверяет собственный неистёкший pending offer, назначает driver_id и отменяет остальные offers. Двойной accept двух независимых клиентов не тестировался. |
| Dispatch | Частично | Trigger chain, cron, 60s offer TTL, service_role-only dispatch RPC подтверждены каталогом. Нет доступного онлайн-водителя с GPS для реального dispatch. |
| RLS | Частично | 23/23 public tables с RLS; A↛B на независимых JWT не проверен. |
| SECURITY DEFINER | Частично | 38 функций; 16 authenticated EXECUTE, 0 anon EXECUTE; Advisor сообщает 16 предупреждений. Нужны JWT runtime probes по каждой exposed RPC. |
| Администраторы | Частично | В БД 1 super-admin, 0 ordinary admin; advisory lock и запрет self-removal видны в функции. Race 15→16 не проверялся. |
| CSV | Отсутствует | Не реализован; отложен до утверждения полей, прав доступа и privacy review. |
| Auth leaked-password | Блокер | Отключён; Supabase organization plan = Free. Требуется владелец/тарифное решение. |
| Backup/restore | Не подтверждено | Backup artifact и restore drill не доступны в подключённой проверке. |
| Android build | В процессе | Run #561; expo-doctor, npm install, Expo prebuild и QA signing setup прошли; Gradle assembleRelease ещё выполняется. apksigner и artifact pending. |
| Android device | Не проверено | Нет доступного adb/emulator и физического QA в текущей среде. |
| Legal | Блокер | Checklist есть; независимый legal/privacy sign-off, перевозочные документы, страхование и Google Play Data Safety не подтверждены. |

**Вердикт: НЕ ГОТОВО К РЕЛИЗУ.** Ни реальная поездка, ни push, ни установка текущего APK на Android не заявляются как проверенные.


### Address book / support detail
- Live `saved_places` table exists, but no client code references it; home/work/favourites/recent address UI persistence is not wired.
- Support currently has one `support_tickets.admin_reply` field only. No attachment table/columns or threaded support messages table was found; attachments and conversation history are absent.
