-- Dispatch is an internal primitive used by trusted trigger/RPC owners only.
-- Clients must not invoke it directly; this avoids user-triggered offer expiry
-- or dispatch side effects outside the verified accept/decline flow.
revoke execute on function public.ladygo_dispatch_next_driver(uuid) from public, anon, authenticated;
grant execute on function public.ladygo_dispatch_next_driver(uuid) to service_role;
