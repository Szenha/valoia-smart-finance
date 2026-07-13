-- Two-part fix for client-side RLS limitations on organization creation.
--
-- 1. Trigger on auth.users: org is created SERVER-SIDE on every signup,
--    running as SECURITY DEFINER (postgres superuser → bypasses RLS entirely).
--    The existing trg_add_owner_as_admin trigger then adds the user as admin.
--
-- 2. ensure_user_organization() RPC: idempotent getter/creator called by
--    client code. Also SECURITY DEFINER, so it can INSERT even if the caller's
--    JWT isn't propagated in time. auth.uid() still resolves from JWT claims,
--    so the user identity is verified server-side.

-- ── 1. Auth trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organizations (name, owner_id)
  VALUES ('Minha Organização', NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. Idempotent RPC fallback ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id  uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Happy path: org already exists (created by the auth trigger above)
  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = v_user_id
  ORDER BY om.created_at ASC
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  -- Fallback: org somehow missing (e.g. trigger failed or legacy user).
  -- INSERT runs as postgres (SECURITY DEFINER) → RLS does not apply here.
  INSERT INTO public.organizations (name, owner_id)
  VALUES ('Minha Organização', v_user_id)
  RETURNING id INTO v_org_id;

  RETURN v_org_id;
END;
$$;
