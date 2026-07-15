-- Identidade visual por membro (nome/cor por organização, não no perfil
-- global — um admin não tem permissão de escrever na profiles de outra
-- pessoa) e restrição de posse: cada membro só edita/exclui os próprios
-- lançamentos, nem admin mexe no lançamento alheio.

alter table organization_members
  add column if not exists display_name text,
  add column if not exists color text;

drop policy "transactions_update" on transactions;
create policy "transactions_update" on transactions for update
  using (
    public.is_org_contributor(organization_id)
    and (created_by = auth.uid() or (created_by is null and public.is_org_admin(organization_id)))
  )
  with check (
    public.is_org_contributor(organization_id)
    and public.account_belongs_to_org(account_id, organization_id)
    and (created_by = auth.uid() or (created_by is null and public.is_org_admin(organization_id)))
  );

drop policy "transactions_delete" on transactions;
create policy "transactions_delete" on transactions for delete
  using (
    public.is_org_contributor(organization_id)
    and (created_by = auth.uid() or (created_by is null and public.is_org_admin(organization_id)))
  );
