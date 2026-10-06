import type { JSONContent } from "@tiptap/core";

export type RichTextDocument = JSONContent;
export type RichTextImageReference = { resourceId: string; storagePath?: string; preview?: boolean };

const nodeTypes = new Set([
  "doc", "paragraph", "heading", "blockquote", "bulletList", "orderedList", "listItem",
  "horizontalRule", "hardBreak", "text", "image", "videoEmbed",
]);
const markTypes = new Set(["bold", "italic", "underline", "strike", "link", "textStyle", "highlight"]);
const colorPattern = /^#[0-9a-f]{6}$/i;
const imageResourcePattern = /^[\w-]{8,80}$/;

export function documentFromPlainText(value: string): RichTextDocument {
  const paragraphs = value.replace(/\r\n?/g, "\n").split("\n").map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}

export function normalizeRichTextDocument(value: unknown): RichTextDocument | undefined {
  if (!value || typeof value !== "object") return undefined;
  const normalized = normalizeNode(value as Record<string, unknown>);
  if (!normalized || normalized.type !== "doc") return undefined;
  return normalized;
}

function normalizeNode(value: Record<string, unknown>): JSONContent | undefined {
  const type = typeof value.type === "string" ? value.type : "";
  if (!nodeTypes.has(type)) return undefined;
  const result: JSONContent = { type };
  if (type === "text") {
    if (typeof value.text !== "string") return undefined;
    result.text = value.text.slice(0, 100_000);
    result.marks = normalizeMarks(value.marks);
    if (!result.marks?.length) delete result.marks;
    return result;
  }
  if (type === "heading") {
    const attrs = value.attrs as Record<string, unknown> | undefined;
    result.attrs = { level: attrs?.level === 3 ? 3 : 2 };
  } else if (type === "orderedList") {
    const attrs = value.attrs as Record<string, unknown> | undefined;
    result.attrs = { start: Number.isInteger(attrs?.start) && Number(attrs?.start) > 0 ? Number(attrs?.start) : 1 };
  } else if (type === "image") {
    const attrs = value.attrs as Record<string, unknown> | undefined;
    const resourceId = typeof attrs?.resourceId === "string" && imageResourcePattern.test(attrs.resourceId) ? attrs.resourceId : undefined;
    const source = typeof attrs?.src === "string" ? attrs.src : "";
    const safeUrl = safeHttpsUrl(source);
    if (!resourceId && !safeUrl) return undefined;
    result.attrs = {
      src: resourceId ? `resource:${resourceId}` : safeUrl,
      resourceId,
      alt: typeof attrs?.alt === "string" ? attrs.alt.slice(0, 300) : "",
      title: typeof attrs?.title === "string" ? attrs.title.slice(0, 150) : null,
      ...(typeof attrs?.storagePath === "string" && attrs.storagePath.length < 500 ? { storagePath: attrs.storagePath } : {}),
    };
  } else if (type === "videoEmbed") {
    const attrs = value.attrs as Record<string, unknown> | undefined;
    const url = typeof attrs?.url === "string" ? safeVideoUrl(attrs.url) : undefined;
    if (!url) return undefined;
    result.attrs = { url };
  }
  if (Array.isArray(value.content)) {
    result.content = value.content
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      .map(normalizeNode)
      .filter((entry): entry is JSONContent => Boolean(entry));
  }
  if (type !== "doc" && !result.content?.length && !["paragraph", "heading", "image", "videoEmbed", "hardBreak", "horizontalRule"].includes(type)) return undefined;
  return result;
}

function normalizeMarks(value: unknown): JSONContent["marks"] {
  if (!Array.isArray(value)) return undefined;
  const normalized: NonNullable<JSONContent["marks"]> = [];
  for (const mark of value) {
    if (!mark || typeof mark !== "object") continue;
    const item = mark as Record<string, unknown>;
    const type = typeof item.type === "string" ? item.type : "";
    if (!markTypes.has(type) || type === "link") {
      if (type !== "link" || !markTypes.has(type)) continue;
      const attrs = item.attrs as Record<string, unknown> | undefined;
      const href = typeof attrs?.href === "string" ? safeLinkUrl(attrs.href) : undefined;
      if (href) normalized.push({ type, attrs: { href, target: "_blank", rel: "noopener noreferrer" } });
      continue;
    }
    if (type === "textStyle") {
      const attrs = item.attrs as Record<string, unknown> | undefined;
      const color = typeof attrs?.color === "string" && colorPattern.test(attrs.color) ? attrs.color.toLowerCase() : undefined;
      if (color) normalized.push({ type, attrs: { color } });
      continue;
    }
    if (type === "highlight") {
      const attrs = item.attrs as Record<string, unknown> | undefined;
      const color = typeof attrs?.color === "string" && colorPattern.test(attrs.color) ? attrs.color.toLowerCase() : undefined;
      normalized.push({ type, ...(color ? { attrs: { color } } : {}) });
      continue;
    }
    normalized.push({ type });
  }
  return normalized;
}

export function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function safeLinkUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function safeVideoUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return ["youtu.be", "youtube.com", "m.youtube.com", "vimeo.com", "player.vimeo.com"].includes(host) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function richTextToPlainText(value: unknown) {
  const document = normalizeRichTextDocument(value);
  if (!document) return "";
  return plainFromNode(document).replace(/\n{3,}/g, "\n\n").trim();
}

function plainFromNode(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(plainFromNode).join("");
  if (["paragraph", "heading", "listItem", "blockquote", "bulletList", "orderedList"].includes(node.type ?? "")) return `${inner}\n`;
  if (node.type === "image") return String(node.attrs?.alt ?? "");
  return inner;
}

export function transformRichTextImages(document: RichTextDocument, transform: (attrs: Record<string, unknown>) => Record<string, unknown>) {
  const visit = (node: JSONContent): JSONContent => ({
    ...node,
    ...(node.type === "image" ? { attrs: transform({ ...(node.attrs ?? {}) }) } : {}),
    ...(node.content ? { content: node.content.map(visit) } : {}),
  });
  return visit(document);
}

export function collectRichTextImages(value: unknown): RichTextImageReference[] {
  const document = normalizeRichTextDocument(value);
  if (!document) return [];
  const images: RichTextImageReference[] = [];
  const visit = (node: JSONContent, preview = false) => {
    if (node.type === "image" && typeof node.attrs?.resourceId === "string") {
      images.push({ resourceId: node.attrs.resourceId, storagePath: typeof node.attrs.storagePath === "string" ? node.attrs.storagePath : undefined, preview });
    }
    node.content?.forEach((child) => visit(child, preview));
  };
  visit(document);
  return images;
}

export function collectRichTextVideoUrls(value: unknown): string[] {
  const document = normalizeRichTextDocument(value);
  if (!document) return [];
  const urls: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "videoEmbed" && typeof node.attrs?.url === "string") urls.push(node.attrs.url);
    node.content?.forEach(visit);
  };
  visit(document);
  return urls;
}

export function stripRichTextStoragePaths(value: unknown): RichTextDocument | undefined {
  const document = normalizeRichTextDocument(value);
  return document ? transformRichTextImages(document, (attrs) => { delete attrs.storagePath; return attrs; }) : undefined;
}
