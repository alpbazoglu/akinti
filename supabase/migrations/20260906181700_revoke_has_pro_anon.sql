-- review3 finding 36: `has_pro(uuid)` was grantable to `anon`, handing any
-- unauthenticated caller an enumeration primitive to probe the Pro status
-- of an arbitrary user id. The Pro badge is rendered server-side only —
-- `anon` never needs to call this function directly — so drop that grant
-- and keep `authenticated, service_role`, matching every other
-- SECURITY DEFINER helper in this schema that isn't meant to be called by
-- a signed-out client.
revoke execute on function public.has_pro(uuid) from anon;
