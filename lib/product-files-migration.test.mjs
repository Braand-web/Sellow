import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const creator = "00000000-0000-4000-8000-000000000001";
const buyer = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const product = "00000000-0000-4000-8000-000000000004";
const order = "00000000-0000-4000-8000-000000000005";
test("migration preserves legacy downloads and enforces file RLS and atomic replacement", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      create table public.products (id uuid primary key, creator_id uuid, product_kind text, amount integer, file_name text, file_path text);
      create table public.orders (id uuid primary key, buyer_id uuid, status text);
      create table public.entitlements (id uuid primary key default gen_random_uuid(), product_id uuid, order_id uuid, buyer_id uuid, active boolean, ends_at timestamptz);
      create table storage.objects (bucket_id text, name text);
      grant select on public.products, public.orders, public.entitlements to authenticated;
      grant all on public.products, public.orders, public.entitlements, storage.objects to service_role;
      insert into products values ('${product}', '${creator}', 'download', 500000, 'guide.pdf', '${creator}/${product}/guide.pdf');
      insert into orders values ('${order}', '${buyer}', 'paid');
      insert into entitlements(product_id, order_id, buyer_id, active) values ('${product}', '${order}', '${buyer}', true);
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261007072243_product_files_and_sale_options.sql", import.meta.url), "utf8"));
    const legacy = (await db.query("select * from public.product_files")).rows[0];
    assert.equal(legacy.storage_path, `${creator}/${product}/guide.pdf`);
    await assert.rejects(db.exec(`update products set compare_at_amount = 500000`));
    await db.exec(`update products set compare_at_amount = 2500000`);
    for (const [user, count] of [[creator,1],[buyer,1],[other,0]]) {
      await db.exec(`set role authenticated; select set_config('test.user', '${user}', false);`);
      assert.equal((await db.query("select * from product_files")).rows.length, count);
      await assert.rejects(db.exec(`select replace_product_files('${product}', '${creator}', '[]')`));
      await db.exec("reset role");
    }
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from product_files"));
    await db.exec("reset role");
    const id = "00000000-0000-4000-8000-000000000006";
    const path = `${creator}/${product}/files/${id}/guide.pdf`;
    await db.exec(`insert into storage.objects values ('product-files', '${path}'); set role service_role;`);
    const files = [{ id:legacy.id, name:"Le guide", file_name:"guide.pdf", storage_path:legacy.storage_path, position:1 }, { id, name:"Bonus", file_name:"guide.pdf", storage_path:path, position:0 }];
    await db.query("select public.replace_product_files($1, $2, $3::jsonb)", [product,creator,JSON.stringify(files)]);
    assert.deepEqual((await db.query("select name from product_files order by position")).rows.map((row) => row.name), ["Bonus","Le guide"]);
    await assert.rejects(db.query("select public.replace_product_files($1, $2, $3::jsonb)", [product,other,"[]"]));
    await assert.rejects(db.query("select public.replace_product_files($1, $2, $3::jsonb)", [product,creator,JSON.stringify([{...files[1],storage_path:"other/private.pdf"}])]));
    assert.equal((await db.query("select count(*)::int as count from product_files")).rows[0].count,2);
    await db.query("select public.replace_product_files($1, $2, $3::jsonb)", [product,creator,JSON.stringify([files[0]])]);
    assert.equal((await db.query("select file_path from products")).rows[0].file_path,legacy.storage_path);
    await db.exec("reset role; update entitlements set active=false; set role authenticated;");
    await db.exec(`select set_config('test.user', '${buyer}', false)`);
    assert.equal((await db.query("select * from product_files")).rows.length,0);
  } finally { await db.close(); }
});
