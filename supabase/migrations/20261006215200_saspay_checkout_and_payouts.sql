begin;

alter table public.orders
  add column if not exists provider_session_id text,
  add column if not exists provider_checkout_url text,
  add column if not exists provider_marker text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_transaction_reference text,
  add column if not exists provider_status text,
  add column if not exists fee_charge_mode text,
  add column if not exists processor_fee_amount integer not null default 0,
  add column if not exists merchant_net_amount integer,
  add column if not exists commission_rate numeric(5, 4) not null default 0,
  add column if not exists commission_amount integer not null default 0,
  add column if not exists creator_net_amount integer,
  add column if not exists sales_usd numeric(18, 6),
  add column if not exists fx_rate numeric(24, 12),
  add column if not exists fx_date date,
  add column if not exists paid_at timestamptz,
  add column if not exists membership_expires_at timestamptz,
  add column if not exists membership_renewal_cancelled_at timestamptz;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'failed', 'paid_demo', 'paid', 'refunded', 'canceled', 'canceled_demo'));

create unique index if not exists orders_provider_marker_key on public.orders(provider_marker) where provider_marker is not null;
create unique index if not exists orders_provider_transaction_id_key on public.orders(provider_transaction_id) where provider_transaction_id is not null;
create index if not exists orders_creator_paid_fx_idx on public.orders(creator_id, status, provider, paid_at desc);

alter table public.entitlements
  add column if not exists ends_at timestamptz;

create table if not exists public.saspay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  provider_transaction_id text,
  sanitized_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  currency text not null check (char_length(currency) = 3),
  country_code text not null check (char_length(country_code) = 2),
  network text not null,
  account_name text not null,
  phone_number text not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'paid')),
  payment_reference text,
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);

create index if not exists payout_requests_creator_created_idx on public.payout_requests(creator_id, created_at desc);
create index if not exists payout_requests_status_created_idx on public.payout_requests(status, created_at asc);

alter table public.saspay_webhook_events enable row level security;
alter table public.payout_requests enable row level security;

drop policy if exists "Creators read their payout requests" on public.payout_requests;
create policy "Creators read their payout requests"
  on public.payout_requests for select to authenticated
  using (creator_id = auth.uid());

revoke all on public.saspay_webhook_events from anon, authenticated;
grant all privileges on public.saspay_webhook_events to service_role;
revoke all on public.payout_requests from anon, authenticated;
grant select on public.payout_requests to authenticated;
grant all privileges on public.payout_requests to service_role;

create or replace function public.prepare_saspay_order(
  p_idempotency_key text,
  p_access_token text,
  p_buyer_id uuid,
  p_buyer_email text,
  p_product_slug text,
  p_shipping_address text,
  p_buyer_note text,
  p_fx_rate numeric,
  p_fx_date date,
  p_currency_exponent integer
) returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_lifetime_sales numeric(18, 6);
  v_rate numeric(5, 4);
  v_rounding_unit integer;
  v_marker text;
begin
  if p_buyer_id is null or p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'invalid checkout identity';
  end if;
  if p_fx_rate <= 0 or p_currency_exponent < 0 or p_currency_exponent > 2 then
    raise exception 'invalid exchange rate';
  end if;

  select * into v_product from public.products
  where slug = p_product_slug and published = true;
  if not found then raise exception 'product unavailable'; end if;
  if v_product.creator_id = p_buyer_id then raise exception 'creator cannot purchase own product'; end if;
  if v_product.amount <= 0 then raise exception 'amount must be positive'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_product.creator_id::text, 0));

  select * into v_order from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if v_order.buyer_id <> p_buyer_id or v_order.product_id <> v_product.id then
      raise exception 'checkout idempotency conflict';
    end if;
    if v_order.provider = 'saspay' and v_order.status in ('failed', 'canceled') then
      update public.orders set status = 'pending', provider_status = null,
        provider_session_id = null, provider_checkout_url = null,
        provider_transaction_id = null, provider_transaction_reference = null
      where id = v_order.id returning * into v_order;
    end if;
    return next v_order;
    return;
  end if;

  select coalesce(sum(sales_usd), 0) into v_lifetime_sales
  from public.orders
  where creator_id = v_product.creator_id and provider = 'saspay' and status = 'paid';
  v_rate := case when v_lifetime_sales >= 5000 then 0.05 else 0.10 end;
  v_rounding_unit := power(10, 2 - p_currency_exponent)::integer;
  v_marker := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.orders (
    idempotency_key, access_token, buyer_id, buyer_email, product_id, product_slug,
    product_title, product_kind, creator_id, creator_name, creator_slug, amount, currency,
    shipping_address, buyer_note, status, provider, provider_marker, commission_rate,
    commission_amount, sales_usd, fx_rate, fx_date
  ) values (
    p_idempotency_key, p_access_token, p_buyer_id, lower(trim(p_buyer_email)), v_product.id,
    v_product.slug, v_product.title, v_product.product_kind, v_product.creator_id,
    v_product.creator_name, v_product.creator_slug, v_product.amount, v_product.currency,
    nullif(trim(p_shipping_address), ''), nullif(trim(p_buyer_note), ''), 'pending', 'saspay',
    v_marker, v_rate,
    round((v_product.amount::numeric * v_rate) / v_rounding_unit) * v_rounding_unit,
    (v_product.amount::numeric / 100) * p_fx_rate, p_fx_rate, p_fx_date
  ) returning * into v_order;

  return next v_order;
end;
$$;

create or replace function public.finalize_saspay_event(
  p_event_key text,
  p_event_type text,
  p_provider_transaction_id text,
  p_transaction_reference text,
  p_order_id uuid,
  p_verified_status text,
  p_verified_amount integer,
  p_verified_currency text,
  p_processor_fee_amount integer,
  p_merchant_net_amount integer,
  p_fee_charge_mode text,
  p_sanitized_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_now timestamptz := now();
  v_membership_start timestamptz;
  v_membership_end timestamptz;
  v_creator_net integer;
begin
  insert into public.saspay_webhook_events(event_key, event_type, provider_transaction_id, sanitized_payload)
  values (p_event_key, p_event_type, p_provider_transaction_id, coalesce(p_sanitized_payload, '{}'::jsonb))
  on conflict (event_key) do nothing;
  if not found then return false; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.provider <> 'saspay' then raise exception 'order not found'; end if;

  update public.orders set provider_status = p_verified_status where id = v_order.id;

  if p_verified_status <> 'SUCCESS' then
    if p_event_type = 'transaction.cancelled' and v_order.status <> 'paid' then
      update public.orders set status = 'canceled' where id = v_order.id;
    elsif p_event_type = 'transaction.failed' and v_order.status = 'pending' then
      update public.orders set status = 'failed' where id = v_order.id;
    end if;
    return true;
  end if;

  if p_verified_amount <> v_order.amount or upper(p_verified_currency) <> upper(v_order.currency) then
    raise exception 'verified amount mismatch';
  end if;
  if v_order.status = 'paid' then
    if v_order.provider_transaction_id = p_provider_transaction_id then return true; end if;
    raise exception 'order already completed by another transaction';
  end if;

  v_creator_net := greatest(0, greatest(0, p_merchant_net_amount) - v_order.commission_amount);
  if v_order.product_kind = 'membership' then
    select max(e.ends_at) into v_membership_start
    from public.entitlements e
    join public.orders o on o.id = e.order_id
    where e.buyer_id = v_order.buyer_id and e.product_id = v_order.product_id and e.active
      and o.status = 'paid' and e.ends_at > v_now;
    v_membership_end := (coalesce(v_membership_start, v_now) + interval '1 month');
  end if;

  update public.orders set
    status = 'paid',
    provider_status = 'SUCCESS',
    provider_transaction_id = p_provider_transaction_id,
    provider_transaction_reference = p_transaction_reference,
    processor_fee_amount = greatest(0, p_processor_fee_amount),
    merchant_net_amount = greatest(0, p_merchant_net_amount),
    creator_net_amount = v_creator_net,
    fee_charge_mode = p_fee_charge_mode,
    paid_at = coalesce(paid_at, v_now),
    membership_expires_at = v_membership_end
  where id = v_order.id;

  insert into public.entitlements(order_id, product_id, buyer_id, active, ends_at)
  values (v_order.id, v_order.product_id, v_order.buyer_id, true, v_membership_end)
  on conflict (order_id, product_id) do update set active = true, ends_at = excluded.ends_at;

  return true;
end;
$$;

create or replace function public.create_payout_request(
  p_creator_id uuid,
  p_amount integer,
  p_currency text,
  p_country_code text,
  p_network text,
  p_account_name text,
  p_phone_number text
) returns public.payout_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_earned bigint;
  v_reserved bigint;
  v_request public.payout_requests%rowtype;
begin
  if p_amount <= 0 or upper(p_currency) !~ '^[A-Z]{3}$' or upper(p_country_code) !~ '^[A-Z]{2}$'
     or length(trim(p_network)) < 2 or length(trim(p_account_name)) < 2
     or length(regexp_replace(p_phone_number, '[^0-9+]', '', 'g')) < 7 then
    raise exception 'invalid payout request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_creator_id::text || ':' || upper(p_currency), 1));

  select coalesce(sum(creator_net_amount), 0) into v_earned
  from public.orders where creator_id = p_creator_id and provider = 'saspay' and status = 'paid' and currency = upper(p_currency);
  select coalesce(sum(amount), 0) into v_reserved
  from public.payout_requests where creator_id = p_creator_id and currency = upper(p_currency) and status in ('requested', 'approved', 'paid');
  if p_amount > v_earned - v_reserved then raise exception 'insufficient available balance'; end if;

  insert into public.payout_requests(creator_id, amount, currency, country_code, network, account_name, phone_number)
  values (p_creator_id, p_amount, upper(p_currency), upper(p_country_code), trim(p_network), trim(p_account_name), trim(p_phone_number))
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.update_payout_request(
  p_request_id uuid,
  p_next_status text,
  p_payment_reference text default null,
  p_admin_note text default null
) returns public.payout_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.payout_requests%rowtype;
begin
  select * into v_request from public.payout_requests where id = p_request_id for update;
  if not found then raise exception 'payout request not found'; end if;
  if p_next_status = 'approved' and v_request.status = 'requested' then
    update public.payout_requests set status = 'approved', reviewed_at = now(), admin_note = nullif(trim(p_admin_note), '')
      where id = p_request_id returning * into v_request;
  elsif p_next_status = 'rejected' and v_request.status in ('requested', 'approved') then
    update public.payout_requests set status = 'rejected', reviewed_at = now(), admin_note = nullif(trim(p_admin_note), '')
      where id = p_request_id returning * into v_request;
  elsif p_next_status = 'paid' and v_request.status = 'approved'
    and length(trim(coalesce(p_payment_reference, ''))) between 2 and 160 then
    update public.payout_requests set status = 'paid', paid_at = now(), payment_reference = trim(p_payment_reference), admin_note = nullif(trim(p_admin_note), '')
      where id = p_request_id returning * into v_request;
  else
    raise exception 'invalid payout status transition';
  end if;
  return v_request;
end;
$$;

revoke all on function public.prepare_saspay_order(text, text, uuid, text, text, text, text, numeric, date, integer) from public, anon, authenticated;
revoke all on function public.finalize_saspay_event(text, text, text, text, uuid, text, integer, text, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_payout_request(uuid, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_payout_request(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_saspay_order(text, text, uuid, text, text, text, text, numeric, date, integer) to service_role;
grant execute on function public.finalize_saspay_event(text, text, text, text, uuid, text, integer, text, integer, integer, text, jsonb) to service_role;
grant execute on function public.create_payout_request(uuid, integer, text, text, text, text, text) to service_role;
grant execute on function public.update_payout_request(uuid, text, text, text) to service_role;

drop policy if exists "Product contents are visible to their creator and entitled buyers" on public.product_contents;
create policy "Product contents are visible to their creator and entitled buyers"
  on public.product_contents for select using (
    exists (select 1 from public.products p where p.id = product_contents.product_id and p.creator_id = auth.uid())
    or exists (
      select 1 from public.entitlements e join public.orders o on o.id = e.order_id
      where e.product_id = product_contents.product_id and e.buyer_id = auth.uid() and e.active
        and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid')
    )
    or exists (
      select 1 from public.membership_courses mc
      join public.entitlements e on e.product_id = mc.membership_id
      join public.orders o on o.id = e.order_id
      where mc.course_id = product_contents.product_id and e.buyer_id = auth.uid() and e.active
        and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid')
    )
  );

drop policy if exists "Owners and active members read included courses" on public.membership_courses;
create policy "Owners and active members read included courses"
  on public.membership_courses for select using (
    exists (select 1 from public.products p where p.id = membership_courses.membership_id and p.creator_id = auth.uid())
    or exists (
      select 1 from public.entitlements e join public.orders o on o.id = e.order_id
      where e.product_id = membership_courses.membership_id and e.buyer_id = auth.uid() and e.active
        and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid')
    )
  );

drop policy if exists "Learners read progress for courses they can access" on public.course_progress;
create policy "Learners read progress for courses they can access"
  on public.course_progress for select using (
    buyer_id = auth.uid() and (
      exists (select 1 from public.entitlements e join public.orders o on o.id = e.order_id
        where e.product_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active
          and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid'))
      or exists (select 1 from public.membership_courses mc join public.entitlements e on e.product_id = mc.membership_id join public.orders o on o.id = e.order_id
        where mc.course_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active
          and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid'))
    )
  );
drop policy if exists "Learners write progress for courses they can access" on public.course_progress;
create policy "Learners write progress for courses they can access"
  on public.course_progress for all using (
    buyer_id = auth.uid() and (
      exists (select 1 from public.entitlements e join public.orders o on o.id = e.order_id where e.product_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid'))
      or exists (select 1 from public.membership_courses mc join public.entitlements e on e.product_id = mc.membership_id join public.orders o on o.id = e.order_id where mc.course_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid'))
    )
  ) with check (
    buyer_id = auth.uid() and (
      exists (select 1 from public.entitlements e join public.orders o on o.id = e.order_id where e.product_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid'))
      or exists (select 1 from public.membership_courses mc join public.entitlements e on e.product_id = mc.membership_id join public.orders o on o.id = e.order_id where mc.course_id = course_progress.course_id and e.buyer_id = auth.uid() and e.active and (e.ends_at is null or e.ends_at > now()) and o.status in ('paid_demo', 'paid'))
    )
  );

commit;
