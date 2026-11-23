import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const expo = JSON.parse(read('app.json')).expo;
const app = read('src/LadyGoApp.js');
const supabaseClient = read('src/supabase.js');
const dispatchMigration = read('supabase/migrations/20261123230000_ladygo_live_dispatch_v1.sql');
const securityMigration = read('supabase/migrations/20261124090000_ladygo_private_driver_media_and_fare_guard.sql');
const pushFunction = read('supabase/functions/send-driver-offer-push/index.ts');
const dispatchLoop = read('supabase/functions/dispatch-loop/index.ts');
const supabaseConfig = read('supabase/config.toml');
const pushTokenMigration = read('supabase/migrations/20261124100000_ladygo_push_token_lifecycle.sql');
const orderVisibilityMigration = read('supabase/migrations/20261124110000_ladygo_limit_order_visibility_to_offers.sql');
const verifiedDriverMigration = read('supabase/migrations/20261124120000_ladygo_verified_driver_dispatch_and_trip_audit.sql');

const checks = [];
const pass = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

pass('Expo SDK 55', pkg.dependencies?.expo?.startsWith('~55.'));
pass('React Native 0.83', pkg.dependencies?.['react-native']?.startsWith('0.83.'));
pass('Android application id', expo.android?.package === 'com.ladygo.app');
pass('Supabase client persists session securely', /persistSession:\s*true/.test(supabaseClient) && /AsyncStorage/.test(supabaseClient));
pass('No service-role credential in client source', !/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(supabaseClient + app));
pass('Passenger creates a real orders row', /from\('orders'\)\s*\.insert\(payload\)/.test(app));
const createOrderStart = app.indexOf('const createOrder = async');
const createOrderEnd = app.indexOf('const signOut = async', createOrderStart);
const createOrder = app.slice(createOrderStart, createOrderEnd);
pass('Order requires a server price token', /quote\?\.price_token/.test(createOrder) && !/previewFare/.test(createOrder));
pass('Driver acceptance does not submit a client-selected price', /rpc\('ladygo_accept_order',\s*\{\s*p_order_id:\s*order\.id\s*\}\)/.test(app));
pass('Driver GPS heartbeat is connected', /ladygo_driver_heartbeat/.test(app) && /startLocationUpdatesAsync/.test(app));
pass('Driver offers are loaded from Supabase', /from\('order_offers'\)/.test(app));
pass('Driver trip GPS is recorded through the protected RPC', /ladygo_record_trip_location/.test(app) && /recordActiveDriverTripLocation/.test(app));
pass('Dispatch and acceptance require approved driver application', /da\.status = 'approved'/.test(verifiedDriverMigration) && /join public\.driver_profiles/.test(verifiedDriverMigration));
pass('Trip contacts are only returned while active lease and participant match', /ladygo_get_assigned_driver_contact/.test(verifiedDriverMigration) && /ladygo_get_assigned_passenger_contact/.test(verifiedDriverMigration) && /contact_shares cs/.test(verifiedDriverMigration) && /tripContact\?\.phone/.test(app));
pass('Trip audit, track and contact lease tables are present', /create table if not exists public\.order_events/.test(verifiedDriverMigration) && /create table if not exists public\.trip_tracks/.test(verifiedDriverMigration) && /create table if not exists public\.contact_shares/.test(verifiedDriverMigration));
pass('Trip track writes require active participant authorization', /ladygo_record_trip_location/.test(verifiedDriverMigration) && /Trip is not active/.test(verifiedDriverMigration) && /Not a trip participant/.test(verifiedDriverMigration));
pass('Passenger and driver push tokens use server-managed ownership', /ladygo_register_push_token/.test(app) && /ladygo_unregister_push_token/.test(app));
pass('Passenger and driver trip chat uses realtime and participant inserts', /from\('trip_messages'\)/.test(app) && /ladygo-trip-chat-/.test(app) && /sender_id:\s*session\.user\.id/.test(app));
pass('Foreground push notifications are displayed', /setNotificationHandler/.test(app) && /shouldShowBanner:\s*true/.test(app));
pass('Server dispatch migration includes atomic acceptance', /for update/i.test(dispatchMigration) && /ladygo_accept_order/.test(dispatchMigration));
pass('Driver media bucket is private', /set public = false/i.test(securityMigration));
pass('Assigned passenger media access is scoped to active trips', /o\.passenger_id\s*=\s*\(select auth\.uid\(\)\)/.test(securityMigration) && /o\.status in \('accepted','arrived','in_progress'\)/.test(securityMigration));
pass('Driver cannot override stored fare', /Driver cannot change the quoted order price/.test(securityMigration));
pass('Drivers can only read their live offers and assigned trips', /drop policy if exists "driver read orders"/.test(orderVisibilityMigration) && /oo\.status = 'pending'/.test(orderVisibilityMigration) && /orders\.driver_id = \(select auth\.uid\(\)\)/.test(orderVisibilityMigration));
pass('Dispatch loop requires a server-only secret and calls the dispatch RPC', /LADYGO_DISPATCH_SECRET/.test(dispatchLoop) && /x-ladygo-dispatch-secret/.test(dispatchLoop) && /ladygo_dispatch_next_driver/.test(dispatchLoop) && /SUPABASE_SERVICE_ROLE_KEY/.test(dispatchLoop));
pass('Dispatch loop JWT bypass is protected by a dedicated secret', /\[functions\.dispatch-loop\][\s\S]*verify_jwt = false/.test(supabaseConfig));
pass('Push function verifies webhook secret server-side', /ladygo_verify_push_webhook_secret/.test(pushFunction) && /SUPABASE_SERVICE_ROLE_KEY/.test(pushFunction));
pass('Push token cleanup is restricted to the authenticated account', /where user_id = auth\.uid\(\)/.test(pushTokenMigration) && /where driver_id = auth\.uid\(\)/.test(pushTokenMigration));

const failed = checks.filter(check => !check.ok);
for (const check of checks) {
  process.stdout.write((check.ok ? 'PASS ' : 'FAIL ') + check.name + (check.detail ? ': ' + check.detail : '') + '\n');
}
process.stdout.write('\n' + checks.length + ' checks; ' + (checks.length - failed.length) + ' passed; ' + failed.length + ' failed.\n');
if (failed.length) process.exitCode = 1;
