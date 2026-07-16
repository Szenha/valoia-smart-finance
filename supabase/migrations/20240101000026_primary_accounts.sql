-- Conta principal: usada como desempate quando o casamento por voz não
-- consegue identificar sozinho qual conta (do mesmo dono, mesmo tipo) usar
-- — por exemplo, um recebimento em Pix sem o nome do banco, quando a pessoa
-- já tem mais de uma conta corrente.
alter table financial_accounts
  add column if not exists is_primary boolean not null default false;

-- No máximo uma conta principal por dono+tipo dentro da organização.
create unique index if not exists idx_financial_accounts_one_primary_per_owner_kind
  on financial_accounts (organization_id, owner_user_id, kind)
  where is_primary;
