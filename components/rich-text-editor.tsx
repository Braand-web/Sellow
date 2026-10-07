"use client";

import { aidaTemplate } from "@/lib/aida-template";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Node } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import {
  FilmStrip, Highlighter, ImageSquare, LinkSimple, ListBullets, ListNumbers, MagicWand,
  Quotes, TextAUnderline, TextAlignLeft, TextB, TextItalic, TextStrikethrough, TextUnderline,
  TextT, X,
} from "@phosphor-icons/react";
import { readLocalFile } from "@/lib/content-storage";
import { safeHttpsUrl, safeLinkUrl, safeVideoUrl, transformRichTextImages, type RichTextDocument } from "@/lib/rich-text";
import { videoEmbed } from "@/lib/product-content";
import { VideoPlayer } from "@/components/video-player";

type InsertMode = "link" | "video" | "image";
type Props = {
  id: string;
  label: string;
  value?: RichTextDocument;
  onChange: (document: RichTextDocument) => void;
  placeholder?: string;
  required?: boolean;
  productId?: string;
  privateContent?: boolean;
  localContent?: boolean;
  files?: Record<string, File>;
  onFilesChange?: (files: Record<string, File>) => void;
};

const colorChoices = [
  { name: "Noir", value: "#22211f" },
  { name: "Gris", value: "#716d65" },
  { name: "Ocre", value: "#a2811d" },
  { name: "Rouge", value: "#b8464f" },
  { name: "Bleu", value: "#28628f" },
  { name: "Vert", value: "#557347" },
];

const ImageNode = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      resourceId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-resource-id"),
        renderHTML: (attributes) => attributes.resourceId ? { "data-resource-id": attributes.resourceId } : {},
      },
      storagePath: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },
});

const VideoEmbedNode = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return { url: { default: null }, title: { default: "Vidéo intégrée" } };
  },
  parseHTML() {
    return [{ tag: "div[data-sellow-video]", getAttrs: (element) => ({ url: (element as HTMLElement).dataset.url }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-sellow-video": "", "data-url": HTMLAttributes.url }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedView);
  },
});

function VideoEmbedView({ node }: NodeViewProps) {
  const url = String(node.attrs.url ?? "");
  return <NodeViewWrapper className="rich-video-node" contentEditable={false}>{videoEmbed(url) ? <VideoPlayer url={url} title={String(node.attrs.title ?? "Vidéo intégrée")} /> : <p className="field-error">Lien vidéo invalide.</p>}</NodeViewWrapper>;
}

export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  placeholder = "Écrivez votre texte…",
  required,
  productId,
  privateContent = false,
  localContent = false,
  files = {},
  onFilesChange,
}: Props) {
  const generatedId = useId().replace(/:/g, "");
  const inputId = id || `rich-text-${generatedId}`;
  const [insertMode, setInsertMode] = useState<InsertMode | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [insertValue, setInsertValue] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const filesRef = useRef(files);
  const localObjectUrls = useRef(new Set<string>());
  const ownedFileIds = useRef(new Set<string>());
  const appliedDocument = useRef("");
  const lastEmittedDocument = useRef("");

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => localObjectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const extensions = useMemo(() => [
    StarterKit.configure({ heading: { levels: [2, 3] }, link: false, underline: false }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    ImageNode.configure({ inline: false, allowBase64: false }),
    VideoEmbedNode,
  ], []);

  const editor = useEditor({
    extensions,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: inputId,
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-required": required ? "true" : "false",
        "data-placeholder": placeholder,
        class: "rich-text-surface",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      const document = storedEditorDocument(activeEditor.getJSON());
      const serialized = JSON.stringify(document);
      appliedDocument.current = serialized;
      lastEmittedDocument.current = serialized;
      clearUnusedImageFiles(document);
      onChange(document);
    },
  });

  useEffect(() => {
    if (!editor) return;
    let active = true;
    const input = value ?? { type: "doc", content: [{ type: "paragraph" }] };
    const serialized = JSON.stringify(input);
    if (serialized === appliedDocument.current || serialized === lastEmittedDocument.current) return;
    void prepareEditorDocument(input, { productId, privateContent, localContent, urls: localObjectUrls.current }).then((prepared) => {
      if (!active) return;
      editor.commands.setContent(prepared, { emitUpdate: false });
      appliedDocument.current = serialized;
    });
    return () => { active = false; };
  }, [editor, value, productId, privateContent, localContent]);

  function openInsert(mode: InsertMode) {
    setDialogError(null);
    setInsertValue("");
    setImageAlt("");
    setSelectedImage(null);
    setInsertMode(mode);
  }

  function submitInsert() {
    if (!editor || !insertMode) return;
    setDialogError(null);
    if (insertMode === "link") {
      const href = safeLinkUrl(insertValue.trim());
      if (!href) return setDialogError("Saisissez un lien HTTP, HTTPS ou une adresse e-mail valide.");
      const chain = editor.chain().focus();
      if (editor.state.selection.empty) chain.insertContent({ type: "text", text: insertValue.trim(), marks: [{ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer" } }] }).run();
      else chain.extendMarkRange("link").setLink({ href, target: "_blank", rel: "noopener noreferrer" }).run();
    } else if (insertMode === "video") {
      const url = safeVideoUrl(insertValue.trim());
      if (!url || !videoEmbed(url)) return setDialogError("Collez un lien YouTube ou Vimeo valide.");
      editor.chain().focus().insertContent({ type: "videoEmbed", attrs: { url, title: "Vidéo intégrée" } }).run();
    } else if (selectedImage) {
      if (!(["image/jpeg", "image/png", "image/webp"].includes(selectedImage.type))) {
        return setDialogError("Choisissez une image JPG, PNG ou WebP.");
      }
      if (selectedImage.size > 8 * 1024 * 1024) return setDialogError("L’image doit faire moins de 8 Mo.");
      const resourceId = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(selectedImage);
      localObjectUrls.current.add(objectUrl);
      editor.chain().focus().insertContent({ type: "image", attrs: { src: objectUrl, alt: imageAlt.trim(), resourceId } }).run();
      ownedFileIds.current.add(resourceId);
      onFilesChange?.({ ...filesRef.current, [resourceId]: selectedImage });
    } else {
      const src = safeHttpsUrl(insertValue.trim());
      if (!src) return setDialogError("Saisissez une adresse HTTPS d’image valide.");
      editor.chain().focus().setImage({ src, alt: imageAlt.trim() }).run();
    }
    setInsertMode(null);
  }

  function clearUnusedImageFiles(document: RichTextDocument) {
    if (!onFilesChange) return;
    const used = new Set<string>();
    visitImages(document, (attributes) => {
      if (typeof attributes.resourceId === "string") used.add(attributes.resourceId);
    });
    const next = { ...filesRef.current };
    let changed = false;
    for (const id of ownedFileIds.current) {
      if (!used.has(id)) { delete next[id]; ownedFileIds.current.delete(id); changed = true; }
    }
    if (changed) onFilesChange(next);
  }

  if (!editor) return <div className="rich-text-loading" role="status">Chargement de l’éditeur…</div>;

  return (
    <div className="rich-text-field">
      <div className="rich-text-heading"><label className="rich-text-label" htmlFor={inputId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
        <button className="button button-light button-small" type="button" title="Insérer un modèle éditable à la position du curseur" onClick={() => editor.chain().focus().insertContent(aidaTemplate().content ?? []).run()}>Modèle AIDA</button>
        <button className="button button-light button-small rich-assistant-trigger" type="button" aria-expanded={assistantOpen} onClick={() => { setAssistantOpen((open) => !open); setInsertMode(null); }}><MagicWand size={15} /> Assistant IA</button>
      </div>
      <div className="rich-text-editor">
        <div className="rich-text-toolbar" role="toolbar" aria-label={`Mise en forme : ${label}`}>
          <select aria-label="Style du texte" value={editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "paragraph"} onChange={(event) => {
            const chain = editor.chain().focus();
            if (event.target.value === "h2") chain.setHeading({ level: 2 }).run();
            else if (event.target.value === "h3") chain.setHeading({ level: 3 }).run();
            else chain.setParagraph().run();
          }}>
            <option value="paragraph">Normal</option><option value="h2">Titre</option><option value="h3">Sous-titre</option>
          </select>
          <span className="rich-toolbar-divider" aria-hidden="true" />
          <ToolbarButton label="Gras" pressed={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><TextB size={18} weight="bold" /></ToolbarButton>
          <ToolbarButton label="Italique" pressed={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><TextItalic size={18} /></ToolbarButton>
          <ToolbarButton label="Souligné" pressed={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><TextUnderline size={18} /></ToolbarButton>
          <ToolbarButton label="Barré" pressed={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><TextStrikethrough size={18} /></ToolbarButton>
          <ToolbarButton label="Citation" pressed={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quotes size={18} /></ToolbarButton>
          <span className="rich-toolbar-divider" aria-hidden="true" />
          <label className="rich-color-control" title="Couleur du texte"><TextAUnderline size={18} /><select aria-label="Couleur du texte" value="" onChange={(event) => { if (event.target.value) editor.chain().focus().setColor(event.target.value).run(); }}><option value="">Couleur</option>{colorChoices.map((choice) => <option value={choice.value} key={choice.value}>{choice.name}</option>)}</select></label>
          <label className="rich-color-control" title="Surlignage"><Highlighter size={18} /><select aria-label="Couleur de surlignage" value="" onChange={(event) => { if (event.target.value) editor.chain().focus().toggleHighlight({ color: event.target.value }).run(); }}><option value="">Surligner</option>{colorChoices.slice(1).map((choice) => <option value={choice.value} key={choice.value}>{choice.name}</option>)}</select></label>
          <span className="rich-toolbar-divider" aria-hidden="true" />
          <label className="rich-color-control rich-align-control" title="Alignement"><TextAlignLeft size={18} /><select aria-label="Alignement" value={editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph").textAlign ?? "left"} onChange={(event) => editor.chain().focus().setTextAlign(event.target.value).run()}><option value="left">À gauche</option><option value="center">Centrer</option><option value="right">À droite</option><option value="justify">Justifier</option></select></label>
          <ToolbarButton label="Liste numérotée" pressed={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListNumbers size={18} /></ToolbarButton>
          <ToolbarButton label="Liste à puces" pressed={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><ListBullets size={18} /></ToolbarButton>
          <span className="rich-toolbar-divider" aria-hidden="true" />
          <ToolbarButton label="Insérer un lien" onClick={() => openInsert("link")}><LinkSimple size={18} /></ToolbarButton>
          <ToolbarButton label="Insérer une vidéo" onClick={() => openInsert("video")}><FilmStrip size={18} /></ToolbarButton>
          <ToolbarButton label="Insérer une image" onClick={() => openInsert("image")}><ImageSquare size={18} /></ToolbarButton>
          <button className="rich-clear-format" type="button" aria-label="Effacer le formatage" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}><TextT size={17} /></button>
        </div>
        <EditorContent editor={editor} />
      </div>
      <span className="sr-only" id={`${inputId}-help`}>Utilisez les boutons de mise en forme ou les raccourcis clavier usuels.</span>
      {insertMode && <div className="rich-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInsertMode(null); }}>
        <div className="rich-insert-dialog" role="dialog" aria-modal="true" aria-labelledby={`${inputId}-insert-title`} onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            submitInsert();
          }
        }}>
          <div className="rich-dialog-heading"><h3 id={`${inputId}-insert-title`}>{insertMode === "link" ? "Ajouter un lien" : insertMode === "video" ? "Ajouter une vidéo" : "Ajouter une image"}</h3><button className="icon-button" type="button" aria-label="Fermer" onClick={() => setInsertMode(null)}><X size={18} /></button></div>
          {insertMode !== "image" && <div className="field-group"><label htmlFor={`${inputId}-insert-url`}>{insertMode === "video" ? "Lien YouTube ou Vimeo" : "Adresse du lien"}</label><input autoFocus id={`${inputId}-insert-url`} className="field-input" type="text" inputMode="url" value={insertValue} onChange={(event) => setInsertValue(event.target.value)} placeholder={insertMode === "video" ? "https://youtu.be/…" : "https://…"} required /></div>}
          {insertMode === "image" && <><div className="field-group"><label htmlFor={`${inputId}-image-file`}>Téléverser une image</label><input id={`${inputId}-image-file`} className="rich-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setSelectedImage(event.target.files?.[0] ?? null)} /><span className="field-help">JPG, PNG ou WebP, 8 Mo maximum.</span></div><div className="field-group"><label htmlFor={`${inputId}-insert-url`}>Ou coller une adresse HTTPS</label><input id={`${inputId}-insert-url`} className="field-input" type="url" value={insertValue} onChange={(event) => setInsertValue(event.target.value)} placeholder="https://…" /></div><div className="field-group"><label htmlFor={`${inputId}-image-alt`}>Description de l’image</label><input id={`${inputId}-image-alt`} className="field-input" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Décrivez l’image" /></div></>}
          {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
          <div className="rich-dialog-actions"><button className="button button-light" type="button" onClick={() => setInsertMode(null)}>Annuler</button><button className="button button-dark" type="button" onClick={submitInsert}>Insérer</button></div>
        </div>
      </div>}
      {assistantOpen && <section className="rich-assistant-panel" aria-label="Assistant IA">
        <div className="rich-assistant-panel-heading"><div><MagicWand size={17} /><strong>Assistant IA</strong></div><button className="icon-button" type="button" aria-label="Fermer l’assistant IA" onClick={() => setAssistantOpen(false)}><X size={17} /></button></div>
        <div className="rich-assistant-actions"><button className="button button-light button-small" type="button" disabled>Rédiger</button><button className="button button-light button-small" type="button" disabled>Améliorer</button></div>
        <p>Un fournisseur d’IA devra être configuré pour activer la rédaction et l’amélioration de ce texte.</p>
      </section>}
    </div>
  );
}

function ToolbarButton({ label, pressed = false, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="rich-toolbar-button" type="button" aria-label={label} aria-pressed={pressed} title={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{children}</button>;
}

function storedEditorDocument(value: RichTextDocument): RichTextDocument {
  return transformRichTextImages(value, (attrs) => {
    if (typeof attrs.resourceId === "string") attrs.src = `resource:${attrs.resourceId}`;
    return attrs;
  });
}

async function prepareEditorDocument(
  document: RichTextDocument,
  options: { productId?: string; privateContent: boolean; localContent: boolean; urls: Set<string> },
) {
  const images = await Promise.all((document.content ?? []).map((node) => prepareNode(node, options)));
  return { ...document, content: images };
}

async function prepareNode(node: RichTextDocument, options: { productId?: string; privateContent: boolean; localContent: boolean; urls: Set<string> }): Promise<RichTextDocument> {
  let next = node;
  if (node.type === "image" && typeof node.attrs?.resourceId === "string") {
    const attrs = { ...node.attrs };
    if (options.privateContent && options.productId && !options.localContent) {
      attrs.src = `/api/resources/${encodeURIComponent(options.productId)}/${encodeURIComponent(String(attrs.resourceId))}`;
    } else if (options.localContent) {
      try {
        const file = await readLocalFile(String(attrs.resourceId));
        if (file) {
          const url = URL.createObjectURL(file);
          options.urls.add(url);
          attrs.src = url;
        }
      } catch { /* The creator can still remove a missing image from the document. */ }
    }
    next = { ...node, attrs };
  }
  if (node.content) next = { ...next, content: await Promise.all(node.content.map((child) => prepareNode(child, options))) };
  return next;
}

function visitImages(document: RichTextDocument, callback: (attrs: Record<string, unknown>) => void) {
  const visit = (node: RichTextDocument) => {
    if (node.type === "image" && node.attrs) callback(node.attrs as Record<string, unknown>);
    node.content?.forEach(visit);
  };
  visit(document);
}
