"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import { readLocalFile } from "@/lib/content-storage";
import { documentFromPlainText, normalizeRichTextDocument, safeHttpsUrl, safeLinkUrl, type RichTextDocument } from "@/lib/rich-text";
import { VideoPlayer } from "@/components/video-player";

type Props = {
  value?: RichTextDocument | null;
  fallbackText?: string;
  productId?: string;
  privateContent?: boolean;
  localContent?: boolean;
  className?: string;
};

export function RichTextContent({ value, fallbackText = "", productId, privateContent = false, localContent = false, className }: Props) {
  const document = normalizeRichTextDocument(value) ?? documentFromPlainText(fallbackText);
  return <div className={className}>{(document.content ?? []).map((node, index) => <RichNode key={`${node.type}-${index}`} node={node} productId={productId} privateContent={privateContent} localContent={localContent} />)}</div>;
}

function RichNode({ node, productId, privateContent, localContent }: { node: JSONContent; productId?: string; privateContent: boolean; localContent: boolean }): ReactNode {
  if (node.type === "text") return withMarks(node.text ?? "", node.marks ?? []);
  const children = (node.content ?? []).map((child, index) => <RichNode key={`${child.type}-${index}`} node={child} productId={productId} privateContent={privateContent} localContent={localContent} />);
  switch (node.type) {
    case "doc": return <>{children}</>;
    case "paragraph": return <p>{children.length ? children : <br />}</p>;
    case "heading": return Number(node.attrs?.level) === 3 ? <h3>{children}</h3> : <h2>{children}</h2>;
    case "blockquote": return <blockquote>{children}</blockquote>;
    case "bulletList": return <ul>{children}</ul>;
    case "orderedList": return <ol start={Number(node.attrs?.start) > 1 ? Number(node.attrs?.start) : undefined}>{children}</ol>;
    case "listItem": return <li>{children}</li>;
    case "horizontalRule": return <hr />;
    case "hardBreak": return <br />;
    case "image": return <RichImage node={node} productId={productId} privateContent={privateContent} localContent={localContent} />;
    case "videoEmbed": return typeof node.attrs?.url === "string" ? <VideoPlayer url={node.attrs.url} title={String(node.attrs.title ?? "Vidéo intégrée")} /> : null;
    default: return null;
  }
}

function withMarks(text: string, marks: JSONContent["marks"]): ReactNode {
  let content: ReactNode = text;
  for (const [index, mark] of [...(marks ?? [])].entries()) {
    if (mark.type === "bold") content = <strong key={`bold-${index}`}>{content}</strong>;
    else if (mark.type === "italic") content = <em key={`italic-${index}`}>{content}</em>;
    else if (mark.type === "underline") content = <u key={`underline-${index}`}>{content}</u>;
    else if (mark.type === "strike") content = <s key={`strike-${index}`}>{content}</s>;
    else if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? safeLinkUrl(mark.attrs.href) : undefined;
      if (href) content = <a key={`link-${index}`} href={href} target="_blank" rel="noopener noreferrer">{content}</a>;
    } else if (mark.type === "textStyle") {
      const color = safeColor(mark.attrs?.color);
      if (color) content = <span key={`color-${index}`} style={{ color }}>{content}</span>;
    } else if (mark.type === "highlight") {
      const color = safeColor(mark.attrs?.color) ?? "#f5edcf";
      content = <mark key={`highlight-${index}`} style={{ backgroundColor: color }}>{content}</mark>;
    }
  }
  return content;
}

function safeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

function RichImage({ node, productId, privateContent, localContent }: { node: JSONContent; productId?: string; privateContent: boolean; localContent: boolean }) {
  const resourceId = typeof node.attrs?.resourceId === "string" ? node.attrs.resourceId : undefined;
  const initialSrc = typeof node.attrs?.src === "string" ? node.attrs.src : "";
  const [localImage, setLocalImage] = useState<{ resourceId: string; src: string }>({ resourceId: "", src: "" });

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    if (!resourceId || !localContent) return;
    void readLocalFile(resourceId).then((file) => {
      if (!active || !file) return;
      objectUrl = URL.createObjectURL(file);
      setLocalImage({ resourceId, src: objectUrl });
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [localContent, resourceId]);

  const src = !resourceId
    ? safeHttpsUrl(initialSrc) ?? ""
    : privateContent && !localContent && productId
      ? `/api/resources/${encodeURIComponent(productId)}/${encodeURIComponent(resourceId)}`
      : localContent && localImage.resourceId === resourceId ? localImage.src : "";

  if (!src) return <span className="rich-image-unavailable">Image indisponible</span>;
  return <Image className="rich-content-image" src={src} alt={String(node.attrs?.alt ?? "")} title={typeof node.attrs?.title === "string" ? node.attrs.title : undefined} width={1000} height={700} unoptimized />;
}
