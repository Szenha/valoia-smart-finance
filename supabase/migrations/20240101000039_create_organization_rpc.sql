-- The "criar novo workspace" flow (createOrganization in data.ts) was doing a
-- raw client-side INSERT into organizations, subject to RLS policy "org_insert"
-- (owner_id = auth.uid()). Same class of failure already fixed for signup by
-- ensure_user_organization() in 20240101000003 — mirror that fix here so
-- explicit workspace creation also runs as SECURITY DEFINER instead of
-- depending on the client's JWT being propagated in time.

CREATE OR REPLACE FUNCTION public.create_organization(org_name text)
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

  INSERT INTO public.organizations (name, owner_id)
  VALUES (org_name, v_user_id)
  RETURNING id INTO v_org_id;

  RETURN v_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization(text) TO authenticated;
