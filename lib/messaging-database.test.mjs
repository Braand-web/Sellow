import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const ids = {
  seller: "20000000-0000-4000-8000-000000000001",
  buyer: "20000000-0000-4000-8000-000000000002",
  other: "20000000-0000-4000-8000-000000000003",
};
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
  );
  for (const file of [
    "schema.sql",
    "migrations/20261007120448_guest_checkout_email_access.sql",
    "migrations/20261009055957_private_messaging.sql",
  ])
    await db.exec(
      readFileSync(
        new URL(`../supabase/${file}`, import.meta.url),
        "utf8",
      ).replace("create extension if not exists pgcrypto;", ""),
    );
  await db.query(
    "insert into auth.users values($1,'seller@test.com',now()),($2,'buyer@test.com',now()),($3,'other@test.com',now())",
    Object.values(ids),
  );
  await db.query(
    "insert into creators(id,name,slug) values($1,'Vendeur','vendeur'),($2,'Autre','autre')",
    [ids.seller, ids.other],
  );
  const product = (
    await db.query(
      "insert into products(creator_id,creator_name,creator_slug,slug,title,product_kind,category,amount,published) values($1,'Vendeur','vendeur','cours','Cours','course','Création',1200,true) returning id",
      [ids.seller],
    )
  ).rows[0].id;
  return { db, product };
}
async function open(db, product) {
  return (
    await db.query(
      "select * from open_sellow_conversation($1,$2,'Client',$3)",
      [ids.buyer, ids.seller, product],
    )
  ).rows[0];
}
async function send(
  db,
  id,
  sender = ids.buyer,
  body = "Question",
  nonce = crypto.randomUUID(),
  files = [],
) {
  return (
    await db.query("select * from send_sellow_message($1,$2,$3,$4,$5)", [
      id,
      sender,
      nonce,
      body,
      files,
    ])
  ).rows[0];
}
async function as(db, user, query, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return tx.query(query, params);
  });
}
test("SQL messaging: one thread per pair, RLS and service-only mutations", async (t) => {
  const { db, product } = await fixture(t);
  const c = await open(db, product);
  assert.equal((await open(db, product)).id, c.id);
  const m = await send(db, c.id);
  for (const user of [ids.buyer, ids.seller])
    assert.equal((await as(db, user, "select * from messages")).rows.length, 1);
  assert.equal(
    (await as(db, ids.other, "select * from messages")).rows.length,
    0,
  );
  assert.equal(
    (await as(db, ids.other, "select * from conversations")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      as(db, ids.buyer, "select send_sellow_message($1,$2,$3,'forged')", [
        c.id,
        ids.seller,
        crypto.randomUUID(),
      ]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      as(
        db,
        ids.buyer,
        "insert into messages(conversation_id,sender_id,body,client_request_id) values($1,$2,'bypass',$3)",
        [c.id, ids.buyer, crypto.randomUUID()],
      ),
    /permission denied/,
  );
  await assert.rejects(() => send(db, c.id, ids.other), /messaging_access/);
  assert.equal(m.body, "Question");
  const list = (
    await db.query("select list_sellow_conversations($1) as items", [
      ids.seller,
    ])
  ).rows[0].items;
  assert.equal(list[0].unread, 1);
  assert.deepEqual(list[0].orders, []);
});

test("SQL messaging: the server role can open verified conversations without reading auth.users", async (t) => {
  const { db, product } = await fixture(t);
  const c = await db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    const row = (await tx.query('select * from open_sellow_conversation($1,$2,$3,$4)', [ids.buyer, ids.seller, 'Client', product])).rows[0];
    await tx.query('select * from send_sellow_message($1,$2,$3,$4)', [row.id, ids.buyer, crypto.randomUUID(), 'Bonjour']);
    return row;
  });
  assert.ok(c.id);
  await assert.rejects(() => db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    await tx.query('select * from auth.users');
  }), /permission denied/);
});

test("SQL messaging: five new conversations per hour, reopening an existing thread is allowed", async (t) => {
  const { db, product } = await fixture(t);
  const c = await open(db, product);
  for (let index = 0; index < 5; index++) {
    const seller = crypto.randomUUID();
    await db.query('insert into auth.users values($1,$2,now())', [seller, `seller${index}@test.com`]);
    await db.query('insert into creators(id,name,slug) values($1,$2,$3)', [seller, `Vendeur ${index}`, `vendeur-${index}`]);
    await db.query("insert into products(creator_id,creator_name,creator_slug,slug,title,product_kind,category,amount,published) values($1,'Vendeur',$2,$2,'Guide','download','Création',1200,true)", [seller, `vendeur-${index}`]);
    const start = () => db.query('select * from open_sellow_conversation($1,$2,$3)', [ids.buyer, seller, 'Client']);
    if (index === 4) await assert.rejects(start, /messaging_rate/);
    else await start();
  }
  assert.equal((await open(db, product)).id, c.id);
});
test("SQL messaging: idempotence, visible reads, block and rate limits", async (t) => {
  const { db, product } = await fixture(t);
  const c = await open(db, product);
  const nonce = crypto.randomUUID();
  const m = await send(db, c.id, ids.buyer, "Bonjour", nonce);
  assert.equal((await send(db, c.id, ids.buyer, "Bonjour", nonce)).id, m.id);
  const hidden = await send(db, c.id);
  await db.query("select update_sellow_participant($1,$2,$3)", [
    c.id,
    ids.seller,
    hidden.seq,
  ]);
  assert.equal(
    (
      await db.query("select list_sellow_conversations($1) as items", [
        ids.seller,
      ])
    ).rows[0].items[0].unread,
    1,
  );
  await db.query("select update_sellow_participant($1,$2,null,true)", [
    c.id,
    ids.seller,
  ]);
  await assert.rejects(() => send(db, c.id), /messaging_blocked/);
  assert.equal((await send(db, c.id, ids.buyer, "Bonjour", nonce)).id, m.id);
  await db.query("select update_sellow_participant($1,$2,null,false)", [
    c.id,
    ids.buyer,
  ]);
  await assert.rejects(() => send(db, c.id), /messaging_blocked/);
  await db.query("select update_sellow_participant($1,$2,null,false)", [
    c.id,
    ids.seller,
  ]);
  for (let i = 0; i < 18; i++) await send(db, c.id);
  await assert.rejects(() => send(db, c.id), /messaging_rate/);
  await assert.rejects(
    () => send(db, c.id, ids.seller, "x".repeat(4001)),
    /messaging_invalid/,
  );
});
test("SQL messaging: context belongs to seller, verified attachments only", async (t) => {
  const { db, product } = await fixture(t);
  const c = await open(db, product);
  const attachment = crypto.randomUUID();
  await db.query(
    "insert into message_attachments(id,conversation_id,uploader_id,storage_path,name,mime_type,size) values($1,$2,$3,'path','Test.pdf','application/pdf',12)",
    [attachment, c.id, ids.buyer],
  );
  await assert.rejects(
    () => send(db, c.id, ids.buyer, "", undefined, [attachment]),
    /messaging_attachment/,
  );
  await db.query("update message_attachments set verified=true where id=$1", [
    attachment,
  ]);
  const m = await send(db, c.id, ids.buyer, "", undefined, [attachment]);
  assert.equal(m.body, "");
  assert.equal(
    (await as(db, ids.seller, "select * from message_attachments")).rows.length,
    1,
  );
  assert.equal(
    (await as(db, ids.other, "select * from message_attachments")).rows.length,
    0,
  );
  await assert.rejects(
    () => send(db, c.id, ids.seller, "", undefined, [attachment]),
    /messaging_attachment/,
  );
  await assert.rejects(
    () =>
      db.query("select send_sellow_message($1,$2,$3,'forged','{}',$4)", [
        c.id,
        ids.buyer,
        crypto.randomUUID(),
        crypto.randomUUID(),
      ]),
    /messaging_source/,
  );
  const linked = (
    await db.query(
      "select * from send_sellow_message($1,$2,$3,'À propos','{}',$4)",
      [c.id, ids.buyer, crypto.randomUUID(), product],
    )
  ).rows[0];
  assert.equal(linked.context_title, "Cours");
});
test("SQL messaging: delayed grouped alerts, leases, reads, cooldown and no repeated reminder", async (t) => {
  const { db, product } = await fixture(t);
  const c = await open(db, product);
  const first = await send(db, c.id);
  await send(db, c.id);
  assert.equal(
    (await db.query("select * from lease_message_notifications(5)")).rows
      .length,
    0,
  );
  await db.exec("update messages set created_at=now()-interval '6 minutes'");
  let jobs = (await db.query("select * from lease_message_notifications(5)"))
    .rows;
  assert.equal(jobs.length, 1);
  assert.equal(
    (await db.query("select * from lease_message_notifications(5)")).rows
      .length,
    0,
  );
  const job = jobs[0];
  assert.ok(
    (
      await db.query("select prepare_message_notification($1,$2) as p", [
        job.id,
        job.locked_until,
      ])
    ).rows[0].p.email,
  );
  await db.query("select finish_message_notification($1,$2,'mail-id')", [
    job.id,
    job.locked_until,
  ]);
  assert.equal(
    (await db.query("select * from lease_message_notifications(5)")).rows
      .length,
    0,
  );
  const newer = await send(db, c.id);
  await db.exec("update messages set created_at=now()-interval '6 minutes'");
  assert.equal(
    (await db.query("select * from lease_message_notifications(5)")).rows
      .length,
    0,
  );
  await db.exec(
    "update conversation_participants set last_notification_at=now()-interval '16 minutes'",
  );
  jobs = (await db.query("select * from lease_message_notifications(5)")).rows;
  assert.equal(jobs.length, 1);
  await db.query("select update_sellow_participant($1,$2,null,null,null,$3)", [
    c.id,
    ids.seller,
    [newer.id],
  ]);
  assert.equal(
    (
      await db.query("select prepare_message_notification($1,$2) as p", [
        jobs[0].id,
        jobs[0].locked_until,
      ])
    ).rows[0].p,
    null,
  );
  assert.equal(
    (
      await db.query("select list_sellow_conversations($1) as items", [
        ids.seller,
      ])
    ).rows[0].items[0].unread,
    2,
  );
  await db.query("select update_sellow_participant($1,$2,$3)", [
    c.id,
    ids.seller,
    first.seq,
  ]);
});
test("SQL messaging: claimed guest orders and unpublished products preserve scoped history", async (t) => {
  const { db, product } = await fixture(t);
  const c = await open(db, product);
  const session = crypto.randomUUID();
  await db.query(
    "insert into guest_checkout_sessions(id,token_hash,expires_at) values($1,$2,now()+interval '7 days')",
    [session, "a".repeat(64)],
  );
  const o = (
    await db.query(
      "select * from prepare_saspay_order('checkout-reference-123','access-token-valid-123456789',null,'buyer@test.com','cours',null,null,1.1,current_date,2,$1)",
      [session],
    )
  ).rows[0];
  await db.query(
    "select finalize_saspay_event('event','transaction.succeeded','tx','reference',$1,'SUCCESS',1200,'EUR',50,1150,'DEDUCTED','{}')",
    [o.id],
  );
  assert.deepEqual(
    (
      await db.query("select list_sellow_conversations($1) as items", [
        ids.seller,
      ])
    ).rows[0].items[0].orders,
    [],
  );
  await db.query("select claim_guest_orders($1,'buyer@test.com')", [ids.buyer]);
  await db.query("update products set published=false where id=$1", [product]);
  const list = (
    await db.query("select list_sellow_conversations($1) as items", [
      ids.seller,
    ])
  ).rows[0].items;
  assert.equal(list[0].orders.length, 1);
  assert.equal(
    (
      await db.query(
        "select * from open_sellow_conversation($1,$2,'Client',null,$3)",
        [ids.buyer, ids.seller, o.id],
      )
    ).rows[0].id,
    c.id,
  );
  await db.query("update orders set status='refunded' where id=$1", [o.id]);
  assert.equal(
    (
      await db.query("select list_sellow_conversations($1) as items", [
        ids.seller,
      ])
    ).rows[0].items[0].orders[0].status,
    "refunded",
  );
  await assert.rejects(
    () =>
      db.query("select open_sellow_conversation($1,$2,'Other',null,$3)", [
        ids.other,
        ids.seller,
        o.id,
      ]),
    /messaging_source/,
  );
});
