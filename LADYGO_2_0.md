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
The incoming-order panel and foreground sound/vibration alert are now wired into the mobile UI. Remote push delivery while the app is backgrounded or closed is still a separate phase: it needs Expo push-token registration, a server-side sender, and an EAS-built Android app. Turn-by-turn road routing/ETA, payment processing, and operational monitoring are also later phases. A local notification is not a substitute for remote push.

## Security notes
Never ship a Supabase service-role key in the mobile app or a public repository. Driver role is assigned by the server-side admin approval flow. Location sharing should only run with user permission during an active assigned trip.
