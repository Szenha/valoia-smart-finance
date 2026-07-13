-- DEV ONLY — run this migration in dev/test environments only.
-- Disables RLS and seeds a fixed test organization so the app works without authentication.
-- When authentication is added, drop this migration and re-enable RLS.

-- Allow owner_id to be null so the app can seed an org without an auth user
ALTER TABLE organizations ALTER COLUMN owner_id DROP NOT NULL;

-- Skip the auto-add-admin trigger when owner_id is null
CREATE OR REPLACE FUNCTION public.add_owner_as_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

-- Disable RLS on all tables
ALTER TABLE organizations         DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories            DISABLE ROW LEVEL SECURITY;
ALTER TABLE statement_imports     DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          DISABLE ROW LEVEL SECURITY;
ALTER TABLE classification_memory DISABLE ROW LEVEL SECURITY;

-- Seed the fixed test organization
INSERT INTO organizations (id, name, owner_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Organização de Teste', NULL)
ON CONFLICT (id) DO NOTHING;
