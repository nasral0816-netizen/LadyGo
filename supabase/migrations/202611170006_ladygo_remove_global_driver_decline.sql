-- Remove the old global-decline permission; drivers now skip only their own offer.
begin;
drop policy if exists "ladygo drivers decline available orders" on public.orders;
commit;
