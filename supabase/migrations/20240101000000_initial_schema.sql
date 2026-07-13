-- ============================================================
-- Initial financial schema
-- Multi-tenant isolation via organization_id + RLS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE member_role    AS ENUM ('admin', 'colaborador', 'visualizador');
CREATE TYPE category_type  AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE account_kind   AS ENUM ('checking', 'credit_card', 'investment');
CREATE TYPE import_status  AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============================================================
-- organizations
-- ============================================================

CREATE TABLE organizations (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text        NOT NULL,
  owner_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- organization_members
-- ============================================================

CREATE TABLE organization_members (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            member_role NOT NULL DEFAULT 'visualizador',
  invited_by      uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper functions (SECURITY DEFINER so RLS can't recurse)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_contributor(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'colaborador')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Trigger: owner is automatically added as admin on org creation
CREATE OR REPLACE FUNCTION public.add_owner_as_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_add_owner_as_admin
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_admin();

-- ============================================================
-- categories
-- ============================================================

CREATE TABLE categories (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text          NOT NULL,
  type            category_type NOT NULL,
  color           text,
  icon            text,
  parent_id       uuid          REFERENCES categories(id) ON DELETE SET NULL,
  created_by      uuid          REFERENCES auth.users(id),
  created_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- statement_imports
-- ============================================================

CREATE TABLE statement_imports (
  id                uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename          text          NOT NULL,
  account_id        text          NOT NULL,
  account_kind      account_kind  NOT NULL,
  bank_id           text,
  currency          text          NOT NULL DEFAULT 'BRL',
  period_start      timestamptz,
  period_end        timestamptz,
  transaction_count integer       NOT NULL DEFAULT 0,
  status            import_status NOT NULL DEFAULT 'pending',
  error_message     text,
  imported_by       uuid          REFERENCES auth.users(id),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE statement_imports ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- transactions
-- ============================================================

CREATE TABLE transactions (
  id                  uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  statement_import_id uuid         REFERENCES statement_imports(id) ON DELETE SET NULL,
  category_id         uuid         REFERENCES categories(id) ON DELETE SET NULL,
  amount              numeric(15,2) NOT NULL,
  description         text         NOT NULL DEFAULT '',
  memo                text,
  posted_at           timestamptz  NOT NULL,
  fit_id              text         NOT NULL,
  type                text         NOT NULL,
  account_id          text         NOT NULL,
  account_kind        account_kind NOT NULL,
  bank_id             text,
  currency            text         NOT NULL DEFAULT 'BRL',
  check_number        text,
  created_by          uuid         REFERENCES auth.users(id),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_id, fit_id)
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transactions_org_posted   ON transactions(organization_id, posted_at DESC);
CREATE INDEX idx_transactions_import       ON transactions(statement_import_id);
CREATE INDEX idx_transactions_category     ON transactions(category_id);

-- ============================================================
-- classification_memory
-- ============================================================

CREATE TABLE classification_memory (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern         text          NOT NULL,
  category_id     uuid          NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  confidence      numeric(4,3)  NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  match_count     integer       NOT NULL DEFAULT 1,
  last_matched_at timestamptz   NOT NULL DEFAULT now(),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pattern)
);

ALTER TABLE classification_memory ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- organizations
CREATE POLICY "org_select"  ON organizations FOR SELECT USING (public.is_org_member(id));
CREATE POLICY "org_insert"  ON organizations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "org_update"  ON organizations FOR UPDATE USING (public.is_org_admin(id));
CREATE POLICY "org_delete"  ON organizations FOR DELETE USING (public.is_org_admin(id));

-- organization_members
-- members can see the roster of any org they belong to; also their own rows
CREATE POLICY "members_select" ON organization_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_org_member(organization_id));
CREATE POLICY "members_insert" ON organization_members
  FOR INSERT WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "members_update" ON organization_members
  FOR UPDATE USING (public.is_org_admin(organization_id));
CREATE POLICY "members_delete" ON organization_members
  FOR DELETE USING (public.is_org_admin(organization_id));

-- categories
CREATE POLICY "categories_select" ON categories FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (public.is_org_contributor(organization_id));
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (public.is_org_contributor(organization_id));
CREATE POLICY "categories_delete" ON categories FOR DELETE USING (public.is_org_admin(organization_id));

-- statement_imports
CREATE POLICY "imports_select" ON statement_imports FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "imports_insert" ON statement_imports FOR INSERT WITH CHECK (public.is_org_contributor(organization_id));
CREATE POLICY "imports_update" ON statement_imports FOR UPDATE USING (public.is_org_contributor(organization_id));
CREATE POLICY "imports_delete" ON statement_imports FOR DELETE USING (public.is_org_admin(organization_id));

-- transactions
CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (public.is_org_contributor(organization_id));
CREATE POLICY "transactions_update" ON transactions FOR UPDATE USING (public.is_org_contributor(organization_id));
CREATE POLICY "transactions_delete" ON transactions FOR DELETE USING (public.is_org_admin(organization_id));

-- classification_memory
CREATE POLICY "memory_select" ON classification_memory FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "memory_insert" ON classification_memory FOR INSERT WITH CHECK (public.is_org_contributor(organization_id));
CREATE POLICY "memory_update" ON classification_memory FOR UPDATE USING (public.is_org_contributor(organization_id));
CREATE POLICY "memory_delete" ON classification_memory FOR DELETE USING (public.is_org_admin(organization_id));
