import type { RichTextDocument } from "@/lib/rich-text";

export const productKinds = [
  "download",
  "course",
  "membership",
  "physical",
  "service",
] as const;

export type ProductKind = (typeof productKinds)[number];

export type CourseLesson = {
  id: string;
  title: string;
  description: string;
  descriptionContent?: RichTextDocument;
  durationMinutes?: number;
  videoUrl?: string;
  resources?: LessonResource[];
  isPreview?: boolean;
};

export type LessonResource = {
  id: string;
  name: string;
  fileName: string;
  storagePath?: string;
};

export type ProductFile = {
  id: string;
  name: string;
  fileName: string;
  size?: number;
  mimeType?: string;
  position: number;
};

export type CourseModule = {
  id: string;
  title: string;
  lessons: CourseLesson[];
};

export type MembershipPost = {
  id: string;
  title: string;
  body: string;
  bodyContent?: RichTextDocument;
  createdAt: string;
  videoUrl?: string;
  resources?: LessonResource[];
  status?: "draft" | "published";
};

export type ProductContent = {
  modules: CourseModule[];
  membershipPosts: MembershipPost[];
  membershipCourseIds: string[];
};

export type CourseProgress = {
  completedLessonIds: string[];
  lastLessonId?: string;
};

export type ProductDetails = {
  interval?: string;
  lessons?: number;
  duration?: string;
  shipping?: string;
  fulfillment?: string;
  courseLessons?: CourseLesson[];
  membershipPosts?: MembershipPost[];
  [key: string]: string | number | CourseLesson[] | MembershipPost[] | undefined;
};

export type Product = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  descriptionContent?: RichTextDocument;
  kind: ProductKind;
  category: string;
  tags: string[];
  price: number;
  compareAtPrice?: number;
  saveForLaterEnabled?: boolean;
  files?: ProductFile[];
  currency: string;
  creatorId: string;
  creatorName: string;
  creatorSlug: string;
  creatorInitials: string;
  creatorTone: string;
  cover: string;
  coverLabel: string;
  fileName?: string;
  filePath?: string;
  published: boolean;
  createdAt: string;
  featured?: boolean;
  details?: ProductDetails;
  isRemote?: boolean;
};

export type Creator = {
  id: string;
  name: string;
  slug: string;
  email: string;
  bio: string;
  initials: string;
  tone: string;
};

export type DemoUser = Creator & { isDemo: boolean };

export type Order = {
  id: string;
  buyerId?: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  productKind: ProductKind;
  creatorName: string;
  creatorSlug: string;
  buyerEmail: string;
  status: "pending" | "failed" | "paid_demo" | "paid" | "refunded" | "canceled" | "canceled_demo";
  amount: number;
  currency: string;
  createdAt: string;
  membershipExpiresAt?: string;
  membershipRenewalCancelledAt?: string;
  checkoutUrl?: string;
  shippingAddress?: string;
  buyerNote?: string;
  isRemote?: boolean;
};

export type NewProductInput = Pick<
  Product,
  "title" | "subtitle" | "description" | "kind" | "category" | "tags" | "price" | "currency" | "cover" | "coverLabel"
> & {
  file?: File | null;
  files?: ProductFile[];
  fileUploads?: Record<string, File>;
  compareAtPrice?: number;
  saveForLaterEnabled?: boolean;
  details?: ProductDetails;
  descriptionContent?: RichTextDocument;
  descriptionFiles?: Record<string, File>;
};

export type EditableProductInput = Omit<NewProductInput, "kind" | "file">;

export const kindLabels: Record<ProductKind, string> = {
  download: "Fichier numérique",
  course: "Cours",
  membership: "Abonnement",
  physical: "Objet physique",
  service: "Service",
};
