import type { ProductContent } from "@/lib/types";

const databaseName = "gumroad-fr-private-content-v1";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("content");
      request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Le stockage du contenu est indisponible."));
  });
}

export async function readLocalContent(productId: string) {
  const database = await openDatabase();
  return new Promise<ProductContent | null>((resolve, reject) => {
    const request = database.transaction("content", "readonly").objectStore("content").get(productId);
    request.onsuccess = () => resolve((request.result as ProductContent | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function writeLocalContent(productId: string, content: ProductContent, files: Record<string, File>) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["content", "files"], "readwrite");
    transaction.objectStore("content").put(content, productId);
    for (const [resourceId, file] of Object.entries(files)) transaction.objectStore("files").put(file, resourceId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readLocalFile(resourceId: string) {
  const database = await openDatabase();
  return new Promise<File | Blob | null>((resolve, reject) => {
    const request = database.transaction("files", "readonly").objectStore("files").get(resourceId);
    request.onsuccess = () => resolve((request.result as File | Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}
