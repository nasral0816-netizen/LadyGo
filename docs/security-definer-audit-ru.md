# LadyGo — аудит SECURITY DEFINER RPC (24.11.2026)

## Методика

Проверены 14 функций, перечисленных Supabase Security Advisor. Для каждой проверены search_path, доступность EXECUTE для authenticated и anon, наличие проверки auth.uid() и логика ограничения по владельцу/роли/участию. Все 14 имеют закреплённый search_path; anon не имеет EXECUTE; authenticated имеет EXECUTE, поскольку эти RPC используются приложением. Это объясняет общий lint-warning, но само по себе не доказывает уязвимость.

## Реестр

| Функция | Риск | Что проверено / сделано | Остаток |
|---|---|---|---|
| ladygo_accept_order(uuid,numeric) | Высокий при ошибке проверки гонки | Требует одобренного driver + profile, блокирует заказ FOR UPDATE, проверяет собственный активный offer и TTL, серверную цену; конкурирующие offers отменяются. | Реальная параллельная гонка двух водителей не проиграна на staging. |
| ladygo_cancel_active_order(uuid,text) | Средний | Требует сессию; блокирует заказ; разрешает только владельцу-пассажиру либо назначенному водителю и допустимые статусы. | Проверить отмены на двух реальных аккаунтах и события/уведомления. |\n| ladygo_cancel_my_order(uuid,text) | Средний | Новая RPC: auth.uid обязателен; UPDATE только по passenger_id=auth.uid(), status=new, driver_id IS NULL; trigger guard допускает owner cancellation даже при profile role=driver. | Реальная отмена владельцем прошла; foreign user negative probe отклонён. Повторная проверка кнопки после APK остаётся открытой. |
| ladygo_decline_order(uuid) | Средний | Проверяет одобренного водителя и обновляет только его pending offer, затем вызывает серверную диспетчеризацию. | Проверить истечение/повторные нажатия и гонку decline vs accept. |
| ladygo_dispatch_next_driver(uuid) | Высокий, внутренняя функция с dispatch side effects | search_path=public,pg_temp; подбирает только свежего online проверенного водителя без активной поездки/другого pending offer. | Миграция `20261124073317` отозвала EXECUTE у authenticated/anon; service_role оставлен. ACL: authenticated=false, anon=false, service_role=true. Прямой вызов из authenticated отклонён. | Проверить внутренние trigger/service_role пути на реальном заказе; не возвращать клиентский прямой fallback. |
| ladygo_driver_heartbeat(boolean,double precision,double precision,double precision) | Средний | Проверяет auth.uid, роль driver, approved application и driver profile; валидирует GPS; пишет GPS до online presence. | Проверить spoofing/rate limit, background permissions и stale heartbeat на устройстве. |
| ladygo_get_assigned_driver_contact(uuid) | Высокий из-за персональных данных | Возвращает ограниченный набор данных только passenger конкретного заказа, active status и действующий contact lease. | Негативный тест чужого пассажира и завершённой поездки. |
| ladygo_get_assigned_passenger_contact(uuid) | Высокий из-за персональных данных | Возвращает имя/телефон только назначенному driver при active status и действующем contact lease; нет полного auth.users объекта в результате. | Негативный тест чужого водителя и истёкшего lease. |
| ladygo_list_admins() | Высокий из-за раскрытия email/ролей | Требует profile role=admin и is_super_admin=true; возвращает только список администраторов. | Проверить вызов обычным admin/passenger и аудит доступа. |
| ladygo_record_trip_location(uuid,...) | Высокий из-за точной геолокации | Проверяет сессию, координаты/скорость, активный заказ и принадлежность passenger/driver; ограничивает слишком частые точки и невозможную скорость. | Негативные тесты чужого order_id и тест retention GPS. |
| ladygo_register_push_token(text,text) | Средний | Привязывает токен к auth.uid, валидирует длину и платформу, определяет роль из profiles, обновляет собственные token rows. | Формат Expo token и реальная регистрация/доставка не проверены: сейчас 0 токенов. |
| ladygo_set_admin_by_email(text,boolean) | Критический при обходе RBAC/лимита | Проверяет super-admin, запрещает self-change и снятие другого super-admin, сохраняет прежнюю роль; добавлена advisory transaction lock для лимита 15. | Нужны реальные негативные RBAC тесты; сейчас в БД 0 обычных admins и 1 super-admin. |
| ladygo_unregister_push_token(text) | Низкий/средний | Требует auth.uid и удаляет токен только текущего пользователя из обеих token tables. | Проверить logout/revoke на устройстве. |
| ladygo_update_my_phone(text) | Средний из-за PII | Требует сессию, нормализует/валидирует номер, обновляет только profile текущего пользователя. | Проверить форматные edge cases и минимизацию возвращаемой строки профиля. |
| ladygo_update_trip_status(uuid,text) | Высокий из-за переходов статусов | Требует одобренного driver + profile; update ограничен назначенным driver и допустимыми переходами. | Проверить race conditions, отмену и completion на staging. |

## Общие результаты

- Все 14 функций имеют закреплённый search_path (в основном public, pg_temp; функция контакта пассажира использует public, auth, pg_temp).
- Все 14 доступны роли authenticated, потому что часть из них вызывается приложением. Ни одна из этих 14 не имеет EXECUTE для anon.
- Проверки auth.uid() присутствуют во всех 14; конкретная глубина проверки различается и указана в таблице.
- SECURITY DEFINER lint предупреждение остаётся, поскольку Supabase Advisor рекомендует избегать callable-by-authenticated функций с elevated privileges. Слепой REVOKE сломает приложение; требуется дальнейшее сужение грантов/вынос внутренних функций после проверки call graph.
- Ключевые таблицы заказов, офферов, профилей, presence, locations, tracks, ratings, applications, push tokens и support имеют RLS enabled.
- SQL просмотр политик показал ограничение заказов по пассажиру/назначенному водителю/активному офферу; профиля — по собственному id; поддержки — по владельцу/админу; треков — по участникам/админу.
- Выполнены SQL negative visibility checks в отдельных транзакциях с SET LOCAL ROLE authenticated и раздельным request.jwt.claim.sub контекстом пассажира и одобренного водителя. В пассажирском контексте виден только собственный профиль (1), чужие заказы/офферы/токены/поддержка/треки — 0. В водительском контексте виден только собственный профиль (1), foreign_orders/offers/locations/push_tokens/support/trip_tracks — 0. У водителя могут быть видимы его собственные исторические passenger orders; это ожидаемо. Это проверка RLS на SQL-уровне с подстановкой claims, а не полноценная проверка подписанными JWT на двух устройствах.
- Advisor дополнительно сообщил Leaked Password Protection Disabled. Это настройка Auth, не одна из 14 RPC; включить после оценки влияния на регистрацию и UX.

## Принятые решения

Не отключать RLS, не отзывать массово EXECUTE, не раскрывать service-role. Точечная миграция admin cap уже применена. Следующие безопасные шаги — staging JWT negative tests, гонки accept/admin cap, review call graph для ladygo_dispatch_next_driver и Auth leaked-password setting.


## Повторная SQL-сверка grants/search_path (24.11.2026, live)

Повторный запрос к pg_proc подтвердил для всех 14 функций: prosecdef=true; задан function-level search_path (13 функций: public, pg_temp; get_assigned_passenger_contact: public, auth, pg_temp); EXECUTE для authenticated=true; EXECUTE для anon=false; в тексте каждой функции присутствует auth.uid(). Это подтверждает базовые настройки, но не заменяет ручной review ветвей авторизации, runtime negative tests, проверку SECURITY DEFINER owner и ограничение search_path на trusted schemas. Security Advisor продолжает показывать 14 предупреждений, поскольку signed-in users могут вызывать SECURITY DEFINER RPC. Не отзывать гранты массово: приложение использует эти RPC.


## Runtime negative probes — 24.11.2026

Тесты выполнялись в транзакциях с ROLLBACK под `SET LOCAL ROLE authenticated` и тестовыми `request.jwt.claim.sub`; это не независимые подписанные JWT и не device test.

| RPC | Негативный сценарий | Результат |
|---|---|---|
| ladygo_accept_order | Passenger вызывает accept | Отклонено: Only verified drivers can accept orders |
| ladygo_cancel_active_order | Passenger A отменяет чужой активный заказ | Отклонено: Нет прав на отмену этого заказа |
| ladygo_decline_order | Passenger вызывает decline | Отклонено: Only verified drivers can decline offers |
| ladygo_dispatch_next_driver | Прямой вызов | Не запускался: функция может обновлять истёкшие offers и запускать dispatch; нужен отдельный staging order/изоляция |
| ladygo_driver_heartbeat | Passenger вызывает heartbeat | Отклонено: Only verified drivers can change availability |
| ladygo_get_assigned_driver_contact | Чужой passenger запрашивает контакт по не назначенному заказу | 0 rows |
| ladygo_get_assigned_passenger_contact | Не назначенный driver запрашивает контакт | 0 rows |
| ladygo_list_admins | Passenger вызывает список администраторов | Отклонено: Недостаточно прав |
| ladygo_record_trip_location | Чужой passenger пишет координаты по неактивному заказу | Отклонено: Trip is not active |
| ladygo_register_push_token | Пустой Expo token | Отклонено: Invalid Expo push token |
| ladygo_set_admin_by_email | Passenger пытается назначить администратора | Отклонено: Недостаточно прав |
| ladygo_unregister_push_token | Неизвестный тестовый token | RPC завершился без ошибки; совпадающей записи нет, удалять было нечего |
| ladygo_update_my_phone | Некорректные значения x / abc1234567 / ++++ / 12-34 | После миграции все отклонены: Invalid phone number |
| ladygo_update_trip_status | Не назначенный driver пытается изменить статус чужого заказа | Отклонено: Trip status cannot be changed |

Дополнительно: super-admin вызвал попытку снять собственные права; RPC вернул `Нельзя изменять собственные права главного администратора`. Passenger A/B видели только собственный профиль и 0 строк в 10 остальных ключевых таблицах. В driver role context видны 2 доступных заказа и собственная заявка; чужие offers, locations, tracks, tokens и support — 0.

### Исправление phone RPC

Обнаружено, что исходная нормализация удаляла буквы и могла превращать произвольную строку в NULL, очищая телефон. Добавлена и применена миграция `20261124200000_ladygo_phone_input_validation`: разрешены цифры, плюс, скобки, пробелы и дефисы; после нормализации номер должен содержать 7–15 цифр и необязательный начальный плюс. Пустое значение по-прежнему означает явную очистку поля. Негативные пробы после применения прошли.

Остаются непроверенными: прямой dispatch RPC, успешная регистрация/отзыв существующего push token, обновление собственного телефона валидным номером, назначенный-contact flow на реальной поездке, 15/16 concurrent admin grants, обычный admin и два независимых device JWT. Leaked Password Protection отключён по Advisor. Не отзывать grants массово.


## Runtime probes update after live recheck (24.11.2026)

Security Advisor returned exactly 14 exposed SECURITY DEFINER RPC findings. A fresh catalog query confirmed 14/14 have function-level search_path, authenticated EXECUTE, and no anon EXECUTE. These are the 14 exposed RPCs; trigger-only SECURITY DEFINER functions are outside this Advisor finding set.

| Function | Guard / risk | Runtime probe under simulated authenticated claim | Result |
|---|---|---|---|
| ladygo_accept_order | Only verified driver with pending offer; row lock / atomic accept | Passenger invoked with invalid order UUID | Rejected: verified-driver requirement |
| ladygo_cancel_active_order | Only order passenger or assigned driver | Passenger A attempted another account's new order | Rejected: not a participant |
| ladygo_decline_order | Only verified driver with own pending offer | Passenger invoked with invalid order UUID | Rejected: verified-driver requirement |
| ladygo_dispatch_next_driver | Direct RPC guard: owner or driver with an offer | Unrelated passenger invoked against another passenger's new order; stale pending offer count was 0 before probe | Rejected: not allowed to dispatch this order |
| ladygo_driver_heartbeat | Only approved driver; valid GPS required to go online | Passenger called heartbeat(false) | Rejected: verified-driver requirement |
| ladygo_get_assigned_driver_contact | Only passenger on active assigned trip with unexpired contact lease | Unrelated passenger queried new order | 0 rows; active-trip device negative test still missing |
| ladygo_get_assigned_passenger_contact | Only assigned driver on active trip with unexpired contact lease | Unrelated passenger queried new order | 0 rows; active-trip device negative test still missing |
| ladygo_list_admins | Super-admin only | Passenger and transactionally simulated ordinary admin | Rejected: insufficient privileges |
| ladygo_record_trip_location | Only trip participant; active trip and sane GPS required | Called with new (not active) order | Rejected before participant branch because trip is not active; wrong-actor test during active trip remains missing |
| ladygo_register_push_token | Derives user from auth.uid; validates Expo token/platform | Passenger supplied too-short invalid token | Rejected: invalid token; real token registration/device test missing |
| ladygo_set_admin_by_email | Super-admin only; advisory lock on grant; self/super-admin protection | Passenger and ordinary admin denied; self-removal and removal of a second synthetic super-admin attempted in rollback-only transactions | All denied as intended; 15/16 concurrent stress test not run |
| ladygo_unregister_push_token | Deletes only token belonging to auth.uid | Passenger passed a non-existent token | Safe no-op; cross-account real-token negative test not possible (0 tokens) |
| ladygo_update_my_phone | Updates only auth.uid profile; phone format validation | Passenger supplied malformed phone | Rejected before update; other-account phone access not tested |
| ladygo_update_trip_status | Only approved assigned driver; strict status graph | Passenger attempted status change | Rejected: verified-driver requirement |

All probes used SET LOCAL ROLE authenticated plus simulated request.jwt.claim.sub inside SQL transactions. They are database authorization probes, not independent signed JWT sessions from two devices. For record_trip_location, active-trip authorization could not be tested because no accepted/arrived/in_progress trip exists. For contact RPCs, the tested order was new, so the active contact-lease device scenario remains open. Push token lifecycle and concurrent admin cap remain open.

The Advisor warning is not itself proof of a vulnerability: these RPCs are intentionally callable by authenticated clients and contain authorization checks. Do not revoke EXECUTE indiscriminately. ladygo_dispatch_next_driver remains especially sensitive; its non-owner negative invocation was rejected, but a separate code review of all trigger/service-role paths is still required.


### Обновление после исправления отмены и ограничения dispatch (24.11.2026)

- Advisor продолжает показывать 14 callable SECURITY DEFINER findings: теперь прямой dispatch RPC удалён из exposed set, но новая `ladygo_cancel_my_order` добавлена как authenticated RPC. Остальные клиентские RPC остаются callable-by-authenticated намеренно и защищены role/ownership checks.
- `ladygo_dispatch_next_driver(uuid)`: authenticated/anon EXECUTE=false, service_role=true. Прямой вызов под authenticated JWT simulation отклонён permission check до выполнения функции.
- `ladygo_cancel_my_order(uuid,text)`: authenticated owner cancellation успешно выполнил реальный update собственного заказа; другая учётная запись получила отказ/no matching owned active order. SQL probe использовал simulated JWT claim; independent signed JWT device test остаётся открытым.
- Advisor: Leaked Password Protection Disabled; проект на Free plan, требуется upgrade Pro+ и включение Auth setting владельцем.


## Актуальный live catalog audit — 24.11.2026 11:43 UTC (перекрывает историческое число 14)

Последний запрос к live PostgreSQL 17.11 обнаружил **36** функций SECURITY DEFINER в схеме public. Число 14 в предыдущих разделах — исторический набор exposed RPC из раннего снимка, а не полный текущий каталог.

### Все 36 функций

| Функция | EXECUTE authenticated | EXECUTE anon | Комментарий |
|---|---:|---:|---|
| approve_driver_application() | Нет | Нет | Trigger/service_role path |
| guard_order_update() | Нет | Нет | Trigger/service_role path |
| handle_new_user() | Нет | Нет | Auth trigger |
| ladygo_accept_order(uuid,numeric) | Да | Нет | Проверка verified driver, row lock, собственный pending offer, единичное назначение |
| ladygo_cancel_active_order(uuid,text) | Да | Нет | Проверка участника и статуса |
| ladygo_cancel_my_order(uuid,text) | Да | Нет | Только собственный новый неназначенный заказ |
| ladygo_close_order_offers() | Нет | Нет | Trigger/service_role path |
| ladygo_create_order_from_quote(...) | Да | Нет | Authenticated quote-bound order creation |
| ladygo_create_order_offers() | Нет | Нет | Orders INSERT trigger |
| ladygo_decline_order(uuid) | Да | Нет | Только собственный pending offer |
| ladygo_dispatch_after_offer_response() | Нет | Нет | Offer status trigger |
| ladygo_dispatch_next_driver(uuid) | Нет | Нет | service_role-only; прямой клиентский вызов запрещён |
| ladygo_dispatch_notification_push() | Нет | Нет | Notification trigger, Vault/net path |
| ladygo_dispatch_offer_push() | Нет | Нет | Offer trigger, Vault/net path |
| ladygo_dispatch_scheduled_orders() | Нет | Нет | Cron/service_role path |
| ladygo_dispatch_waiting_after_trip_release() | Нет | Нет | Order status trigger |
| ladygo_driver_heartbeat(boolean,double precision,double precision,double precision) | Да | Нет | Driver presence/GPS heartbeat |
| ladygo_expire_my_offer(uuid) | Да | Нет | Собственный offer expiry |
| ladygo_expire_stale_order_offers() | Нет | Нет | Cron/service_role path |
| ladygo_get_assigned_driver_contact(uuid) | Да | Нет | Только passenger-заказчик с active contact lease |
| ladygo_get_assigned_passenger_contact(uuid) | Да | Нет | Только назначенный driver с active contact lease |
| ladygo_handle_driver_presence_change() | Нет | Нет | Presence trigger |
| ladygo_list_admins() | Да | Нет | Только super-admin |
| ladygo_log_order_event() | Нет | Нет | Orders audit trigger |
| ladygo_notify_new_order() | Нет | Нет | Trigger/service_role path |
| ladygo_notify_order_change() | Нет | Нет | Order notification trigger |
| ladygo_notify_support_reply() | Нет | Нет | Support reply trigger |
| ladygo_offer_waiting_orders_to_new_driver() | Нет | Нет | Driver approval/presence trigger path |
| ladygo_record_trip_location(uuid,...) | Да | Нет | Только участник активной поездки |
| ladygo_register_push_token(text,text) | Да | Нет | Только собственный токен |
| ladygo_review_driver_application() | Нет | Нет | Application review trigger |
| ladygo_set_admin_by_email(text,boolean) | Да | Нет | Только super-admin; advisory lock на лимит 15; self-change запрещён |
| ladygo_unregister_push_token(text) | Да | Нет | Только собственный токен |
| ladygo_update_my_phone(text) | Да | Нет | Только собственный профиль |
| ladygo_update_trip_status(uuid,text) | Да | Нет | Только назначенный verified driver и допустимые переходы |
| ladygo_verify_push_webhook_secret(text) | Нет | Нет | Internal Vault verification |
| refresh_driver_rating_stats() | Нет | Нет | Rating trigger |
| validate_ladygo_price_quote() | Нет | Нет | Quote validation trigger |

### Итоги catalog/grant audit
- 36 SECURITY DEFINER функций всего.
- 16 функций имеют EXECUTE для authenticated; 0 функций имеют EXECUTE для anon.
- 20 внутренних trigger/cron/service functions не доступны authenticated/anon.
- `ladygo_dispatch_next_driver(uuid)`: authenticated=false, anon=false, service_role=true.
- У всех 36 функций задан function-level search_path. 33 используют явный schema path; три функции `approve_driver_application`, `handle_new_user`, `refresh_driver_rating_stats` задают пустой search_path. Их тела используют schema-qualified таблицы/функции; пустой путь не является отсутствующим параметром и исключает пользовательские схемы из разрешения имён.
- Supabase Security Advisor на 11:37 UTC сообщает 16 warnings: это ровно exposed authenticated SECURITY DEFINER RPC, а не 36 функций и не доказательство эксплуатации. Нельзя массово отзывать EXECUTE, пока не проверен call graph.

### Ограничения доказательств
Этот аудит проверяет каталог, grants и определения функций. Он **не** доказывает runtime-поведение всех 16 exposed RPC под двумя независимыми подписанными JWT. В этой сессии не запускались 16 новых runtime probes, конкурентная гонка accept, 15→16 admin race или full trip E2E. Ранее задокументированные SQL claim simulations остаются SQL simulations, а не device JWT tests.
