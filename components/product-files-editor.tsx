"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, Trash, UploadSimple } from "@phosphor-icons/react";
import type { ProductFile } from "@/lib/types";

export function ProductFilesEditor({ value, uploads, onChange, onUploadsChange }: {
  value: ProductFile[];
  uploads: Record<string, File>;
  onChange: (files: ProductFile[]) => void;
  onUploadsChange: (files: Record<string, File>) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  function reorder(index: number, offset: number) {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next.map((file, position) => ({ ...file, position })));
  }
  return <div className="field-group product-files-editor">
    <label htmlFor="product-file">Fichiers à remettre</label>
    <label className="file-drop" htmlFor="product-file">
      <input id="product-file" type="file" multiple onChange={(event) => {
        const selected = [...(event.currentTarget.files ?? [])];
        event.currentTarget.value = "";
        setError(null);
        if (selected.some((file) => file.name.length > 255)) { setError("Un nom de fichier dépasse 255 caractères. Renommez-le avant de l’ajouter."); return; }
        const nextUploads = { ...uploads };
        const additions = selected.map((file, index) => {
          const id = crypto.randomUUID();
          nextUploads[id] = file;
          return { id, name: file.name, fileName: file.name, size: file.size, mimeType: file.type, position: value.length + index };
        });
        onChange([...value, ...additions]); onUploadsChange(nextUploads);
      }} />
      <UploadSimple size={22} /><strong>Ajouter des fichiers</strong>
      <span>Sélection multiple. Fichiers privés, remis après l’achat.</span>
    </label>
    <p className="field-help">Ajoutez autant de fichiers que nécessaire, dans les limites de taille et de quota de votre stockage. Deux fichiers peuvent porter le même nom.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <ol className="product-files-list">{value.map((file, index) => <li key={file.id} className="product-file-row">
      <div className="field-group"><label htmlFor={`file-name-${file.id}`}>Nom affiché du fichier {index + 1}</label>
        <input className="field-input" id={`file-name-${file.id}`} required maxLength={255} value={file.name} onChange={(event) => onChange(value.map((item) => item.id === file.id ? { ...item, name: event.target.value } : item))} />
        <span className="field-help">{file.fileName}{file.size !== undefined ? ` · ${(file.size / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mo` : ""}</span>
      </div>
      <div className="product-file-actions">
        <button className="button button-light button-small" type="button" aria-label={`Monter le fichier ${index + 1}`} disabled={index === 0} onClick={() => reorder(index, -1)}><ArrowUp size={16} /></button>
        <button className="button button-light button-small" type="button" aria-label={`Descendre le fichier ${index + 1}`} disabled={index === value.length - 1} onClick={() => reorder(index, 1)}><ArrowDown size={16} /></button>
        <button className="button button-light button-small" type="button" aria-label={`Retirer le fichier ${index + 1}`} onClick={() => {
          onChange(value.filter((item) => item.id !== file.id).map((item, position) => ({ ...item, position })));
          const next = { ...uploads }; delete next[file.id]; onUploadsChange(next);
        }}><Trash size={16} /></button>
      </div>
    </li>)}</ol>
    {!value.length && <p className="field-help">Aucun fichier ajouté. Vous pouvez enregistrer un brouillon et les ajouter ensuite.</p>}
  </div>;
}
