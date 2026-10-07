"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { readLocalFile } from "@/lib/content-storage";
import type { Order, Product, ProductFile } from "@/lib/types";

export function LibraryDownloads({ order, product }: { order: Order; product?: Product }) {
  const { loadProductFiles, user } = useMarketplace();
  const [files, setFiles] = useState<ProductFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Clear the manifest when the account or the purchase changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiles(null); setError(null);
    void loadProductFiles(product ?? { id: order.productId, isRemote: order.isRemote }).then((next) => { if (!cancelled) setFiles(next); }).catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Les fichiers ne sont pas disponibles."); });
    return () => { cancelled = true; };
  }, [loadProductFiles, order.productId, order.isRemote, product, user?.id]);

  async function download(file?: ProductFile) {
    setError(null);
    if (order.isRemote) {
      const anchor = document.createElement("a");
      anchor.href = `/api/files/${encodeURIComponent(order.id)}${file ? `?fileId=${encodeURIComponent(file.id)}` : ""}`;
      anchor.click();
      return;
    }
    try {
      const stored = file ? await readLocalFile(file.id) : null;
      if (!stored && file?.size !== undefined) throw new Error("Ce fichier local n’est plus disponible sur cet appareil.");
      const blob = stored ?? new Blob([`Sellow · fichier de démonstration\nProduit : ${order.productTitle}\nAucun paiement réel n’a été effectué.`], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = file?.fileName ?? product?.fileName ?? `${order.productSlug}-demonstration.txt`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : "Le téléchargement n’a pas pu démarrer."); }
  }

  return <div className="library-downloads">
    {error && <p className="form-error" role="alert">{error}</p>}
    {files === null && !error && <p role="status" className="field-help">Chargement des fichiers…</p>}
    {files?.map((file) => <div className="library-download-file" key={file.id}><span>{file.name}</span><button className="button button-dark button-small" type="button" aria-label={`Télécharger ${file.name}`} onClick={() => void download(file)}><ArrowDown size={15} /> Télécharger</button></div>)}
    {files?.length === 0 && !order.isRemote && <button className="button button-dark button-small" type="button" onClick={() => void download()}><ArrowDown size={15} /> Télécharger</button>}
    {files?.length === 0 && order.isRemote && <p className="field-help">Le créateur n’a pas encore ajouté de fichier.</p>}
  </div>;
}
