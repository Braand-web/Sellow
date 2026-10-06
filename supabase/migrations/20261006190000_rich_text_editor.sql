alter table public.products
  add column if not exists description_content jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-rich-images',
  'product-rich-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Creators upload public rich text images" on storage.objects;
create policy "Creators upload public rich text images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-rich-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Creators remove public rich text images" on storage.objects;
create policy "Creators remove public rich text images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-rich-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
