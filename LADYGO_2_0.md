# LadyGo 2.0

This branch starts an additive upgrade path for the existing Expo + Supabase application. Existing app code and user records are not replaced.

## Included in this first backend phase
- Destination GPS coordinates and trip lifecycle timestamps.
- Driver applications with admin-only approval and automatic driver-role promotion after approval.
- Driver location storage with access limited to the driver, an active assigned passenger, and admins.
- Persistent in-app notifications generated when trip status changes.
- Saved places owned by each passenger.
- Atomic order acceptance to prevent two drivers claiming the same order.
- Server-side trip-stage transitions: accepted → arrived → in progress → completed.

## Apply migrations
1. Back up the Supabase database.
2. Review and run the SQL files in `supabase/migrations` in filename order in Supabase SQL Editor.
3. Test with separate passenger, driver, and admin accounts in a staging project before production.

## Not yet included
The mobile UI wiring, turn-by-turn road routing/ETA, Expo push-token registration and delivery, payment processing, and operational monitoring are later phases. The database notifications are in-app records; they do not automatically send Android push notifications.

## Security notes
Never ship a Supabase service-role key in the mobile app or a public repository. Driver role is assigned by the server-side admin approval flow. Location sharing should only run with user permission during an active assigned trip.
