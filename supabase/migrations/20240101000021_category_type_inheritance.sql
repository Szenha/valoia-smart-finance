-- Subcategories must always share their parent category's type. Enforce this
-- server-side (defense in depth on top of the frontend), since nothing today
-- stops a direct insert/update from setting a mismatched type.
create or replace function public.enforce_category_type_inheritance()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    select type into new.type from public.categories where id = new.parent_id;
  end if;
  return new;
end;
$$;

drop trigger if exists category_type_inheritance on public.categories;

create trigger category_type_inheritance
  before insert or update on public.categories
  for each row
  execute function public.enforce_category_type_inheritance();
