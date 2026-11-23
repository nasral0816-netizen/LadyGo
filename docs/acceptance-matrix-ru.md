# LadyGo — матрица полноты требований и приёмки

Статус относится к исходникам GitHub и статическим проверкам ветки tech/stabilize-android-dispatch-2026-11-23. «Есть» означает наличие кода/SQL, но не подтверждает работу на удалённом Supabase или Android.

| Функция | Есть в проекте | Работает / подтверждено | Что исправить / проверить |
|---|---|---|---|
| LadyGo, #E84F87, слоган | Частично | Цвет есть; единый слоган не подтверждён | Проверить бренд и контраст |
| Регистрация/вход | Да | Supabase Auth код есть; live-тест не выполнен | Проверить подтверждение email и rate limits |
| Восстановление пароля | Не найдено | Нет | Добавить reset flow и deep link |
| Телефон/SMS OTP | Частично | Синтетический email mapping в клиенте | Перейти на Phone Auth/OTP, безопасно мигрировать аккаунты |
| Сессия/logout | Да | AsyncStorage и auth listener есть | Проверить multi-device и отзыв токенов |
| Профиль пассажира | Частично | Чтение есть | Проверить редактирование/валидацию |
| Passenger/driver/admin роли | Да | UI и SQL проверки есть | Проверить все grants/RLS на live DB |
| Главный админ | Частично | UI ожидает is_super_admin и admin RPC | Проверить definitions и запрет self-escalation |
| Лимит 15 админов | Не подтверждено | Полная SQL гарантия не найдена | Добавить транзакционный лимит |
| Водительская анкета | Да | Форма и SQL review trigger есть | Проверить повторную подачу и блокировку после одобрения |
| Фото/документы | Да | Storage upload и signed URLs есть | Применить private bucket migration, MIME/size/AV |
| Проверка водителя | Частично | Approved application материализует driver_profiles; новая миграция фильтрует verified driver | Применить и проверить блокировку невалидного driver |
| Автомобильный профиль | Да | UI + driver_profiles | Проверить редактирование и signed URLs |
| Создание заказа | Частично | INSERT orders и dispatch trigger есть | Server RPC с проверкой подписанного quote и idempotency |
| История поездок | Да | orders + загрузка/realtime код | Проверить RLS, пагинацию, multi-device |
| Тестовые заявки | Да | demo_orders отдельно от orders | Маркировка и запрет dispatch для demo |
| Отмена | Да | RPC ladygo_cancel_my_order | Проверить каждый статус и освобождение водителя |
| Подбор водителя | Да | Ближайший свежий online driver | Scheduler, регион, рейтинг и acceptance rate |
| Гонка accept | Да | FOR UPDATE в RPC | Интеграционный тест двух водителей |
| TTL оффера | Да | 25 секунд; expire при следующем dispatch | Scheduler нужен при закрытом passenger app |
| Допуск только проверенных водителей | Добавлено в ветке | SQL проверяет approved application + driver_profiles | Применить миграцию и негативный тест |
| GPS водителя | Да | Expo foreground/background task + heartbeat | Реальный Android тест обязателен |
| GPS пассажиру | Частично | Passenger подписывается на driver_locations | Проверить Realtime и stale state |
| trip_tracks | Добавлено в ветке | Таблица, RLS, RPC; client recording ещё не подключён | Подключить клиент и retention |
| order_events | Добавлено в ветке | DB trigger и RLS | Применить и проверить журнал |
| contact_shares | Добавлено в ветке | Временный lease + RLS | Подключить выдачу телефона и dialer |
| Чат поездки | Частично | trip_messages client code + realtime | Проверить миграцию, RLS и UI |
| Push токены | Да | Register/unregister RPC в ветке | Применить и проверить token lifecycle |
| Push доставка | Частично | Edge Function и trigger есть | Deploy, Vault/pg_net, Android test |
| Карты/геокодирование | Да | Yandex MapKit | Проверить ключ, лицензию, маршруты |
| Серверная тарификация | Не завершено | Клиент вызывает pricing-service, исходника нет | Реализовать функцию и подписанный quote |
| Server final fare | Не найдено | Нет подтверждённого расчёта | Расчёт по фактическому маршруту/тарифу |
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
| RLS/Storage | Частично | Миграции есть, private bucket fix в PR | Проверить live policies/grants |
| Антивирус документов | Нет | Не найден | Hook/scan before approval |
| Android config | Да | Expo SDK 55, RN 0.83.10, permissions | Проверить rationale/target SDK |
| APK | CI в процессе проверки | Expo export success; APK build был in progress | Дождаться результата и установить |
| Android device test | Нет | Физического устройства нет | Два устройства/два аккаунта |
| Юридическая готовность | Нет | Legal checklist подготовлен | Независимый sign-off |

## Подтверждено только по исходникам
Expo SDK 55 и Supabase client; UI пассажира/водителя/админа; анкета и поддержка; SQL/client foundation заказов, офферов и GPS; в PR добавлены статические проверки и SQL hardening.

## Частично реализовано
Реальные заказы, назначение водителя, push, GPS, чат, водительские документы, администрирование, тарификация и синхронизация. Нужны применение миграций и интеграционные тесты.

## Отсутствует или не подтверждено
pricing-service и server quote verification; server create_order; server final fare; гарантированный dispatch scheduler; подключённая запись trip_tracks; contact UI; полноценный SMS OTP/recovery; admin audit log и лимит 15; offline/outbox; restore test; Android device test.

## Внешние сервисы
Supabase Auth/Postgres/Storage/Realtime/Edge/Vault/pg_net, Expo Push, Yandex Maps или другой региональный провайдер, SMS OTP, антивирус/модерация. Эквайринг — отдельный этап.

## Юридическое согласование
Модель перевозчика, договоры/допуск водителей, поездки с детьми, геолокация, 152-ФЗ/GDPR, retention, privacy policy, Google Play Data Safety/Background Location, страхование и безопасность.

## Не проверено на физическом Android
Фоновый GPS, push при свёрнутом приложении, энергосбережение, dialer, multi-device Realtime и полный цикл на двух аккаунтах. Не объявлять эти сценарии протестированными.
