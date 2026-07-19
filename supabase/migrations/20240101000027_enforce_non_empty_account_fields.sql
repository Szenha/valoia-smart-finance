-- Um lançamento por voz chegou a ser salvo com account_id = '' (bug já corrigido
-- em useQuickAddForm.ts, commit 2fc8d7c), e uma financial_accounts com
-- account_key = '' e name = '' junto. As colunas eram NOT NULL mas não
-- proibiam string vazia, então o dado inconsistente passou. Estas constraints
-- fecham essa lacuna no banco, independente de qualquer validação (ou falha
-- de validação) na aplicação.

alter table transactions
  add constraint transactions_account_id_not_empty check (btrim(account_id) <> '');

alter table financial_accounts
  add constraint financial_accounts_account_key_not_empty check (btrim(account_key) <> ''),
  add constraint financial_accounts_name_not_empty check (btrim(name) <> '');

alter table statement_imports
  add constraint statement_imports_account_id_not_empty check (btrim(account_id) <> '');

alter table statement_items
  add constraint statement_items_account_id_not_empty check (btrim(account_id) <> '');

alter table installment_plans
  add constraint installment_plans_account_id_not_empty check (btrim(account_id) <> '');

alter table period_closures
  add constraint period_closures_account_id_not_empty check (btrim(account_id) <> '');

-- account_id em financial_goals é opcional (meta pode não estar vinculada a
-- conta nenhuma), então só proíbe string vazia quando presente.
alter table financial_goals
  add constraint financial_goals_account_id_not_empty
  check (account_id is null or btrim(account_id) <> '');
