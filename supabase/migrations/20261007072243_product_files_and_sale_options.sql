begin;

alter table public.products
  add column if not exists compare_at_amount integer,
  add column if not exists save_for_later_enabled boolean not null default true;
alter table public.products drop constraint if exists products_compare_at_amount_check;
alter table public.products add constraint products_compare_at_amount_check
  check (compare_at_amount is null or compare_at_amount > amount);

create table if not exists public.product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  mime_type text,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);
create index if not exists product_files_product_position_idx on public.product_files(product_id, position, id);
alter table public.product_files enable row level security;
revoke all on public.product_files from anon, authenticated;
grant select on public.product_files to authenticated;
grant all on public.product_files to service_role;

create policy "Owners and entitled buyers read product file references"
on public.product_files for select to authenticated using (
  exists (select 1 from public.products p where p.id = product_files.product_id and p.creator_id = (select auth.uid()))
  or exists (
    select 1 from public.entitlements e join public.orders o on o.id = e.order_id
    where e.product_id = product_files.product_id and e.buyer_id = (select auth.uid())
      and o.buyer_id = (select auth.uid()) and e.active
      and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid', 'paid_demo')
  )
);

-- Existing blobs stay at their current paths. The old download endpoint remains compatible.
insert into public.product_files (product_id, name, file_name, storage_path, position)
select p.id, coalesce(nullif(p.file_name, ''), 'Fichier du produit'),
  coalesce(nullif(p.file_name, ''), 'fichier'), p.file_path, 0
from public.products p where p.product_kind = 'download' and nullif(p.file_path, '') is not null
  and not exists (select 1 from public.product_files f where f.product_id = p.id and f.storage_path = p.file_path);

-- Server-only, atomic manifest replacement. Storage itself is never moved or made public.
create or replace function public.replace_product_files(p_product_id uuid, p_creator_id uuid, p_files jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb; existing_path text; actual_path text;
begin
  perform 1 from public.products where id = p_product_id and creator_id = p_creator_id and product_kind = 'download' for update;
  if not found then raise exception 'Product owner required'; end if;
  if jsonb_typeof(p_files) is distinct from 'array' then raise exception 'File array required'; end if;
  if (select count(*) from jsonb_array_elements(p_files)) <> (select count(distinct (f->>'id')) from jsonb_array_elements(p_files) f)
    then raise exception 'Duplicate file identifiers'; end if;
  for item in select value from jsonb_array_elements(p_files) loop
    select storage_path into existing_path from public.product_files where id = (item->>'id')::uuid and product_id = p_product_id;
    actual_path := item->>'storage_path';
    if existing_path is not null and existing_path <> actual_path then raise exception 'Existing file path is immutable'; end if;
    if existing_path is null then
      if actual_path <> p_creator_id::text || '/' || p_product_id::text || '/files/' || (item->>'id') || '/' || regexp_replace(item->>'file_name', '[^a-zA-Z0-9_.-]', '_', 'g')
        then raise exception 'Invalid file path'; end if;
      if not exists (select 1 from storage.objects where bucket_id = 'product-files' and name = actual_path)
        then raise exception 'Uploaded object missing'; end if;
    end if;
    insert into public.product_files(id, product_id, name, file_name, storage_path, size_bytes, mime_type, position)
    values ((item->>'id')::uuid, p_product_id, item->>'name', item->>'file_name', actual_path,
      nullif(item->>'size_bytes', '')::bigint, item->>'mime_type', (item->>'position')::integer)
    on conflict (id) do update set name = excluded.name, position = excluded.position
      where public.product_files.product_id = p_product_id;
    if not found then raise exception 'File belongs to another product'; end if;
  end loop;
  delete from public.product_files where product_id = p_product_id
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_files));
  update public.products set
    file_path = (select storage_path from public.product_files where product_id = p_product_id order by position, id limit 1),
    file_name = (select file_name from public.product_files where product_id = p_product_id order by position, id limit 1)
  where id = p_product_id;
end;
$$;
revoke all on function public.replace_product_files(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_product_files(uuid, uuid, jsonb) to service_role;

commit;
