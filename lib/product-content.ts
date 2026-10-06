import type { CourseLesson, Product, ProductContent } from "@/lib/types";

export const emptyProductContent = (): ProductContent => ({ modules: [], membershipPosts: [], membershipCourseIds: [] });

export function normalizeProductContent(value: unknown): ProductContent {
  const content = (value && typeof value === "object" ? value : {}) as Partial<ProductContent>;
  const modules = Array.isArray(content.modules) ? content.modules : [];
  const posts = Array.isArray(content.membershipPosts) ? content.membershipPosts : [];
  return {
    modules: modules.map((module) => ({
      id: String(module.id || crypto.randomUUID()),
      title: String(module.title || "Nouveau module"),
      lessons: Array.isArray(module.lessons) ? module.lessons.map(normalizeLesson) : [],
    })),
    membershipPosts: posts.map((post) => ({
      ...post,
      id: String(post.id || crypto.randomUUID()),
      title: String(post.title || "Publication"),
      body: String(post.body || ""),
      createdAt: String(post.createdAt || new Date().toISOString()),
      status: post.status === "published" ? "published" : "draft",
      resources: Array.isArray(post.resources) ? post.resources : [],
    })),
    membershipCourseIds: Array.isArray(content.membershipCourseIds) ? content.membershipCourseIds.map(String) : [],
  };
}

function normalizeLesson(lesson: CourseLesson): CourseLesson {
  return {
    id: String(lesson.id || crypto.randomUUID()),
    title: String(lesson.title || "Leçon"),
    description: String(lesson.description || ""),
    durationMinutes: Number(lesson.durationMinutes) || undefined,
    videoUrl: lesson.videoUrl || undefined,
    resources: Array.isArray(lesson.resources) ? lesson.resources : [],
    isPreview: Boolean(lesson.isPreview),
  };
}

export function contentFromLegacy(product: Product): ProductContent {
  const legacyLessons = product.details?.courseLessons ?? [];
  const legacyPosts = product.details?.membershipPosts ?? [];
  return normalizeProductContent({
    modules: legacyLessons.length ? [{ id: `legacy-${product.id}`, title: "Contenu du cours", lessons: legacyLessons }] : [],
    membershipPosts: legacyPosts.map((post) => ({ ...post, status: "published" })),
    membershipCourseIds: [],
  });
}

export function publicProduct(product: Product): Product {
  if (!product.details) return product;
  const details = { ...product.details };
  delete details.courseLessons;
  delete details.membershipPosts;
  return { ...product, details };
}

export function hasPublishableContent(content: ProductContent, kind: Product["kind"]) {
  if (kind === "course") return content.modules.some((module) => module.title.trim() && module.lessons.some((lesson) => lesson.title.trim() && (lesson.description.trim() || lesson.videoUrl || lesson.resources?.length)));
  if (kind === "membership") return content.membershipPosts.some((post) => post.status === "published" && post.title.trim() && (post.body.trim() || post.videoUrl || post.resources?.length)) || content.membershipCourseIds.length > 0;
  return true;
}

export function videoEmbed(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
      }
      const match = parsed.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/);
      return match ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(match[1])}` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const path = parsed.pathname.replace(/^\/+/, "");
      const id = path.match(/(?:video\/)?(\d+)/)?.[1];
      if (!id) return null;
      const embed = new URL(`https://player.vimeo.com/video/${id}`);
      const hash = parsed.searchParams.get("h") ?? path.match(/^\d+\/([A-Za-z0-9]+)/)?.[1];
      if (hash) embed.searchParams.set("h", hash);
      return embed.toString();
    }
  } catch {
    return null;
  }
  return null;
}
