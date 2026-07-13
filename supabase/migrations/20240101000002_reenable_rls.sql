-- Reverts the dev bypass introduced in 20240101000001.
-- WARNING: deletes the test organization and all its data (cascades to transactions, imports, etc.)
-- Run BEFORE enabling auth in the application.

-- 1. Remove test data first (must precede the NOT NULL restore)
DELETE FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001';

-- 2. Restore the NOT NULL constraint on owner_id
ALTER TABLE organizations ALTER COLUMN owner_id SET NOT NULL;

-- 3. Restore trigger to always add the owner as admin (no null guard needed anymore)
CREATE OR REPLACE FUNCTION public.add_owner_as_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin');
  RETURN NEW;
END;
$$;

-- 4. Re-enable RLS on all tables
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_imports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_memory ENABLE ROW LEVEL SECURITY;
