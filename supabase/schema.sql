create extension if not exists pgcrypto;

create table if not exists public.creators (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  slug text not null unique,
  bio text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  creator_name text not null,
  creator_slug text not null,
  slug text not null unique,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  product_kind text not null check (product_kind in ('download', 'course', 'membership', 'physical', 'service')),
  category text not null,
  tags text[] not null default '{}',
  amount integer not null check (amount >= 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  cover text not null default 'identity',
  cover_label text not null default '',
  file_name text,
  file_path text,
  published boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_published_created_idx
  on public.products (published, created_at desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_tags_idx on public.products using gin (tags);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  access_token text not null unique,
  buyer_id uuid references auth.users (id) on delete set null,
  buyer_email text not null,
  product_id uuid not null references public.products (id) on delete restrict,
  product_slug text not null,
  product_title text not null,
  product_kind text not null,
  creator_id uuid not null references public.creators (id) on delete restrict,
  creator_name text not null,
  creator_slug text not null,
  amount integer not null check (amount >= 0),
  currency text not null check (char_length(currency) = 3),
  shipping_address text,
  buyer_note text,
  status text not null check (status in ('pending', 'paid_demo', 'paid', 'refunded', 'canceled', 'canceled_demo')),
  provider text not null default 'demo',
  created_at timestamptz not null default now()
);

create index if not exists orders_buyer_created_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_creator_created_idx on public.orders (creator_id, created_at desc);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  buyer_id uuid references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create table if not exists public.product_contents (
  product_id uuid primary key references public.products (id) on delete cascade,
  content jsonb not null default '{"modules": [], "membershipPosts": [], "membershipCourseIds": []}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_courses (
  membership_id uuid not null references public.products (id) on delete cascade,
  course_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, course_id),
  check (membership_id <> course_id)
);

create index if not exists membership_courses_course_idx on public.membership_courses (course_id);

create table if not exists public.course_progress (
  buyer_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.products (id) on delete cascade,
  completed_lesson_ids text[] not null default '{}',
  last_lesson_id text,
  updated_at timestamptz not null default now(),
  primary key (buyer_id, course_id)
);

-- Move legacy course and member bodies out of the publicly readable products row.
insert into public.product_contents (product_id, content)
select
  p.id,
  jsonb_build_object(
    'modules', case
      when jsonb_typeof(p.details->'courseLessons') = 'array' and jsonb_array_length(p.details->'courseLessons') > 0
      then jsonb_build_array(jsonb_build_object('id', 'legacy-' || p.id::text, 'title', 'Contenu du cours', 'lessons', p.details->'courseLessons'))
      else '[]'::jsonb
    end,
    'membershipPosts', case
      when jsonb_typeof(p.details->'membershipPosts') = 'array'
      then coalesce((select jsonb_agg(post.value || '{"status":"published"}'::jsonb) from jsonb_array_elements(p.details->'membershipPosts') post), '[]'::jsonb)
      else '[]'::jsonb
    end,
    'membershipCourseIds', '[]'::jsonb
  )
from public.products p
where p.details ? 'courseLessons' or p.details ? 'membershipPosts'
on conflict (product_id) do nothing;

update public.products
set details = details - 'courseLessons' - 'membershipPosts'
where details ? 'courseLessons' or details ? 'membershipPosts';

alter table public.creators enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.entitlements enable row level security;
alter table public.product_contents enable row level security;
alter table public.membership_courses enable row level security;
alter table public.course_progress enable row level security;

create policy "Creator profiles are public"
  on public.creators for select using (true);
create policy "Creators manage their own profile"
  on public.creators for insert with check (auth.uid() = id);
create policy "Creators update their own profile"
  on public.creators for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Published products and owner drafts are visible"
  on public.products for select using (published or creator_id = auth.uid());
create policy "Creators add their own products"
  on public.products for insert with check (creator_id = auth.uid());
create policy "Creators update their own products"
  on public.products for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "Creators delete their own products"
  on public.products for delete using (creator_id = auth.uid());

create policy "Buyers and creators can read related orders"
  on public.orders for select using (
    buyer_id = auth.uid() or creator_id = auth.uid()
  );
create policy "Buyers can read their own entitlements"
  on public.entitlements for select using (buyer_id = auth.uid());

create policy "Product contents are visible to their creator and entitled buyers"
  on public.product_contents for select using (
    exists (select 1 from public.products p where p.id = product_contents.product_id and p.creator_id = auth.uid())
    or exists (
      select 1 from public.entitlements e join public.orders o on o.id = e.order_id
      where e.product_id = product_contents.product_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid')
    )
    or exists (
      select 1 from public.membership_courses mc
      join public.entitlements e on e.product_id = mc.membership_id
      join public.orders o on o.id = e.order_id
      where mc.course_id = product_contents.product_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid')
    )
  );
create policy "Creators manage their own product contents"
  on public.product_contents for all using (
    exists (select 1 from public.products p where p.id = product_contents.product_id and p.creator_id = auth.uid())
  ) with check (
    exists (select 1 from public.products p where p.id = product_contents.product_id and p.creator_id = auth.uid())
  );

create policy "Owners and active members read included courses"
  on public.membership_courses for select using (
    exists (select 1 from public.products p where p.id = membership_courses.membership_id and p.creator_id = auth.uid())
    or exists (
      select 1 from public.entitlements e join public.orders o on o.id = e.order_id
      where e.product_id = membership_courses.membership_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid')
    )
  );
create policy "Creators add courses to their memberships"
  on public.membership_courses for insert with check (
    exists (
      select 1 from public.products m join public.products c on c.creator_id = m.creator_id
      where m.id = membership_id and m.creator_id = auth.uid() and m.product_kind = 'membership'
        and c.id = course_id and c.product_kind = 'course' and c.published
    )
  );
create policy "Creators change courses in their memberships"
  on public.membership_courses for update using (
    exists (select 1 from public.products p where p.id = membership_courses.membership_id and p.creator_id = auth.uid())
  ) with check (
    exists (
      select 1 from public.products m join public.products c on c.creator_id = m.creator_id
      where m.id = membership_id and m.creator_id = auth.uid() and m.product_kind = 'membership'
        and c.id = course_id and c.product_kind = 'course' and c.published
    )
  );
create policy "Creators remove courses from their memberships"
  on public.membership_courses for delete using (
    exists (select 1 from public.products p where p.id = membership_courses.membership_id and p.creator_id = auth.uid())
  );

create policy "Learners read progress for courses they can access"
  on public.course_progress for select using (
    buyer_id = auth.uid() and (
      exists (
        select 1 from public.entitlements e join public.orders o on o.id = e.order_id
        where e.product_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid')
      )
      or exists (
        select 1 from public.membership_courses mc
        join public.entitlements e on e.product_id = mc.membership_id
        join public.orders o on o.id = e.order_id
        where mc.course_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid')
      )
    )
  );
create policy "Learners write progress for courses they can access"
  on public.course_progress for all using (
    buyer_id = auth.uid() and (
      exists (select 1 from public.entitlements e join public.orders o on o.id = e.order_id where e.product_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid'))
      or exists (select 1 from public.membership_courses mc join public.entitlements e on e.product_id = mc.membership_id join public.orders o on o.id = e.order_id where mc.course_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid'))
    )
  ) with check (
    buyer_id = auth.uid() and (
      exists (select 1 from public.entitlements e join public.orders o on o.id = e.order_id where e.product_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid'))
      or exists (select 1 from public.membership_courses mc join public.entitlements e on e.product_id = mc.membership_id join public.orders o on o.id = e.order_id where mc.course_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid'))
    )
  );

grant select, insert, update, delete on public.product_contents to authenticated;
grant select, insert, update, delete on public.membership_courses to authenticated;
grant select, insert, update, delete on public.course_progress to authenticated;

insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', false)
on conflict (id) do nothing;

create policy "Creators upload into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "Creators manage files in their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
