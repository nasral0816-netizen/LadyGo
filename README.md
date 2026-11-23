# LadyGo

LadyGo — Android-приложение сервиса поездок с фирменным стилем #E84F87 и слоганом «Поездки с заботой».

## Технологии

- React Native / Expo SDK 55
- Supabase Auth, PostgreSQL, Storage, Realtime, Edge Functions
- GitHub Actions / Gradle Android APK
- MapLibre / OpenStreetMap и внешние картографические провайдеры

## Структура

- src/LadyGoApp.js — основное приложение и роли пользователя.
- supabase/migrations/ — SQL миграции (перед применением сверять с live schema).
- supabase/functions/ — Edge Functions.
- docs/acceptance-matrix-ru.md — матрица требований и приёмки.
- docs/legal-and-compliance.md — юридический и privacy чек-лист.
- docs/integrations-and-operations-ru.md — внешние сервисы и эксплуатация.
- TECHNICAL_AUDIT_RU.md — технический аудит.
- DISPATCH_SETUP_RU.md — архитектура и deployment checklist реальной диспетчеризации.
- docs/requirements-registry-ru.md — единый реестр всех требований из доступной истории.

## Установка

Требуются Node.js 22, npm, Java 17 и Android SDK (для локальной сборки).

```bash
npm install
cp .env.example .env
npx expo-doctor
npx expo start
```

Заполните только публичные клиентские переменные, которые использует приложение. Никогда не помещайте Supabase service_role key, signing secrets, webhook secrets или приватные API keys в EXPO_PUBLIC_* и клиентский bundle.

## Android APK

Release APK собирается GitHub Actions workflow .github/workflows/android-apk.yml. Для сборки из ветки откройте Actions и запустите workflow вручную или дождитесь PR workflow. Загруженный artifact — временный CI artifact; проверяйте commit SHA, дату, размер и checksum перед распространением. APK не является подтверждением E2E/production готовности.

## Текущий статус

- PR #10 содержит изменения безопасности и технической валидации; он не объединён в main.
- Успешные статические проверки и Expo export не подтверждают состояние удалённого Supabase.
- Миграции не применялись к live базе в рамках этого сеанса; текущая проверка не подтверждает production-доступность.
- Реальная диспетчеризация и поездки являются обязательной частью продукта; код ветки включает триггер создания заказа, подбор водителя, TTL-офферы, atomic accept, статусы, GPS, контакты, Edge Function и scheduler. Миграции/Edge Functions требуют staging/live deployment и E2E. Реальные платежи не подключены и не должны считаться работающими.
- Перед релизом обязательны проверки RLS/Storage, dispatch scheduler, push, auth recovery, admin RBAC, backup restore, двух Android устройств и legal/privacy.

## Важные документы

- docs/acceptance-matrix-ru.md
- docs/legal-and-compliance.md
- docs/integrations-and-operations-ru.md
- TECHNICAL_AUDIT_RU.md
- DISPATCH_SETUP_RU.md
