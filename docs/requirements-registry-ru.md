# LadyGo — единый реестр требований владельца

Дата первичной сверки: 24.11.2026. Первоначальные строки ниже отражают исторический снимок исходников; актуальная live-сверка в дополнении в конце документа имеет приоритет. Источники: доступная история LadyGo, live Supabase, GitHub PR #11 и Actions. Реестр отражает только доступную историю; он не является доказательством live-поведения.

Статусы: **Есть в коде** — найдено в репозитории; **Частично** — есть только часть потока; **Не проверено** — нужен Supabase/устройство/E2E; **Нет** — не найдено; **Отложено владельцем** — прямо исключено из этого этапа.

| № | Требование владельца | Запрашивалось | Состояние по исходникам | Проверено фактически | Что осталось |
|---:|---|---|---|---|---|
| 1 | Продолжать существующий nasral0816-netizen/LadyGo, не создавать новое приложение и не менять LadyGo2 | Да | Соблюдено: PR #11 в основной репозиторий | Да, GitHub PR | Не объединять без review |
| 2 | Сохранять рабочие функции и данные, не дублировать таблицы, не отключать RLS, не класть service_role в клиент | Да | Принято как ограничение; миграции additive, но требуют schema diff | Частично: статические проверки | Live RLS/schema audit, backup/restore |
| 3 | Отдельная ветка, логические коммиты, PR, CI; не заявлять непроверенное | Да | Ветка и PR #11 Draft | Да, GitHub | Финальный CI/build, независимый review |
| 4 | Полный аудит RN/Expo SDK55/Supabase/GitHub Actions/Android | Да | TECHNICAL_AUDIT_RU.md и acceptance matrix | Статические/CI частично | Live DB и device audit |
| 5 | LadyGo branding: #E84F87, слоган «Поездки с заботой» | Да | Есть в UI/config | Конфиг и export | Проверка всех экранов/контраста |
| 6 | Премиальная строгая минималистичная иконка: пыльно-розовый/белый, автомобиль, LadyGo, квадрат, без декора; PNG и белые края | Да, 16.11 | Ранее был выдан PNG 1254×1254 | Не проверено в текущем PR | Подтвердить файл в Google Play assets при необходимости |
| 7 | Регистрация пассажира, авторизация, выход, восстановление доступа | Да | Auth/session/logout есть; recovery/deep link не подтверждены | Нет полного E2E | Password recovery, OTP, rate limit |
| 8 | Профиль пассажира: просмотр, редактирование, настройки | Да | Просмотр профиля есть; добавлены собственный phone update RPC и UI редактирования контакта | CI/static contract после нового run; live DB не проверена | Применить migration; реализовать остальные настройки и поля профиля |
| 9 | Адреса: ввод, поиск, геокодирование, карта, маршрут | Да | UI карты/поиска/маршрута есть | Expo export only | Проверить провайдера, ключи, реальные адреса и route |
| 10 | Предварительная стоимость, выбор тарифа, предпочтительный способ оплаты | Да | Клиентский тариф/payment preference; PR добавляет server quote | Нет live тарификации | Road Directions API, утверждённые ставки, тест quote; реальные платежи запрещены |
| 11 | Сохранение заявок, история, поиск/фильтры, избранное, дом/работа, последние адреса | Да | Заказы/история и избранные адреса есть; остальные детали частично | Нет полного E2E | Проверить каждую операцию и синхронизацию |
| 12 | Отмена тестовых заявок и обработка ошибок/сети | Да | Отмена/ошибки частично присутствуют | Нет | Offline/reconnect, duplicate requests, retry |
| 13 | Водительская регистрация, анкета, редактирование, автомобиль | Да | Форма и driver_profiles/application flow есть | Нет live DB test | Проверить поля, повторную подачу, ограничения |
| 14 | Фото/документы водителя и безопасное хранение | Да | Upload есть; PR добавляет private bucket policy | CI статически, live storage нет | Применить после schema review; проверить чужой доступ и signed URLs |
| 15 | Статус проверки, approve/reject, повторная подача, уведомления | Да | Admin UI/review trigger частично есть | Нет | Проверить транзакции, статусы, уведомления и повторную подачу |
| 16 | Главный администратор и до 15 обычных администраторов | Да | UI/роль super-admin частично присутствуют | Нет | Проверить атомарный лимит 15 и защиту последнего super-admin |
| 17 | Назначение/снятие админов, разграничение полномочий | Да | UI/RPC ожидания есть | Нет live RBAC tests | Проверить grants, self-escalation и role audit |
| 18 | Пользователи, поиск, анкеты, документы, история и статистика | Да | Часть admin UI найдена | Нет | Полный функциональный аудит и пагинация/поиск |
| 19 | Поддержка: обращения, категории, вложения, переписка, статусы, закрытие | Да | Tickets и ответы администратора есть; вложения/категории не подтверждены | Нет E2E | Довести вложения, категории, закрытие, уведомления |
| 20 | Жалобы, поддержка, ответы, экспорт CSV | Да | Частично/не подтверждено | Нет | Реализовать/проверить жалобы и CSV export |
| 21 | Audit log административных действий и изменения ролей | Да | Не подтверждено полноценным SQL | Нет | Транзакционный append-only audit и review |
| 22 | Внутренние уведомления: регистрация, профиль, анкета, поддержка, роли, системные сообщения | Да | Notification tables/triggers частично есть | Нет | Проверить события и пользовательские настройки |
| 23 | Push: Expo token lifecycle, foreground/background, серверная отправка | Да | В PR добавлены token RPC/foreground; существующая push Edge Function | CI type/static only | Supabase deploy, Expo credentials, delivery tests |
| 24 | Реальная диспетчеризация: создание заказа, подбор водителя, offer, accept, статусы, контакты, GPS, чат, рейтинг и история | Да, неоднократно | Есть DB state machine, trigger на создание заказа, подбор проверенного водителя, offer TTL, atomic accept, отмена, GPS RPC, realtime и UI; в PR усилены guards | Не проверено на live Supabase и двух устройствах | Применить миграции после schema review, развернуть Edge Functions/Vault/cron, провести multi-account E2E и legal/privacy review |
| 25 | Автоматический scheduler/dispatch loop | Да | Edge Function dispatch-loop с server-only secret и pg_cron/pg_net/Vault migration присутствуют в PR; функция повторно подбирает водителей для нераспределённых заказов | Статически в коде; live invocation и cron не проверены | Задать секреты в Supabase, применить migration, deploy function и проверить cron/logs на staging |
| 26 | Реальные платежи за поездки | Да, с условием не заявлять работу без провайдера | Эквайринг не подключён; payment-service stub явно возвращает PAYMENT_PROVIDER_NOT_CONFIGURED/501 и не принимает деньги | Статически по исходникам; live deploy не выполнен | Подключить лицензированного провайдера, выполнить PCI/security/legal review и тесты sandbox перед включением |
| 27 | Server quote / idempotent сохранение заявки | Запрошено как техническая надёжность | Edge Function и SQL migration добавлены в PR | CI type/static; live DB нет | Применение staging, проверка тарифов/road route, review SQL |
| 28 | RLS, roles, SECURITY DEFINER, search_path, grants | Да | PR содержит часть hardening; исходные миграции присутствуют | Статические проверки, не live | Полный независимый SQL/RLS audit |
| 29 | Защита Storage и документов от чужого доступа | Да | Private media migration в PR | Не проверено на live Storage | Применить и проверить негативными тестами |
| 30 | Секреты, env, валидация, replay/idempotency, ошибки | Да | .env удалён из дерева, .env.example/.gitignore; quote/idempotency additions | Частично | Проверить Git history; revoke возможных утёкших ключей; test replay |
| 31 | Производительность, навигация, пустые экраны, загрузки, повторные запросы | Да | Есть отдельные UI состояния, но полный аудит не завершён | Нет device QA | Полный экранный и network QA |
| 32 | Offline/outbox и восстановление соединения | Да | Не найдено полноценной реализации | Нет | Реализовать и тестировать |
| 33 | Резервное копирование и восстановление Supabase | Да | В документации как требование | Нет | Настроить backup/PITR и restore drill |
| 34 | SMS OTP и безопасное восстановление телефона/аккаунта | Да | Не завершено | Нет | SMS provider, abuse/rate limits, migration path |
| 35 | Интеграции: карты, маршруты, SMS, Expo Push, moderation/antivirus | Да | Карты/push частично; прочие отсутствуют/неподтверждены | Нет end-to-end | Ключи, договоры, deploy, security tests |
| 36 | Документы: README, установка, Supabase, env, passenger/driver/admin, security, legal | Да | README, audit, integration, legal, acceptance docs обновлены/добавлены | Текстовая проверка | Дописать подробные пользовательские руководства после QA |
| 37 | Право: GDPR/152-ФЗ, лицензии/договоры перевозчиков, страхование, Google Play disclosures | Да | legal checklist подготовлен | Нет legal sign-off | Независимый юрист/ответственный по ПД/оператор |
| 38 | Android config, package, permissions, Expo compatibility | Да | Expo config/doctor и export проходят на CI | Да, CI для конкретного commit | Проверить runtime permission и реальное устройство |
| 39 | Release APK из актуального commit, целостность и установка | Да | GitHub Gradle workflow | APK build пока выполняется для последнего SHA; artifact ещё не опубликован | Дождаться build/upload, проверить checksum/install |
| 40 | QA пассажир/водитель/admin, несколько аккаунтов/устройств, сеть, storage, notifications | Да | План/матрица есть | Нет полного E2E | Нужны синтетические аккаунты, staging и два устройства |

## Итоговая классификация

- **Есть в исходниках:** основные роли/UI, auth/session, профиль, водительская анкета, карта/маршрут, orders/history, избранное, чат, support базовый, admin review базовый, SQL/RLS foundations, push function foundation.
- **Частично:** профили, driver onboarding/review, push, support, admin RBAC, pricing, notifications, privacy/storage, обработка ошибок.
- **Не подтверждено или отсутствует:** password recovery/phone OTP end-to-end, admin cap 15 и audit, CSV, attachments/moderation, offline/outbox, backup restore, complete device tests, live DB RLS review.
- **Требует внешних сервисов:** SMS, server Directions, Expo Push credentials/deployment, antivirus/moderation, monitoring.
- **Требует доступа владельца/оператора:** Supabase project/schema, secrets, deployment, staging accounts, Android devices, legal/contract approvals.
- **Не подключено:** реальные платежи (нет подключённого провайдера; есть fail-closed stub). **Обязательная часть текущего задания:** диспетчеризация и координация поездок; код подготовлен в PR, но live deployment/E2E ещё не пройдены.

## Контроль безопасности

Часть миграций PR #11 применена к live Supabase; точный список и live snapshot см. в актуальном дополнении. Не повторять миграции вручную. Перед применением — резервная копия, schema diff, staging, review grants/RLS и письменный rollout plan. Не запускать коммерческий пилот до проверки схемы, RLS, функций, фонового GPS, согласий и правовой готовности. Платёжный провайдер в текущей реализации отсутствует.



---

## Актуальная live-сверка 24.11.2026 (дополнение, имеет приоритет над устаревшими формулировками выше)

| № | Функция | Запрашивалась | Реализована | Проверена | Что осталось |
|---:|---|---|---|---|---|
| 1 | Продолжение существующего приложения LadyGo | Да | Да, существующий репозиторий/ветка | GitHub PR #11 открыт, draft | Независимый review и merge после приёмки |
| 2 | Исправление создания заказа пассажиром | Да | Да: pricing-service v7 поддерживает create_order, проверяет JWT/роль/price_quotes/координаты | Деплой и live function inventory подтверждены | Нет authenticated device request; проверить реальный заказ |
| 3 | Серверная тарификация | Да | Да: city_tariff_configs + price_quotes + OSRM route | Конфигурация live и активные тарифы подтверждены | Сверить маршрут/тариф на реальных маршрутах и согласовать ставки |
| 4 | Триггерная диспетчеризация | Да | Да: DB trigger + offer TTL + atomic accept + client fallback | Миграции/функции и cron проверены; онлайн-водителей 0 | Нужен E2E с двумя водителями и пассажиром |
| 5 | Обработка истёкших офферов/запланированных заказов | Да | Да: два cron job каждую минуту | Активность jobs подтверждена SQL | Проверить поведение с реальными офферами и логами |
| 6 | GPS до включения водителя online | Да | Да: heartbeat пишет driver_locations перед driver_presence | Миграция 20261124170000 применена | Проверить реальный heartbeat и background GPS |
| 7 | Push lifecycle и отправка | Да | Да: token RPC и send-driver-offer-push v5 | Edge Function активна, Vault secret проверен; токенов 0 | Нет устройства/токена, доставка не проверена |
| 8 | Лимит 15 администраторов и защита главного | Да | Да: RPC + сериализация выдачи advisory lock | Миграция 20261124180000 применена; count 0 обычных/1 главный | Негативные RBAC тесты и concurrent test |
| 9 | SECURITY DEFINER audit | Да | Частично: 14 функций разобраны индивидуально | search_path, grants, auth.uid и контекст проверены SQL | 14 generic Advisor warnings остаются; runtime negative JWT tests |
| 10 | RLS чужих данных | Да | Политики на ключевых таблицах включены | RLS/policies inspected SQL | Нужны negative tests под независимыми JWT; не считать завершённым |
| 11 | Реальная поездка пассажир—водитель | Да | Кодовые компоненты есть | Не проверено на устройствах | Нет онлайн-водителя, двух активных сессий и device QA |
| 12 | Установка/вход APK | Да | Workflow настроен | Runs #404/#405 на последней проверке ещё выполняли Gradle build | Дождаться artifact, SHA-256, установить и войти |
| 13 | Регрессия пассажир/водитель/admin/support/CSV | Да | Частично в коде | Полная регрессия не выполнена | Ролевые сценарии, CSV, уведомления, network/offline, пустые состояния |
| 14 | Документация и legal | Да | README, интеграции, dispatch, admin guide и legal обновлены | Изменения находятся в PR ветке | Подробные пользовательские процедуры и юридический sign-off |

### Текущие live факты

- Supabase: ACTIVE_HEALTHY, eu-west-2.
- Edge Functions: pricing-service v7 (verify_jwt=true), send-driver-offer-push v5 (verify_jwt=false с Vault-backed webhook auth).
- Cron: ladygo-expire-stale-offers и ladygo-dispatch-scheduled-orders, оба активны каждую минуту. Отдельной dispatch-loop нет и не требуется текущей архитектуре.
- Миграции применены до 20261124190000_ladygo_quote_route_binding; не повторять их вручную. Последняя Edge Function pricing-service v7.
- В БД: 0 online drivers, 0 driver push tokens, 0 user push tokens, 1 active order. Активный заказ не трогать.
- PR #11 draft открыт; runs #404/#405 ещё не предоставили APK artifact на последней проверке.
- Установка APK, вход, доставка push, реальная поездка и runtime negative RLS tests не подтверждены.


Дополнение: миграция 20261124190000_ladygo_quote_route_binding применена, pricing-service v7 развернута с проверкой совпадения координат маршрута с quote. Реальная authenticated проверка создания заказа ещё не выполнялась.


## Финальная live-проверка 24.11.2026 — дополнение

Это дополнение приоритетно для фактов, проверенных после предыдущего snapshot. Оно не превращает отсутствие device-тестов в статус «проверено».

| № | Функция / требование | Запрашивалась | Реализована | Проверена фактически | Что осталось |
|---:|---|---|---|---|---|
| 1 | Подписанный Android QA APK | Да | Да, workflow подписывает release variant debug identity | Run #453 успешен; APK скачан, SHA-256 записан, CI apksigner v2 passed | Установка/запуск/login на устройстве; постоянный Play keystore |
| 2 | Supabase client configuration | Да | Да: проект URL + публичный publishable fallback в src/supabase.js | Исходник проверен; public key не service_role | Ограничить картографические ключи; проверить Android runtime |
| 3 | Серверная тарификация и create_order | Да | Да, pricing-service v7 + city_tariff_configs + quote route binding | Deployment и migration history подтверждены | Authenticated device create-order test |
| 4 | Dispatch / offer / atomic accept | Да | Да, SQL triggers/RPC/Realtime/fallback/cron | SQL definitions/migrations/cron проверены | Реальный online driver + order offer + race test |
| 5 | Driver online/GPS heartbeat | Да | Да, GPS-before-online migration | SQL code path и свежая точка существуют | Сейчас 0 online; heartbeat на устройстве не проверен |
| 6 | Push token lifecycle | Да | Да, register/unregister RPC и push Edge Function v5 | Empty token rejected; live token counts 0 | Реальная регистрация и Expo delivery на Android |
| 7 | Пассажир/водитель RLS | Да | Да, RLS включён на 11 ключевых таблицах | SET LOCAL ROLE + раздельные claims: passenger A/B и driver visibility probes | Независимые JWT; sample cross-passenger row в таблице отсутствует |
| 8 | 14 SECURITY DEFINER RPC | Да | Частично: индивидуальные guards, fixed search_path, anon denied | 13/14 получили безопасные негативные/validation probes; dispatch_next_driver пропущен из-за возможных side effects | Device JWT, abuse/rate-limit и полный participant/foreign-order набор |
| 9 | Контакты поездки | Да | Да, SQL RPC ограничены участником, статусом и contact lease | Неназначенный passenger/driver получили 0 rows | Нужен тест назначенного участника и чужого участника на отдельной тестовой поездке |
| 10 | Админ RBAC и защита super-admin | Да | Да: super-admin RPC, advisory lock cap 15 | Passenger не может list/grant; super-admin self-removal блокируется | Ordinary admin test; 15/16 concurrency race; защита от снятия другого super-admin |
| 11 | CSV export для заявок/пользователей/поездок | Да | Нет | Поиск src/LadyGoApp.js: exportCSV/csv отсутствуют | Реализовать отдельной задачей после согласования полей/прав или явно отложить владельцем |
| 12 | Leaked Password Protection | Да | Настройка Supabase Auth выключена | Security Advisor warning подтверждён | Включить владельцу в Auth settings и протестировать регистрацию/reset |
| 13 | Backup/PITR и restore drill | Да | Не подтверждено | Доступные project metadata не показывают backup status | Владелец должен проверить план/PITR и выполнить restore drill |
| 14 | Реальный E2E trip + rating | Да | Кодовый поток есть | Не проверено: сейчас 0 online, 0 push tokens | Два устройства/две независимые сессии, полный цикл и негативные сценарии |
| 15 | Юридическая готовность / Google Play | Да | Checklist есть | Юридически не проверено | Юрист/оператор: GDPR/152-ФЗ, перевозчик, страховка, privacy, Data safety |
| 16 | Реальные платежи | Да | Нет | В проекте нет подключённого эквайера | Лицензированный провайдер, договоры и PCI review |

### Текущий live snapshot

- Supabase ACTIVE_HEALTHY, eu-west-2; pricing-service v7, send-driver-offer-push v5.
- Последняя применённая миграция: `20261124200000_ladygo_phone_input_validation`.
- 2 approved drivers, 0 online, 1 fresh GPS location (<15m), 0 driver tokens, 0 passenger tokens, 1 active order (не тронут).
- 1 super-admin, 0 ordinary admins.
- Run #453: QA debug-signed APK version 6.9.1 (52), package com.ladygo.app, 252,968,198 bytes, SHA-256 `e6994a3b6a1794491245d558c9bf048d4ec3dd0c9156892492ca45b649cac790`. Device installation not tested.
- PR #11 remains draft/open; no merge until device E2E and review.
