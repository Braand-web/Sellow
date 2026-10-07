import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const ids = { creator: "10000000-0000-4000-8000-000000000001", buyer: "10000000-0000-4000-8000-000000000002", other: "10000000-0000-4000-8000-000000000003", session: "10000000-0000-4000-8000-000000000004" };
async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to public;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,name text,bucket_id text); alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;`);
  // gen_random_uuid is built in. Auth and Storage services are represented only
  // by their database contracts in this standalone Postgres WASM fixture.
  await db.exec(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8").replace("create extension if not exists pgcrypto;", ""));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261007120448_guest_checkout_email_access.sql", import.meta.url), "utf8"));
  await db.query("insert into auth.users values($1,'creator@example.com',now()),($2,'buyer@example.com',now()),($3,'other@example.com',now())", [ids.creator,ids.buyer,ids.other]);
  await db.query("insert into creators(id,name,slug) values($1,'Créateur','creator')", [ids.creator]);
  for (const kind of ["download","course","membership","physical","service"]) await db.query("insert into products(creator_id,creator_name,creator_slug,slug,title,product_kind,category,amount,published) values($1,'Créateur','creator',$2,$2,$2,'Création',1200,true)", [ids.creator,kind]);
  await db.query("insert into guest_checkout_sessions(id,token_hash,expires_at) values($1,$2,now()+interval '7 days')", [ids.session,"a".repeat(64)]);
  return db;
}
async function prepare(db, kind = "download", key = `checkout-${crypto.randomUUID()}`, email = "buyer@example.com", session = ids.session, buyer = null) {
  return (await db.query("select * from prepare_saspay_order($1,$2,$3,$4,$5,$6,null,1.1,current_date,2,$7)", [key,crypto.randomUUID(),buyer,email,kind,kind === "physical" ? "Adresse" : null,session])).rows[0];
}
async function pay(db, order, suffix = "one") {
  return (await db.query("select finalize_saspay_event($1,'transaction.succeeded',$2,$3,$4,'SUCCESS',1200,'EUR',50,1150,'DEDUCTED','{}') as done", [`event-${order.id}-${suffix}`,`tx-${order.id}`,`reference-${order.id}`,order.id])).rows[0].done;
}
async function asBuyer(db, buyer, query, params = []) {
  return db.transaction(async (tx) => { await tx.exec("set local role authenticated"); await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [buyer]); return tx.query(query,params); });
}
test("SQL: all five formats confirm once, queue once and stay inaccessible until claim", async (t) => {
  const db = await database(t);
  for (const kind of ["download","course","membership","physical","service"]) {
    const order = await prepare(db,kind);
    assert.equal(order.buyer_id,null);
    assert.equal(order.purchase_identity,"guest");
    assert.equal(await pay(db,order),true);
    assert.equal(await pay(db,order),false);
    assert.equal((await db.query("select count(*)::int as n from entitlements where order_id=$1", [order.id])).rows[0].n,1);
  }
  assert.equal((await db.query("select count(*)::int as n from email_outbox")).rows[0].n,5);
  assert.equal((await asBuyer(db,ids.buyer,"select * from orders")).rows.length,0);
  assert.equal((await asBuyer(db,ids.buyer,"select * from entitlements")).rows.length,0);
  await assert.rejects(() => asBuyer(db,ids.buyer,"select claim_guest_orders($1,'buyer@example.com')",[ids.buyer]), /permission denied/);
  assert.equal((await db.query("select claim_guest_orders($1,'buyer@example.com') as n",[ids.buyer])).rows[0].n,5);
  assert.equal((await db.query("select claim_guest_orders($1,'buyer@example.com') as n",[ids.buyer])).rows[0].n,0);
  assert.equal((await asBuyer(db,ids.buyer,"select * from orders")).rows.length,5);
  assert.equal((await asBuyer(db,ids.buyer,"select * from entitlements")).rows.length,5);
  assert.equal((await asBuyer(db,ids.other,"select * from orders")).rows.length,0);
  const course = (await db.query("select id from products where slug='course'")).rows[0];
  await db.query("insert into product_contents(product_id,content) values($1,$2)",[course.id,JSON.stringify({ modules: [{ title: "Privé" }] })]);
  await db.query("update products set published=false where id=$1",[course.id]);
  assert.equal((await asBuyer(db,ids.buyer,"select * from products where id=$1",[course.id])).rows.length,1);
  assert.equal((await asBuyer(db,ids.buyer,"select * from product_contents where product_id=$1",[course.id])).rows.length,1);
  assert.equal((await asBuyer(db,ids.other,"select * from products where id=$1",[course.id])).rows.length,0);
  assert.equal((await asBuyer(db,ids.other,"select * from product_contents where product_id=$1",[course.id])).rows.length,0);
  await assert.rejects(() => db.query("select claim_guest_orders($1,'buyer@example.com')",[ids.other]), /verified identity/);
});
test("SQL: unpaid orders, invalid sessions and reused keys cannot grant ownership", async (t) => {
  const db = await database(t);
  const key = "stable-checkout-reference";
  const order = await prepare(db,"course",key);
  assert.equal((await prepare(db,"course",key)).id,order.id);
  await assert.rejects(() => prepare(db,"course",key,"other@example.com"),/idempotency conflict/);
  await assert.rejects(() => prepare(db,"course",undefined,"buyer@example.com",ids.other),/invalid checkout identity/);
  assert.equal((await db.query("select claim_guest_orders($1,'buyer@example.com') as n",[ids.buyer])).rows[0].n,0);
  await assert.rejects(() => prepare(db,"download",undefined,"creator@example.com"),/creator cannot/);
  await assert.rejects(() => asBuyer(db,ids.buyer,"select * from guest_checkout_sessions"), /permission denied/);
  await assert.rejects(() => asBuyer(db,ids.buyer,"select * from email_outbox"), /permission denied/);
});
test("SQL: late verification preserves membership periods and independent purchases", async (t) => {
  const db = await database(t);
  const account = await prepare(db,"membership",undefined,"buyer@example.com",null,ids.buyer);
  await pay(db,account);
  const guest = await prepare(db,"membership");
  await pay(db,guest);
  const download = await prepare(db,"download");
  await pay(db,download);
  await db.query("update orders set paid_at='2020-01-01' where id=$1",[account.id]);
  await db.query("update orders set paid_at='2020-01-15' where id=$1",[guest.id]);
  await db.query("select claim_guest_orders($1,'buyer@example.com')",[ids.buyer]);
  const periods = (await db.query("select membership_expires_at from orders where product_kind='membership' order by paid_at")).rows;
  assert.equal(periods[0].membership_expires_at.toISOString(),"2020-02-01T00:00:00.000Z");
  assert.equal(periods[1].membership_expires_at.toISOString(),"2020-03-01T00:00:00.000Z");
  await db.query("update orders set membership_renewal_cancelled_at=now() where id=$1",[guest.id]);
  assert.equal((await db.query("select active,ends_at from entitlements where order_id=$1",[download.id])).rows[0].active,true);
  assert.equal((await db.query("select ends_at from entitlements where order_id=$1",[download.id])).rows[0].ends_at,null);
});
test("SQL: receipt leases, limits and proof-based corrections are atomic", async (t) => {
  const db = await database(t);
  const order = await prepare(db);
  await pay(db,order);
  assert.equal((await db.query("select * from lease_purchase_emails(20)")).rows.length,1);
  assert.equal((await db.query("select * from lease_purchase_emails(20)")).rows.length,0);
  assert.equal((await db.query("select correct_guest_order_email($1,'other@example.com',$2,$3) as ok",[order.id,`reference-${order.id}`,ids.creator])).rows[0].ok,false);
  await db.query("update email_outbox set status='failed',locked_until=null where order_id=$1",[order.id]);
  assert.equal((await db.query("select correct_guest_order_email($1,'other@example.com','wrong',$2) as ok",[order.id,ids.creator])).rows[0].ok,false);
  assert.equal((await db.query("select correct_guest_order_email($1,'other@example.com',$2,$3) as ok",[order.id,`reference-${order.id}`,ids.creator])).rows[0].ok,true);
  assert.equal((await db.query("select revision from email_outbox where order_id=$1",[order.id])).rows[0].revision,1);
  await db.query("select claim_guest_orders($1,'other@example.com')",[ids.other]);
  assert.equal((await db.query("select correct_guest_order_email($1,'buyer@example.com',$2,$3) as ok",[order.id,`reference-${order.id}`,ids.creator])).rows[0].ok,false);
  assert.equal((await db.query("select consume_sellow_rate_limit('key',1,60) as ok")).rows[0].ok,true);
  assert.equal((await db.query("select consume_sellow_rate_limit('key',1,60) as ok")).rows[0].ok,false);
});
