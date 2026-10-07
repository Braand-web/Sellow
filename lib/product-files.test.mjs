import test from "node:test";
import assert from "node:assert/strict";
import { changeFavorite, normalizeProductFiles, productFileStoragePath, productFilesFromRows, readAllProductFileRows, validateProductPricing } from "./product-files.mjs";
const first = { id: "00000000-0000-4000-8000-000000000001", name: "Guide", fileName: "guide.pdf", size: 1200, position: 8 };
const second = { ...first, id: "00000000-0000-4000-8000-000000000002", name: "Bonus" };
test("same file names are distinct resources, with no count cap and normalized order", () => {
  const files = normalizeProductFiles([second, first]);
  assert.deepEqual(files.map((file) => file.position), [0, 1]);
  assert.notEqual(productFileStoragePath("creator", "product", files[0]), productFileStoragePath("creator", "product", files[1]));
  assert.equal(normalizeProductFiles(Array.from({ length: 250 }, (_, n) => ({ ...first, id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` }))).length, 250);
});
test("invalid files and duplicate identifiers are refused", () => {
  for (const input of [null, [{ ...first, id: "bad" }], [first, first], [{ ...first, name: " " }], [{ ...first, size: -1 }]]) assert.throws(() => normalizeProductFiles(input));
});
test("the public manifest omits private storage paths", () => {
  const files = productFilesFromRows([{ id: first.id, name: first.name, file_name: first.fileName, storage_path: "secret/path", position: 0 }]);
  assert.equal(JSON.stringify(files).includes("secret"), false);
});
test("compare price must be higher and FCFA uses integer amounts", () => {
  assert.doesNotThrow(() => validateProductPricing(5000, 25000, "XAF"));
  assert.doesNotThrow(() => validateProductPricing(5000, undefined, "XOF"));
  for (const [price, compare, currency] of [[5000,5000,"XAF"],[5000,4000,"XAF"],[5000.5,25000,"XAF"],[-1,5,"EUR"],[NaN,20,"EUR"]]) assert.throws(() => validateProductPricing(price, compare, currency));
});
test("disabled saving refuses new favorites, preserving existing favorites and removal", () => {
  const current = ["a", "b"];
  assert.deepEqual(changeFavorite(current, "c", false), current);
  assert.deepEqual(changeFavorite(current, "a", false), ["b"]);
  assert.deepEqual(changeFavorite(current, "c", true), ["a", "b", "c"]);
});

test("storage manifests are paginated without truncation at the Data API row limit", async () => {
  const records = Array.from({length:1205}, (_,id) => ({id}));
  const calls = [];
  const admin = { from() { return { select() { return this; }, eq() { return this; }, order() { return this; }, range(start,end) { calls.push(start); return Promise.resolve({data:records.slice(start, Math.min(end+1,start+100)),count:records.length,error:null}); } }; } };
  const rows = await readAllProductFileRows(admin,"product","id");
  assert.equal(rows.length,1205); assert.equal(rows.at(-1).id,1204); assert.equal(calls.length,13);
});
