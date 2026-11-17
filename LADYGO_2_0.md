# LadyGo 2.0

This branch starts an additive upgrade path for the existing Expo + Supabase application. Existing app code and user records are not replaced.

## Included in this first backend phase
- Destination GPS coordinates and trip lifecycle timestamps.
- Driver applications with admin-only approval and automatic driver-role promotion after approval.
- Driver location storage with access limited to the driver, an active assigned passenger, and admins.
- Persistent in-app notifications generated when trip status changes.
- Saved places owned by each passenger.
- Atomic order acceptance to prevent two drivers claiming the same order.
- Driver-specific order offers: each driver can accept or skip their own offer without rejecting the passenger's order for everyone.
- A full-screen incoming-order panel with a 25-second response window, address details, fare entry, and a high-priority local sound/vibration alert while the app is running.
- Server-side trip-stage transitions: accepted → arrived → in progress → completed.

## Apply migrations
1. Back up the Supabase database.
2. Review and run the SQL files in `supabase/migrations` in filename order in Supabase SQL Editor. The latest driver-offer migrations must be applied before testing incoming offers.
3. Test with separate passenger, driver, and admin accounts in a staging project before production.

## Not yet included
The incoming-order panel and foreground sound/vibration alert are wired into the mobile UI. Driver Expo push-token registration and a Supabase Edge Function sender are included in the branch. To activate remote push while the app is backgrounded or closed, deploy `supabase/functions/send-driver-offer-push` and create a Supabase Database Webhook for `public.order_offers` INSERT events. Set the webhook URL to `https://<PROJECT_REF>.supabase.co/functions/v1/send-driver-offer-push` and add an `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` header in the Supabase dashboard only; never put that key in the app or repository. An EAS-built Android app is required for production remote push; recent Expo Go versions do not provide remote push support. Turn-by-turn road routing/ETA, payment processing, and operational monitoring are also later phases. A local notification is not a substitute for remote push.

## Activate remote driver push

1. Apply migrations in order through `202611170008`.
2. Deploy the Edge Function `send-driver-offer-push` from the Supabase dashboard or Supabase CLI.
3. In Supabase Database Webhooks, create a webhook for schema `public`, table `order_offers`, event `INSERT`.
4. Use the deployed function URL and set the Authorization header to the service-role bearer value in the Supabase dashboard. Do not share or commit the service-role key.
5. Build/install the Android app with EAS, grant notification permission, and test with a driver account.

The Edge Function sends a high-priority Expo push with a 25-second TTL. The app also uses a foreground realtime offer panel and local alert. Test for duplicate sound/banner behavior on real Android devices before release.

## Security notes
Never ship a Supabase service-role key in the mobile app or a public repository. Driver role is assigned by the server-side admin approval flow. Location sharing should only run with user permission during an active assigned trip.
