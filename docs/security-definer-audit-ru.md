# LadyGo — аудит SECURITY DEFINER RPC (24.11.2026)

## Методика

Проверены 14 функций, перечисленных Supabase Security Advisor. Для каждой проверены search_path, доступность EXECUTE для authenticated и anon, наличие проверки auth.uid() и логика ограничения по владельцу/роли/участию. Все 14 имеют закреплённый search_path; anon не имеет EXECUTE; authenticated имеет EXECUTE, поскольку эти RPC используются приложением. Это объясняет общий lint-warning, но само по себе не доказывает уязвимость.

## Реестр

| Функция | Риск | Что проверено / сделано | Остаток |
|---|---|---|---|
| ladygo_accept_order(uuid,numeric) | Высокий при ошибке проверки гонки | Требует одобренного driver + profile, блокирует заказ FOR UPDATE, проверяет собственный активный offer и TTL, серверную цену; конкурирующие offers отменяются. | Реальная параллельная гонка двух водителей не проиграна на staging. |
| ladygo_cancel_active_order(uuid,text) | Средний | Требует сессию; блокирует заказ; разрешает только владельцу-пассажиру либо назначенному водителю и допустимые статусы. | Проверить отмены на двух реальных аккаунтах и события/уведомления. |
| ladygo_decline_order(uuid) | Средний | Проверяет одобренного водителя и обновляет только его pending offer, затем вызывает серверную диспетчеризацию. | Проверить истечение/повторные нажатия и гонку decline vs accept. |
| ladygo_dispatch_next_driver(uuid) | Высокий, внутренняя функция доступна клиенту | search_path=public,pg_temp; блокирует заказ; проверяет владельца пассажира либо существующий offer для driver; подбирает только свежего online проверенного водителя без активной поездки/другого pending offer. Прямой вызов используется клиентским fallback poll. | Сузить авторизацию прямого вызова при сохранении клиентского fallback; провести abuse/rate-limit test. |
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
