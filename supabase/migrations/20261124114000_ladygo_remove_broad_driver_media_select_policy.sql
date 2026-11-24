-- Remove a legacy permissive SELECT policy that grants an active passenger
-- access to every object in the assigned driver's folder. The stricter
-- "ladygo driver media read owner admin assigned passenger" policy remains
-- and permits only the driver's avatar_url / vehicle_photo_url during an
-- active assigned trip, plus owner/admin access.
--
-- This migration is committed for review only. Do not apply to production
-- until the owner confirms a current backup and restore path.

drop policy if exists "ladygo driver media read own or active passenger"
  on storage.objects;
