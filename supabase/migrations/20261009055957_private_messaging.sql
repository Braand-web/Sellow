begin;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id), seller_id uuid not null references public.creators(id),
  customer_name text not null, seller_name text not null, seller_slug text not null,
  created_at timestamptz not null default now(), last_message_at timestamptz not null default now(),
  unique(customer_id,seller_id), check(customer_id<>seller_id)
);
create index conversations_seller_recent on public.conversations(seller_id,last_message_at desc);
create index conversations_customer_recent on public.conversations(customer_id,last_message_at desc);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id), read_seq bigint not null default 0,
  blocked boolean not null default false, email_notifications boolean not null default true,
  last_notified_seq bigint not null default 0, last_notification_at timestamptz,
  primary key(conversation_id,user_id)
);
create index conversation_participants_user on public.conversation_participants(user_id,conversation_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(), seq bigint generated always as identity unique,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id), body text not null default '',
  context_product_id uuid references public.products(id), context_order_id uuid references public.orders(id),
  context_title text, context_slug text, client_request_id uuid not null,
  created_at timestamptz not null default now(), unique(conversation_id,sender_id,client_request_id),
  check(char_length(body)<=4000)
);
create index messages_conversation_seq on public.messages(conversation_id,seq desc);
create index messages_unread on public.messages(conversation_id,sender_id,seq);
-- Receipts identify the bubbles actually displayed, including when the reader
-- opens the latest page without displaying older messages.
create table public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id), read_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
create index message_reads_user on public.message_read_receipts(user_id,message_id);
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references auth.users(id), message_id uuid references public.messages(id) on delete cascade,
  storage_path text not null unique, name text not null check(char_length(name) between 1 and 180),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size bigint not null check(size between 1 and 10485760), verified boolean not null default false,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes'
);
create index message_attachments_message on public.message_attachments(message_id);
create index message_attachments_pending on public.message_attachments(created_at) where message_id is null;
create table public.message_notification_outbox (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  recipient_id uuid not null references auth.users(id), target_seq bigint not null,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed','canceled')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(), locked_until timestamptz,
  provider_message_id text, last_error text, sent_at timestamptz, created_at timestamptz not null default now(),
  unique(conversation_id,recipient_id,target_seq)
);
create unique index message_notifications_active on public.message_notification_outbox(conversation_id,recipient_id) where status in ('pending','processing');
create index message_notifications_due on public.message_notification_outbox(next_attempt_at) where status in ('pending','processing');

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_notification_outbox enable row level security;
alter table public.message_read_receipts enable row level security;
revoke all on public.message_read_receipts from public,anon,authenticated;
grant select on public.message_read_receipts to authenticated;
grant all on public.message_read_receipts to service_role;
create policy message_reads_own on public.message_read_receipts for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.conversations,public.conversation_participants,public.messages,public.message_attachments,public.message_notification_outbox from public,anon,authenticated;
grant select on public.conversations,public.conversation_participants,public.messages,public.message_attachments to authenticated;
grant all on public.conversations,public.conversation_participants,public.messages,public.message_attachments,public.message_notification_outbox to service_role;
grant usage,select on sequence public.messages_seq_seq to service_role;
create policy conversations_participants on public.conversations for select to authenticated
  using(customer_id=(select auth.uid()) or seller_id=(select auth.uid()));
create policy participants_own on public.conversation_participants for select to authenticated using(user_id=(select auth.uid()));
create policy messages_participants on public.messages for select to authenticated using(exists(
  select 1 from public.conversations c where c.id=conversation_id and (c.customer_id=(select auth.uid()) or c.seller_id=(select auth.uid()))));
create policy attachments_participants on public.message_attachments for select to authenticated using(message_id is not null and exists(
  select 1 from public.conversations c where c.id=conversation_id and (c.customer_id=(select auth.uid()) or c.seller_id=(select auth.uid()))));

-- These RPCs are service-only. Every caller supplies the identity obtained from
-- Auth.getUser(), never a customer/sender identifier from the browser.
-- Auth is read only through this private, narrowly scoped helper.
create function sellow_private.messaging_verified_email(p_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select email from auth.users where id=p_user and email_confirmed_at is not null;
$$;
revoke all on function sellow_private.messaging_verified_email(uuid) from public,anon,authenticated;
grant execute on function sellow_private.messaging_verified_email(uuid) to service_role;
create function public.open_sellow_conversation(p_customer uuid,p_seller uuid,p_name text,p_product uuid default null,p_order uuid default null)
returns public.conversations language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.conversations%rowtype; s public.creators%rowtype;
begin
  if p_customer=p_seller or sellow_private.messaging_verified_email(p_customer) is null then raise exception 'messaging_identity'; end if;
  select * into s from public.creators where id=p_seller;
  if not found then raise exception 'messaging_source'; end if;
  if p_order is not null then
    if not exists(select 1 from public.orders where id=p_order and buyer_id=p_customer and creator_id=p_seller and status in ('paid','refunded','paid_demo','canceled_demo')) then raise exception 'messaging_source'; end if;
    if p_product is not null and not exists(select 1 from public.orders where id=p_order and product_id=p_product) then raise exception 'messaging_source'; end if;
  elsif p_product is not null then
    if not exists(select 1 from public.products where id=p_product and creator_id=p_seller and published) then raise exception 'messaging_source'; end if;
  elsif not exists(select 1 from public.products where creator_id=p_seller and published) then raise exception 'messaging_source'; end if;
  perform pg_advisory_xact_lock(hashtextextended('conversation:'||p_customer::text||':'||p_seller::text,0));
  select * into v from public.conversations where customer_id=p_customer and seller_id=p_seller;
  if found then return v; end if;
  if not public.consume_sellow_rate_limit('conversation:'||p_customer::text,5,3600) then raise exception 'messaging_rate'; end if;
  insert into public.conversations(customer_id,seller_id,customer_name,seller_name,seller_slug)
    values(p_customer,p_seller,left(coalesce(nullif(trim(p_name),''),'Client'),100),s.name,s.slug) returning * into v;
  insert into public.conversation_participants(conversation_id,user_id) values(v.id,p_customer),(v.id,p_seller);
  return v;
end; $$;

create function public.send_sellow_message(p_conversation uuid,p_sender uuid,p_request uuid,p_body text,p_attachments uuid[] default '{}',p_product uuid default null,p_order uuid default null)
returns public.messages language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; m public.messages%rowtype; v_title text;v_slug text;
begin
  select * into c from public.conversations where id=p_conversation for update;
  if not found or p_sender not in (c.customer_id,c.seller_id) then raise exception 'messaging_access'; end if;
  select * into m from public.messages where conversation_id=c.id and sender_id=p_sender and client_request_id=p_request;
  if found then return m; end if;
  if exists(select 1 from public.conversation_participants where conversation_id=c.id and blocked) then raise exception 'messaging_blocked'; end if;
  if p_body is null or char_length(p_body)>4000 or cardinality(p_attachments)>3 or (trim(p_body)='' and cardinality(p_attachments)=0) then raise exception 'messaging_invalid'; end if;
  if cardinality(p_attachments)<>(select count(*) from public.message_attachments where id=any(p_attachments) and conversation_id=c.id and uploader_id=p_sender and message_id is null and verified and expires_at>now()) then raise exception 'messaging_attachment'; end if;
  if p_order is not null then
    select product_title,product_slug into v_title,v_slug from public.orders where id=p_order and buyer_id=c.customer_id and creator_id=c.seller_id and status in ('paid','refunded','paid_demo','canceled_demo');
    if not found then raise exception 'messaging_source'; end if;
    if p_product is not null and not exists(select 1 from public.orders where id=p_order and product_id=p_product) then raise exception 'messaging_source'; end if;
  elsif p_product is not null then
    select title,slug into v_title,v_slug from public.products where id=p_product and creator_id=c.seller_id and (published or exists(select 1 from public.orders where product_id=p_product and buyer_id=c.customer_id and creator_id=c.seller_id and status in ('paid','refunded','paid_demo','canceled_demo')));
    if not found then raise exception 'messaging_source'; end if;
  end if;
  if not public.consume_sellow_rate_limit('message:'||p_sender::text,20,60) then raise exception 'messaging_rate'; end if;
  insert into public.messages(conversation_id,sender_id,body,client_request_id,context_product_id,context_order_id,context_title,context_slug)
    values(c.id,p_sender,trim(p_body),p_request,p_product,p_order,v_title,v_slug) returning * into m;
  update public.message_attachments set message_id=m.id where id=any(p_attachments);
  update public.conversations set last_message_at=m.created_at where id=c.id;
  -- Sending does not acknowledge incoming messages that were not displayed.
  return m;
end; $$;

create function public.update_sellow_participant(p_conversation uuid,p_user uuid,p_read_seq bigint default null,p_blocked boolean default null,p_email boolean default null,p_read_ids uuid[] default '{}')
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.conversations where id=p_conversation and p_user in (customer_id,seller_id) for update;
  if not found then raise exception 'messaging_access'; end if;
  if p_read_seq is not null and p_read_seq<>0 and not exists(select 1 from public.messages where conversation_id=p_conversation and seq=p_read_seq) then raise exception 'messaging_invalid'; end if;
  if cardinality(p_read_ids)>50 or cardinality(p_read_ids)<>(select count(*) from public.messages where id=any(p_read_ids) and conversation_id=p_conversation) then raise exception 'messaging_invalid'; end if;
  insert into public.message_read_receipts(message_id,user_id) select id,p_user from public.messages where conversation_id=p_conversation and (id=any(p_read_ids) or seq=p_read_seq) on conflict do nothing;
  update public.conversation_participants set read_seq=greatest(read_seq,coalesce(p_read_seq,read_seq)),blocked=coalesce(p_blocked,blocked),email_notifications=coalesce(p_email,email_notifications)
    where conversation_id=p_conversation and user_id=p_user;
  update public.message_notification_outbox n set status='canceled' where n.conversation_id=p_conversation and n.status in ('pending','processing') and (
    exists(select 1 from public.conversation_participants where conversation_id=p_conversation and blocked)
    or exists(select 1 from public.conversation_participants p where p.conversation_id=n.conversation_id and p.user_id=n.recipient_id and (not p.email_notifications or not exists(select 1 from public.messages m where m.conversation_id=n.conversation_id and m.sender_id<>p.user_id and m.seq<=n.target_seq and m.seq>p.last_notified_seq and not exists(select 1 from public.message_read_receipts r where r.message_id=m.id and r.user_id=p.user_id)))));
end; $$;

create function public.list_sellow_conversations(p_user uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(q.row order by q.last_message_at desc),'[]'::jsonb) from (
    select c.last_message_at,to_jsonb(c)||jsonb_build_object('unread',
      (select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>p_user and not exists(select 1 from public.message_read_receipts r where r.message_id=m.id and r.user_id=p_user)),
      'orders',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'product_id',o.product_id,'product_title',o.product_title,'product_slug',o.product_slug,'amount',o.amount/100.0,'currency',o.currency,'status',o.status,'created_at',o.created_at,'paid_at',o.paid_at) order by o.created_at desc),'[]'::jsonb) from public.orders o where o.buyer_id=c.customer_id and o.creator_id=c.seller_id and o.status in ('paid','refunded','paid_demo','canceled_demo')),
      'last_message',(select jsonb_build_object('body',left(m.body,120),'sender_id',m.sender_id) from public.messages m where m.conversation_id=c.id order by seq desc limit 1)) as row
    from public.conversations c join public.conversation_participants p on p.conversation_id=c.id and p.user_id=p_user
    where p_user in (c.customer_id,c.seller_id) order by c.last_message_at desc
  ) q;
$$;

-- Generate one immutable batch for each unread recipient. Concurrent workers
-- lease different participants/jobs; new messages never mutate a leased batch.
create function public.lease_message_notifications(p_limit integer default 5) returns setof public.message_notification_outbox
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.conversation_participants%rowtype;v_target bigint;v_first timestamptz;
begin
  update public.message_notification_outbox set status=case when attempts>=6 then 'failed' else 'pending' end,locked_until=null
    where status='processing' and locked_until<now();
  for p in select * from public.conversation_participants cp where cp.email_notifications and (cp.last_notification_at is null or cp.last_notification_at<=now()-interval '15 minutes')
    and not exists(select 1 from public.conversation_participants b where b.conversation_id=cp.conversation_id and b.blocked)
    and not exists(select 1 from public.message_notification_outbox n where n.conversation_id=cp.conversation_id and n.recipient_id=cp.user_id and n.status in ('pending','processing'))
    and exists(select 1 from public.messages m where m.conversation_id=cp.conversation_id and m.sender_id<>cp.user_id and m.seq>cp.last_notified_seq and not exists(select 1 from public.message_read_receipts r where r.message_id=m.id and r.user_id=cp.user_id) and m.created_at<=now()-interval '5 minutes')
    for update skip locked limit 100 loop
    select max(m.seq),min(m.created_at) into v_target,v_first from public.messages m where m.conversation_id=p.conversation_id and m.sender_id<>p.user_id and m.seq>p.last_notified_seq and not exists(select 1 from public.message_read_receipts r where r.message_id=m.id and r.user_id=p.user_id);
    if v_target is not null and v_first<=now()-interval '5 minutes' then
      insert into public.message_notification_outbox(conversation_id,recipient_id,target_seq) values(p.conversation_id,p.user_id,v_target) on conflict do nothing;
    end if;
  end loop;
  return query with due as (select id from public.message_notification_outbox where status='pending' and next_attempt_at<=now() and attempts<6 order by next_attempt_at for update skip locked limit greatest(1,least(p_limit,20)))
    update public.message_notification_outbox n set status='processing',attempts=n.attempts+1,locked_until=now()+interval '2 minutes' from due where n.id=due.id returning n.*;
end; $$;
create function public.prepare_message_notification(p_job uuid,p_lease timestamptz) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.message_notification_outbox%rowtype;v_email text;
begin
  select * into n from public.message_notification_outbox where id=p_job and status='processing' and locked_until=p_lease and locked_until>now();
  if not found then return null; end if;
  if not exists(select 1 from public.conversation_participants p where conversation_id=n.conversation_id and user_id=n.recipient_id and email_notifications and exists(select 1 from public.messages m where m.conversation_id=n.conversation_id and m.sender_id<>p.user_id and m.seq<=n.target_seq and m.seq>p.last_notified_seq and not exists(select 1 from public.message_read_receipts r where r.message_id=m.id and r.user_id=p.user_id)))
    or exists(select 1 from public.conversation_participants where conversation_id=n.conversation_id and blocked) then
    update public.message_notification_outbox set status='canceled' where id=n.id; return null;
  end if;
  v_email:=sellow_private.messaging_verified_email(n.recipient_id);
  if v_email is null then update public.message_notification_outbox set status='canceled',locked_until=null where id=n.id; return null; end if;
  return jsonb_build_object('email',v_email,'conversation_id',n.conversation_id);
end; $$;
create function public.finish_message_notification(p_job uuid,p_lease timestamptz,p_provider text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.message_notification_outbox%rowtype;
begin
  update public.message_notification_outbox set status='sent',sent_at=now(),provider_message_id=p_provider,locked_until=null,last_error=null
    where id=p_job and status in ('processing','canceled') and locked_until=p_lease returning * into n;
  if not found then return false; end if;
  update public.conversation_participants set last_notified_seq=greatest(last_notified_seq,n.target_seq),last_notification_at=now() where conversation_id=n.conversation_id and user_id=n.recipient_id;
  return true;
end; $$;

revoke all on function public.open_sellow_conversation(uuid,uuid,text,uuid,uuid),public.send_sellow_message(uuid,uuid,uuid,text,uuid[],uuid,uuid),public.update_sellow_participant(uuid,uuid,bigint,boolean,boolean,uuid[]),public.list_sellow_conversations(uuid),public.lease_message_notifications(integer),public.prepare_message_notification(uuid,timestamptz),public.finish_message_notification(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.open_sellow_conversation(uuid,uuid,text,uuid,uuid),public.send_sellow_message(uuid,uuid,uuid,text,uuid[],uuid,uuid),public.update_sellow_participant(uuid,uuid,bigint,boolean,boolean,uuid[]),public.list_sellow_conversations(uuid),public.lease_message_notifications(integer),public.prepare_message_notification(uuid,timestamptz),public.finish_message_notification(uuid,timestamptz,text) to service_role;
create index orders_messaging_summary on public.orders(buyer_id,creator_id,created_at desc) where status in ('paid','refunded','paid_demo','canceled_demo');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('message-files','message-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No direct object SELECT/INSERT policy: only server-authorized signed URLs.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.messages,public.conversations,public.conversation_participants;
  end if;
end $$;
commit;
