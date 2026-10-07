begin;
create schema if not exists sellow_private;
revoke all on schema sellow_private from public, anon, authenticated;
grant usage on schema sellow_private to service_role;

-- Purchases remain usable when a creator removes an item from the catalogue.
-- Only metadata is selected here; private content keeps its existing policies.
create function sellow_private.can_read_purchased_metadata(p_product_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    exists(select 1 from public.entitlements e join public.orders o on o.id=e.order_id
      where e.buyer_id=auth.uid() and e.product_id=p_product_id and e.active
        and (e.ends_at is null or e.ends_at>now()) and o.status in ('paid','paid_demo'))
    or exists(select 1 from public.membership_courses mc join public.entitlements e on e.product_id=mc.membership_id
      join public.orders o on o.id=e.order_id where mc.course_id=p_product_id and e.buyer_id=auth.uid() and e.active
        and (e.ends_at is null or e.ends_at>now()) and o.status in ('paid','paid_demo'))
  );
$$;
revoke all on function sellow_private.can_read_purchased_metadata(uuid) from public,anon;
grant usage on schema sellow_private to authenticated;
grant execute on function sellow_private.can_read_purchased_metadata(uuid) to authenticated;
create policy "Buyers read metadata for acquired content" on public.products for select to authenticated
  using(sellow_private.can_read_purchased_metadata(id));
create index if not exists entitlements_active_buyer_product_idx on public.entitlements(buyer_id,product_id,ends_at) where active;

create table public.guest_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
alter table public.guest_checkout_sessions enable row level security;
revoke all on public.guest_checkout_sessions from public, anon, authenticated;
grant all on public.guest_checkout_sessions to service_role;
create index guest_checkout_sessions_expiry_idx on public.guest_checkout_sessions(expires_at);
alter table public.orders
  add column purchase_identity text not null default 'account' check (purchase_identity in ('account','guest')),
  add column guest_session_id uuid references public.guest_checkout_sessions(id) on delete set null,
  add column guest_claimed_at timestamptz;
create index orders_guest_session_idx on public.orders(guest_session_id) where guest_session_id is not null;
create index orders_unclaimed_email_idx on public.orders(lower(buyer_email),paid_at)
  where purchase_identity='guest' and guest_claimed_at is null and buyer_id is null and status='paid';

create table public.sellow_rate_limits (
  key text not null, window_start bigint not null, count integer not null,
  expires_at timestamptz not null, primary key(key,window_start)
);
alter table public.sellow_rate_limits enable row level security;
revoke all on public.sellow_rate_limits from public, anon, authenticated;
grant all on public.sellow_rate_limits to service_role;
create index sellow_rate_limits_expiry_idx on public.sellow_rate_limits(expires_at);
create function public.consume_sellow_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer; v_window bigint;
begin
  if p_limit<1 or p_window_seconds<1 then return false; end if;
  if p_limit=1 then
    insert into public.sellow_rate_limits(key,window_start,count,expires_at) values(p_key,0,1,now()+make_interval(secs=>p_window_seconds))
    on conflict(key,window_start) do update set
      count=case when sellow_rate_limits.expires_at<=now() then 1 else 2 end,
      expires_at=case when sellow_rate_limits.expires_at<=now() then now()+make_interval(secs=>p_window_seconds) else sellow_rate_limits.expires_at end
      returning count into v_count;
    return v_count=1;
  end if;
  v_window:=floor(extract(epoch from now())/p_window_seconds)::bigint;
  insert into public.sellow_rate_limits(key,window_start,count,expires_at)
  values(p_key,v_window,1,now()+make_interval(secs=>p_window_seconds*2))
  on conflict(key,window_start) do update set count=sellow_rate_limits.count+1 returning count into v_count;
  return v_count<=p_limit;
end; $$;
revoke all on function public.consume_sellow_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_sellow_rate_limit(text,integer,integer) to service_role;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null default 'receipt' check(kind='receipt'),recipient text not null,revision integer not null default 0,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,next_attempt_at timestamptz not null default now(),locked_until timestamptz,
  provider_message_id text,last_error text,created_at timestamptz not null default now(),sent_at timestamptz,
  unique(order_id,kind)
);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public,anon,authenticated;
grant all on public.email_outbox to service_role;
create index email_outbox_queue_idx on public.email_outbox(next_attempt_at) where status in ('pending','processing');
create function sellow_private.queue_purchase_receipt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.provider='saspay' and new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    insert into public.email_outbox(order_id,recipient) values(new.id,new.buyer_email) on conflict(order_id,kind) do nothing;
  end if;
  return new;
end; $$;
revoke all on function sellow_private.queue_purchase_receipt() from public,anon,authenticated;
create trigger queue_purchase_receipt after insert or update of status on public.orders
  for each row execute function sellow_private.queue_purchase_receipt();
create function public.lease_purchase_emails(p_limit integer default 20) returns setof public.email_outbox
language sql security invoker set search_path=public,pg_temp as $$
  update public.email_outbox set status='processing',attempts=attempts+1,locked_until=now()+interval '5 minutes'
  where id in (select id from public.email_outbox where attempts<6 and next_attempt_at<=now()
    and (status='pending' or (status='processing' and locked_until<now()))
    order by next_attempt_at for update skip locked limit least(greatest(p_limit,1),20)) returning *;
$$;
revoke all on function public.lease_purchase_emails(integer) from public,anon,authenticated;
grant execute on function public.lease_purchase_emails(integer) to service_role;

-- The historical ten-argument checkout function is retained for a safe rollout.
create function sellow_private.prepare_guest_order(
  p_idempotency_key text,p_access_token text,p_buyer_id uuid,p_buyer_email text,p_product_slug text,
  p_shipping_address text,p_buyer_note text,p_fx_rate numeric,p_fx_date date,p_currency_exponent integer,p_guest_session_id uuid
) returns setof public.orders language plpgsql security definer set search_path=public,pg_temp as $$
declare v_product public.products%rowtype;v_order public.orders%rowtype;v_sales numeric;v_rate numeric;v_unit integer;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128
    or p_buyer_email is null or length(p_buyer_email)>254 or p_buyer_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (p_buyer_id is null and not exists(select 1 from public.guest_checkout_sessions where id=p_guest_session_id and expires_at>now()))
    or (p_buyer_id is not null and p_guest_session_id is not null) then raise exception 'invalid checkout identity'; end if;
  if p_fx_rate is null or p_fx_rate<=0 or p_currency_exponent not between 0 and 2 then raise exception 'invalid exchange rate'; end if;
  select * into v_product from public.products where slug=p_product_slug and published=true;
  if not found then raise exception 'product unavailable'; end if;
  if v_product.creator_id=p_buyer_id or exists(select 1 from auth.users where id=v_product.creator_id and lower(email)=lower(trim(p_buyer_email)))
    then raise exception 'creator cannot purchase own product'; end if;
  if v_product.amount<=0 then raise exception 'amount must be positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_product.creator_id::text,0));
  select * into v_order from public.orders where idempotency_key=p_idempotency_key;
  if found then
    if v_order.buyer_id is distinct from p_buyer_id or v_order.guest_session_id is distinct from p_guest_session_id
      or v_order.buyer_email<>lower(trim(p_buyer_email)) or v_order.product_id<>v_product.id then raise exception 'checkout idempotency conflict'; end if;
    if v_order.provider='saspay' and v_order.status in ('failed','canceled') then
      update public.orders set status='pending',provider_status=null,provider_session_id=null,provider_checkout_url=null,
        provider_transaction_id=null,provider_transaction_reference=null where id=v_order.id returning * into v_order;
    end if;
    return next v_order;return;
  end if;
  select coalesce(sum(sales_usd),0) into v_sales from public.orders where creator_id=v_product.creator_id and provider='saspay' and status='paid';
  v_rate:=case when v_sales>=5000 then 0.05 else 0.10 end;v_unit:=power(10,2-p_currency_exponent)::integer;
  insert into public.orders(idempotency_key,access_token,buyer_id,buyer_email,product_id,product_slug,product_title,product_kind,
    creator_id,creator_name,creator_slug,amount,currency,shipping_address,buyer_note,status,provider,provider_marker,
    commission_rate,commission_amount,sales_usd,fx_rate,fx_date,purchase_identity,guest_session_id)
  values(p_idempotency_key,p_access_token,p_buyer_id,lower(trim(p_buyer_email)),v_product.id,v_product.slug,v_product.title,v_product.product_kind,
    v_product.creator_id,v_product.creator_name,v_product.creator_slug,v_product.amount,v_product.currency,nullif(trim(p_shipping_address),''),nullif(trim(p_buyer_note),''),
    'pending','saspay',upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),v_rate,round((v_product.amount::numeric*v_rate)/v_unit)*v_unit,
    (v_product.amount::numeric/100)*p_fx_rate,p_fx_rate,p_fx_date,case when p_buyer_id is null then 'guest' else 'account' end,p_guest_session_id)
  returning * into v_order;
  return next v_order;
end; $$;
revoke all on function sellow_private.prepare_guest_order(text,text,uuid,text,text,text,text,numeric,date,integer,uuid) from public,anon,authenticated;
grant execute on function sellow_private.prepare_guest_order(text,text,uuid,text,text,text,text,numeric,date,integer,uuid) to service_role;
create function public.prepare_saspay_order(p_idempotency_key text,p_access_token text,p_buyer_id uuid,p_buyer_email text,p_product_slug text,p_shipping_address text,p_buyer_note text,p_fx_rate numeric,p_fx_date date,p_currency_exponent integer,p_guest_session_id uuid) returns setof public.orders
language sql security invoker set search_path=public,pg_temp as $$
  select * from sellow_private.prepare_guest_order(p_idempotency_key,p_access_token,p_buyer_id,p_buyer_email,p_product_slug,p_shipping_address,p_buyer_note,p_fx_rate,p_fx_date,p_currency_exponent,p_guest_session_id);
$$;
revoke all on function public.prepare_saspay_order(text,text,uuid,text,text,text,text,numeric,date,integer,uuid) from public,anon,authenticated;
grant execute on function public.prepare_saspay_order(text,text,uuid,text,text,text,text,numeric,date,integer,uuid) to service_role;

create function sellow_private.claim_guest_orders(p_buyer_id uuid,p_verified_email text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_count integer:=0;v_product uuid;v_end timestamptz;v_start timestamptz;
begin
  if not exists(select 1 from auth.users where id=p_buyer_id and lower(email)=lower(trim(p_verified_email)) and email_confirmed_at is not null)
    then raise exception 'verified identity required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('buyer-payment:'||lower(trim(p_verified_email)),0));
  for v_order in select * from public.orders where purchase_identity='guest' and guest_claimed_at is null and buyer_id is null
    and lower(buyer_email)=lower(trim(p_verified_email)) and status='paid' order by paid_at,id for update loop
    update public.orders set buyer_id=p_buyer_id,guest_claimed_at=now() where id=v_order.id;
    update public.entitlements set buyer_id=p_buyer_id where order_id=v_order.id and buyer_id is null;
    v_count:=v_count+1;
  end loop;
  -- Merge membership periods by payment date. Verification never restarts a paid period.
  if v_count>0 then
    for v_product in select distinct product_id from public.orders where buyer_id=p_buyer_id and purchase_identity='guest' and product_kind='membership' and status='paid' loop
      v_end:=null;
      for v_order in select * from public.orders where buyer_id=p_buyer_id and product_id=v_product and provider='saspay' and status='paid' order by paid_at,id for update loop
        v_start:=greatest(coalesce(v_order.paid_at,v_order.created_at),coalesce(v_end,coalesce(v_order.paid_at,v_order.created_at)));
        v_end:=v_start+interval '1 month';
        update public.orders set membership_expires_at=v_end where id=v_order.id;
        update public.entitlements set ends_at=v_end where order_id=v_order.id and buyer_id=p_buyer_id;
      end loop;
    end loop;
  end if;
  return v_count;
end; $$;
revoke all on function sellow_private.claim_guest_orders(uuid,text) from public,anon,authenticated;
grant execute on function sellow_private.claim_guest_orders(uuid,text) to service_role;
create function public.claim_guest_orders(p_buyer_id uuid,p_verified_email text) returns integer
language sql security invoker set search_path=public,pg_temp as $$ select sellow_private.claim_guest_orders(p_buyer_id,p_verified_email); $$;
revoke all on function public.claim_guest_orders(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_guest_orders(uuid,text) to service_role;

-- Payment finalization and guest binding share a lock before locking orders.
-- This also serializes simultaneous membership renewals for one buyer.
alter function public.finalize_saspay_event(text,text,text,text,uuid,text,integer,text,integer,integer,text,jsonb) set schema sellow_private;
create function public.finalize_saspay_event(
  p_event_key text,p_event_type text,p_provider_transaction_id text,p_transaction_reference text,p_order_id uuid,
  p_verified_status text,p_verified_amount integer,p_verified_currency text,p_processor_fee_amount integer,
  p_merchant_net_amount integer,p_fee_charge_mode text,p_sanitized_payload jsonb
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_email text;
begin
  select lower(buyer_email) into v_email from public.orders where id=p_order_id;
  if v_email is null then raise exception 'order not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('buyer-payment:'||v_email,0));
  return sellow_private.finalize_saspay_event(p_event_key,p_event_type,p_provider_transaction_id,p_transaction_reference,p_order_id,
    p_verified_status,p_verified_amount,p_verified_currency,p_processor_fee_amount,p_merchant_net_amount,p_fee_charge_mode,p_sanitized_payload);
end; $$;
revoke all on function public.finalize_saspay_event(text,text,text,text,uuid,text,integer,text,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_saspay_event(text,text,text,text,uuid,text,integer,text,integer,integer,text,jsonb) to service_role;

create table public.guest_email_corrections (
  id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),admin_id uuid not null references auth.users(id),
  old_email text not null,new_email text not null,transaction_reference text not null,created_at timestamptz not null default now()
);
alter table public.guest_email_corrections enable row level security;
revoke all on public.guest_email_corrections from public,anon,authenticated;
grant all on public.guest_email_corrections to service_role;
create function public.correct_guest_order_email(p_order_id uuid,p_email text,p_transaction_reference text,p_admin_id uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.purchase_identity<>'guest' or v_order.buyer_id is not null or v_order.guest_claimed_at is not null or v_order.status<>'paid'
    or coalesce(v_order.provider_transaction_reference,'')='' or v_order.provider_transaction_reference is distinct from p_transaction_reference
    or exists(select 1 from public.email_outbox where order_id=p_order_id and status='processing' and locked_until>now())
    or p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then return false; end if;
  insert into public.guest_email_corrections(order_id,admin_id,old_email,new_email,transaction_reference)
    values(p_order_id,p_admin_id,v_order.buyer_email,lower(trim(p_email)),p_transaction_reference);
  update public.orders set buyer_email=lower(trim(p_email)) where id=p_order_id;
  update public.email_outbox set recipient=lower(trim(p_email)),status='pending',attempts=0,next_attempt_at=now(),locked_until=null,
    provider_message_id=null,sent_at=null,revision=revision+1 where order_id=p_order_id;
  return true;
end; $$;
revoke all on function public.correct_guest_order_email(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.correct_guest_order_email(uuid,text,text,uuid) to service_role;
commit;
