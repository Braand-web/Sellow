begin;

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

insert into public.product_contents (product_id, content)
select p.id,
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

alter table public.product_contents enable row level security;
alter table public.membership_courses enable row level security;
alter table public.course_progress enable row level security;

drop policy if exists "Product contents are visible to their creator and entitled buyers" on public.product_contents;
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
drop policy if exists "Creators manage their own product contents" on public.product_contents;
create policy "Creators manage their own product contents"
  on public.product_contents for all using (
    exists (select 1 from public.products p where p.id = product_contents.product_id and p.creator_id = auth.uid())
  ) with check (
    exists (select 1 from public.products p where p.id = product_contents.product_id and p.creator_id = auth.uid())
  );

drop policy if exists "Owners and active members read included courses" on public.membership_courses;
create policy "Owners and active members read included courses"
  on public.membership_courses for select using (
    exists (select 1 from public.products p where p.id = membership_courses.membership_id and p.creator_id = auth.uid())
    or exists (
      select 1 from public.entitlements e join public.orders o on o.id = e.order_id
      where e.product_id = membership_courses.membership_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid')
    )
  );
drop policy if exists "Creators add courses to their memberships" on public.membership_courses;
create policy "Creators add courses to their memberships"
  on public.membership_courses for insert with check (
    exists (
      select 1 from public.products m join public.products c on c.creator_id = m.creator_id
      where m.id = membership_courses.membership_id and m.creator_id = auth.uid() and m.product_kind = 'membership'
        and c.id = membership_courses.course_id and c.product_kind = 'course' and c.published
    )
  );
drop policy if exists "Creators change courses in their memberships" on public.membership_courses;
create policy "Creators change courses in their memberships"
  on public.membership_courses for update using (
    exists (select 1 from public.products p where p.id = membership_courses.membership_id and p.creator_id = auth.uid())
  ) with check (
    exists (
      select 1 from public.products m join public.products c on c.creator_id = m.creator_id
      where m.id = membership_courses.membership_id and m.creator_id = auth.uid() and m.product_kind = 'membership'
        and c.id = membership_courses.course_id and c.product_kind = 'course' and c.published
    )
  );
drop policy if exists "Creators remove courses from their memberships" on public.membership_courses;
create policy "Creators remove courses from their memberships"
  on public.membership_courses for delete using (
    exists (select 1 from public.products p where p.id = membership_courses.membership_id and p.creator_id = auth.uid())
  );

drop policy if exists "Learners read progress for courses they can access" on public.course_progress;
create policy "Learners read progress for courses they can access"
  on public.course_progress for select using (
    buyer_id = auth.uid() and (
      exists (select 1 from public.entitlements e join public.orders o on o.id = e.order_id where e.product_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid'))
      or exists (select 1 from public.membership_courses mc join public.entitlements e on e.product_id = mc.membership_id join public.orders o on o.id = e.order_id where mc.course_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and o.status in ('paid_demo', 'paid'))
    )
  );
drop policy if exists "Learners write progress for courses they can access" on public.course_progress;
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

commit;
