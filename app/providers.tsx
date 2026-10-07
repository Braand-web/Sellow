"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedProducts } from "@/lib/seed";
import { paymentProvider } from "@/lib/payment/provider";
import { slugify } from "@/lib/slug";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CourseProgress, DemoUser, EditableProductInput, NewProductInput, Order, Product, ProductContent, ProductFile } from "@/lib/types";
import { changeFavorite, normalizeProductFiles, productFileStoragePath, validateProductPricing } from "@/lib/product-files.mjs";
import { contentFromLegacy, emptyProductContent, hasPublishableContent, normalizeProductContent, publicProduct, videoEmbed } from "@/lib/product-content";
import { readLocalContent, writeLocalContent, writeLocalFiles } from "@/lib/content-storage";
import { collectRichTextImages, collectRichTextVideoUrls, documentFromPlainText, normalizeRichTextDocument, richTextToPlainText, stripRichTextStoragePaths, transformRichTextImages } from "@/lib/rich-text";
import type { SupabaseClient } from "@supabase/supabase-js";

type PersistedState = {
  user: DemoUser | null;
  products: Product[];
  orders: Order[];
  favorites: string[];
};

type PurchaseInput = {
  product: Product;
  buyerEmail: string;
  shippingAddress?: string;
  buyerNote?: string;
};

type MarketplaceContextValue = {
  user: DemoUser | null;
  products: Product[];
  orders: Order[];
  favorites: string[];
  ready: boolean;
  supabaseConnected: boolean;
  supabaseConfigured: boolean;
  message: string | null;
  setMessage: (message: string | null) => void;
  register: (name: string, email: string, password: string) => Promise<{ confirmationRequired?: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  addProduct: (input: NewProductInput) => Promise<Product>;
  updateProduct: (productId: string, input: EditableProductInput) => Promise<void>;
  togglePublished: (productId: string, knownProduct?: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  purchase: (input: PurchaseInput) => Promise<Order>;
  cancelSubscription: (order: Order) => Promise<void>;
  toggleFavorite: (productId: string) => void;
  loadProductContent: (product: Product) => Promise<ProductContent>;
  loadProductFiles: (product: Pick<Product, "id" | "isRemote" | "files" | "fileName">) => Promise<ProductFile[]>;
  saveProductContent: (productId: string, content: ProductContent, files?: Record<string, File>, productDraft?: Product) => Promise<void>;
  loadCourseProgress: (productId: string) => Promise<CourseProgress>;
  saveCourseProgress: (productId: string, progress: CourseProgress) => Promise<void>;
};

const storageKey = "gumroad-fr-demo-v1";
const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

function mergeProducts(remote: Product[], local: Product[]) {
  const byId = new Map<string, Product>();
  [...seedProducts, ...local, ...remote].forEach((product) => byId.set(product.id, publicProduct(product)));
  return [...byId.values()];
}

function userFromSupabase(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): DemoUser {
  const name = String(user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Créateur");
  const slug = slugify(name) || `createur-${user.id.slice(0, 6)}`;
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return {
    id: user.id,
    name,
    slug,
    email: user.email ?? "",
    bio: "Créateur indépendant sur Sellow.",
    initials: initials || "CR",
    tone: "rose",
    isDemo: false,
  };
}

function productFromRow(row: Record<string, unknown>): Product {
  const creatorName = String(row.creator_name ?? "Créateur indépendant");
  const creatorSlug = String(row.creator_slug ?? slugify(creatorName));
  const creatorInitials = creatorName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ""),
    description: String(row.description ?? ""),
    descriptionContent: stripRichTextStoragePaths(row.description_content),
    kind: String(row.product_kind ?? "download") as Product["kind"],
    category: String(row.category ?? "Autre"),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    price: Number(row.amount ?? 0) / 100,
    compareAtPrice: row.compare_at_amount == null ? undefined : Number(row.compare_at_amount) / 100,
    saveForLaterEnabled: row.save_for_later_enabled !== false,
    currency: String(row.currency ?? "EUR"),
    creatorId: String(row.creator_id),
    creatorName,
    creatorSlug,
    creatorInitials: creatorInitials || "CR",
    creatorTone: "rose",
    cover: String(row.cover ?? "identity"),
    coverLabel: String(row.cover_label ?? "CRÉATION\nINDÉPENDANTE"),
    fileName: row.file_name ? String(row.file_name) : undefined,
    published: Boolean(row.published),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    details: (row.details as Product["details"]) ?? {},
    isRemote: true,
  };
}

async function uploadPublicRichTextImages(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
  document: NonNullable<Product["descriptionContent"]>,
  files: Record<string, File>,
) {
  const uploadedPaths: string[] = [];
  const imageIds = collectRichTextImages(document).map((image) => image.resourceId);
  let result = document;
  try {
    for (const resourceId of [...new Set(imageIds)]) {
      const file = files[resourceId];
      if (!file) throw new Error("Une image du texte doit être sélectionnée de nouveau avant l’enregistrement.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
        throw new Error("Les images insérées doivent être au format JPG, PNG ou WebP et faire moins de 8 Mo.");
      }
      const path = `${userId}/${productId}/${resourceId}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("product-rich-images").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      uploadedPaths.push(path);
      const { data } = supabase.storage.from("product-rich-images").getPublicUrl(path);
      result = transformRichTextImages(result, (attrs) => {
        if (attrs.resourceId !== resourceId) return attrs;
        attrs.src = data.publicUrl;
        delete attrs.resourceId;
        delete attrs.storagePath;
        return attrs;
      });
    }
    return { document: result, uploadedPaths };
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("product-rich-images").remove(uploadedPaths);
    throw error;
  }
}

function orderFromRow(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    buyerId: row.buyer_id ? String(row.buyer_id) : undefined,
    productId: String(row.product_id),
    productSlug: String(row.product_slug ?? ""),
    productTitle: String(row.product_title),
    productKind: String(row.product_kind) as Order["productKind"],
    creatorName: String(row.creator_name ?? "Créateur indépendant"),
    creatorSlug: String(row.creator_slug ?? ""),
    buyerEmail: String(row.buyer_email ?? ""),
    status: String(row.status) as Order["status"],
    amount: Number(row.amount ?? 0) / 100,
    currency: String(row.currency ?? "EUR"),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    membershipExpiresAt: row.membership_expires_at ? String(row.membership_expires_at) : undefined,
    membershipRenewalCancelledAt: row.membership_renewal_cancelled_at ? String(row.membership_renewal_cancelled_at) : undefined,
    shippingAddress: row.shipping_address ? String(row.shipping_address) : undefined,
    buyerNote: row.buyer_note ? String(row.buyer_note) : undefined,
    isRemote: true,
  };
}

async function saveRemoteProductFiles(supabase: SupabaseClient, creatorId: string, productId: string, files: ProductFile[], uploads: Record<string, File>) {
  const uploadedPaths: string[] = [];
  let safeToRemove = true;
  try {
    for (const file of files) {
      const upload = uploads[file.id];
      if (!upload) continue;
      const path = productFileStoragePath(creatorId, productId, file);
      const { error } = await supabase.storage.from("product-files").upload(path, upload, { upsert: false });
      if (error && String((error as { statusCode?: string | number }).statusCode) === "409") continue;
      if (error) throw new Error(`Le fichier « ${file.name} » n’a pas pu être téléversé : ${error.message}`);
      uploadedPaths.push(path);
    }
    safeToRemove = false;
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}/files`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }),
    });
    const payload = await response.json();
    if (!response.ok) { safeToRemove = true; throw new Error(payload.error ?? "Les fichiers n’ont pas pu être enregistrés."); }
  } catch (error) {
    if (safeToRemove && uploadedPaths.length) await supabase.storage.from("product-files").remove(uploadedPaths);
    throw error;
  }
}

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const refreshRemoteOrders = useCallback(async (userId: string) => {
    if (!supabase) return;
    const [buyerResult, creatorResult] = await Promise.all([
      supabase.from("orders").select("*").eq("buyer_id", userId).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("creator_id", userId).order("created_at", { ascending: false }),
    ]);
    const rows = new Map<string, Record<string, unknown>>();
    [...(buyerResult.data ?? []), ...(creatorResult.data ?? [])].forEach((row) => rows.set(String(row.id), row as Record<string, unknown>));
    const remote = [...rows.values()].map(orderFromRow);
    setOrders((current) => [...remote, ...current.filter((order) => !order.isRemote)]);
  }, [supabase]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PersistedState>;
        // Browser storage is loaded after hydration so the server and first client render match.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.user?.isDemo) setUser(parsed.user);
        if (Array.isArray(parsed.products)) {
          const legacyProducts = parsed.products as Product[];
          for (const product of legacyProducts) {
            if (product.details?.courseLessons?.length || product.details?.membershipPosts?.length) {
              void writeLocalContent(product.id, contentFromLegacy(product), {});
            }
          }
          setProducts(mergeProducts([], legacyProducts));
        }
        if (Array.isArray(parsed.orders)) setOrders(parsed.orders.filter((order) => !order.isRemote && !("accessToken" in order)));
        if (Array.isArray(parsed.favorites)) setFavorites(parsed.favorites);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    seedProducts.forEach((product) => {
      if (product.details?.courseLessons?.length || product.details?.membershipPosts?.length) {
        void readLocalContent(product.id).then((content) => {
          if (!content) return writeLocalContent(product.id, contentFromLegacy(product), {});
          return undefined;
        });
      }
    });

    if (!supabase) {
      setReady(true);
      return;
    }

    let active = true;
    const loadRemote = async () => {
      const [{ data: authData }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("products").select("id, slug, title, subtitle, description, description_content, product_kind, category, tags, amount, compare_at_amount, save_for_later_enabled, currency, creator_id, creator_name, creator_slug, cover, cover_label, file_name, published, created_at").order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (authData.user) {
        setUser(userFromSupabase(authData.user));
        await refreshRemoteOrders(authData.user.id);
      } else {
        setUser((current) => current?.isDemo ? current : null);
        setOrders((current) => current.filter((order) => !order.isRemote));
      }
      if (!error && data) {
        const rows = data.map((row) => productFromRow(row as Record<string, unknown>));
        rows.forEach((product) => {
          if (product.details?.courseLessons?.length || product.details?.membershipPosts?.length) {
            void fetch(`/api/products/${encodeURIComponent(product.id)}/content`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ migrateLegacy: true }),
            });
          }
        });
        setProducts((current) => mergeProducts(rows, current));
        setSupabaseConnected(true);
      }
      setReady(true);
    };

    void loadRemote();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? userFromSupabase(session.user) : null);
      if (session?.user) window.setTimeout(() => void refreshRemoteOrders(session.user.id), 0);
      else setOrders((current) => current.filter((order) => !order.isRemote));
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [refreshRemoteOrders, supabase]);

  useEffect(() => {
    if (!ready) return;
    const state: PersistedState = {
      user: user?.isDemo ? user : null,
      products: products.map(publicProduct),
      orders: orders.filter((order) => !order.isRemote && !("accessToken" in order)),
      favorites,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [user, products, orders, favorites, ready]);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) return { error: error.message };
        if (!data.session || !data.user) return { confirmationRequired: true };
        const nextUser = userFromSupabase(data.user);
        setUser(nextUser);
        await refreshRemoteOrders(data.user.id);
        const { error: profileError } = await supabase.from("creators").upsert({
          id: data.user.id,
          name,
          slug: nextUser.slug,
          bio: "",
        });
        if (profileError) setMessage("Compte créé. Votre profil pourra être complété depuis le tableau de bord.");
        return {};
      }

      const trimmedName = name.trim();
      const nextUser: DemoUser = {
        id: `demo-${crypto.randomUUID()}`,
        name: trimmedName,
        slug: `${slugify(trimmedName) || "createur"}-${Math.random().toString(36).slice(2, 6)}`,
        email: email.trim().toLowerCase(),
        bio: "Créateur indépendant sur Sellow.",
        initials: trimmedName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        tone: "rose",
        isDemo: true,
      };
      setUser(nextUser);
      return {};
    },
    [refreshRemoteOrders, supabase],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        if (data.user) {
          setUser(userFromSupabase(data.user));
          await refreshRemoteOrders(data.user.id);
        }
        return {};
      }
      const name = email.trim().split("@")[0].replace(/[._-]/g, " ");
      const titleName = name.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Créateur";
      setUser({
        id: `demo-${slugify(email)}`,
        name: titleName,
        slug: `${slugify(titleName) || "createur"}-demo`,
        email: email.trim().toLowerCase(),
        bio: "Créateur indépendant sur Sellow.",
        initials: titleName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2),
        tone: "rose",
        isDemo: true,
      });
      return {};
    },
    [refreshRemoteOrders, supabase],
  );

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setOrders((current) => current.filter((order) => !order.isRemote));
  }, [supabase]);

  const addProduct = useCallback(
    async (input: NewProductInput) => {
      if (!user) throw new Error("Connectez-vous pour publier un produit.");
      validateProductPricing(input.price, input.compareAtPrice, input.currency);
      const id = crypto.randomUUID();
      const inputDocument = normalizeRichTextDocument(input.descriptionContent) ?? documentFromPlainText(input.description);
      if (collectRichTextVideoUrls(inputDocument).some((url) => !videoEmbed(url))) throw new Error("Utilisez un lien vidéo YouTube ou Vimeo valide.");
      let descriptionContent = inputDocument;
      const uploadedPublicPaths: string[] = [];
      const fileUploads = { ...input.fileUploads };
      const requestedFiles = [...(input.files ?? [])];
      if (input.file) { const fileId = crypto.randomUUID(); fileUploads[fileId] = input.file; requestedFiles.push({ id: fileId, name: input.file.name, fileName: input.file.name, size: input.file.size, mimeType: input.file.type, position: requestedFiles.length }); }
      const files = normalizeProductFiles(input.kind === "download" ? requestedFiles : []);
      const fileName = files[0]?.fileName;

      if (supabase && !user.isDemo) {
        const uploaded = await uploadPublicRichTextImages(supabase, user.id, id, inputDocument, input.descriptionFiles ?? {});
        descriptionContent = uploaded.document;
        uploadedPublicPaths.push(...uploaded.uploadedPaths);
      }
      const description = richTextToPlainText(descriptionContent) || input.description.trim();

      const product: Product = {
        id,
        slug: `${slugify(input.title) || "produit"}-${id.slice(0, 5)}`,
        title: input.title.trim(),
        subtitle: input.subtitle.trim(),
        description,
        descriptionContent,
        kind: input.kind,
        category: input.category,
        tags: input.tags,
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        saveForLaterEnabled: input.saveForLaterEnabled !== false,
        files: supabase && !user.isDemo ? undefined : files,
        currency: input.currency,
        creatorId: user.id,
        creatorName: user.name,
        creatorSlug: user.slug,
        creatorInitials: user.initials,
        creatorTone: user.tone,
        cover: input.cover,
        coverLabel: input.coverLabel,
        fileName,
        published: false,
        createdAt: new Date().toISOString(),
        details: input.details ?? (input.kind === "membership" ? { interval: "mois" } : {}),
        isRemote: Boolean(supabase && !user.isDemo),
      };

      if (supabase && !user.isDemo) {
        const { data: profile } = await supabase.from("creators").select("id").eq("id", user.id).maybeSingle();
        if (!profile) {
          const { error: profileError } = await supabase.from("creators").upsert({
            id: user.id,
            name: user.name,
            slug: user.slug,
            bio: user.bio,
          });
          if (profileError) throw new Error(profileError.message);
        }
        const { error } = await supabase.from("products").insert({
          id: product.id,
          creator_id: user.id,
          creator_name: user.name,
          creator_slug: user.slug,
          slug: product.slug,
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          description_content: product.descriptionContent,
          product_kind: product.kind,
          category: product.category,
          tags: product.tags,
          amount: Math.round(product.price * 100),
          compare_at_amount: product.compareAtPrice === undefined ? null : Math.round(product.compareAtPrice * 100),
          save_for_later_enabled: product.saveForLaterEnabled,
          currency: product.currency,
          cover: product.cover,
          cover_label: product.coverLabel,
          file_name: fileName,
          published: false,
          details: product.details,
        });
        if (error) {
          if (uploadedPublicPaths.length) await supabase.storage.from("product-rich-images").remove(uploadedPublicPaths);
          throw new Error(error.message);
        }
        try {
          if (product.kind === "download") await saveRemoteProductFiles(supabase, user.id, product.id, files, fileUploads);
        } catch (fileError) {
          await supabase.from("products").delete().eq("id", product.id).eq("creator_id", user.id);
          if (uploadedPublicPaths.length) await supabase.storage.from("product-rich-images").remove(uploadedPublicPaths);
          throw fileError;
        }
        setSupabaseConnected(true);
      } else {
        await writeLocalFiles({ ...input.descriptionFiles, ...fileUploads });
      }

      setProducts((current) => [product, ...current]);
      return product;
    },
    [supabase, user],
  );

  const togglePublished = useCallback(
    async (productId: string, knownProduct?: Product) => {
      const product = products.find((item) => item.id === productId) ?? knownProduct;
      if (!product || !user || product.creatorId !== user.id) return;
      const published = !product.published;
      if (published && product.kind === "course") {
        let content = await readLocalContent(product.id);
        if (!content && (!supabase || user.isDemo)) content = contentFromLegacy(product);
        if (supabase && !user.isDemo) {
          const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/content`, { cache: "no-store" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "Le cours n’a pas pu être vérifié.");
          content = normalizeProductContent(payload.content);
        }
        if (!content || !hasPublishableContent(content, product.kind)) throw new Error("Ajoutez au moins une leçon avec du texte, une vidéo ou un fichier avant de publier ce cours.");
      }
      if (supabase && !user.isDemo) {
        const { error } = await supabase.from("products").update({ published }).eq("id", productId);
        if (error) throw new Error(error.message);
      }
      setProducts((current) => current.map((item) => (item.id === productId ? { ...item, published } : item)));
    },
    [products, supabase, user],
  );

  const updateProduct = useCallback(
    async (productId: string, input: EditableProductInput) => {
      const product = products.find((item) => item.id === productId);
      if (!product || !user || product.creatorId !== user.id) throw new Error("Vous ne pouvez pas modifier ce produit.");
      validateProductPricing(input.price, input.compareAtPrice, input.currency);
      const files = input.files === undefined ? undefined : normalizeProductFiles(input.files);
      const inputDocument = normalizeRichTextDocument(input.descriptionContent) ?? product.descriptionContent ?? documentFromPlainText(input.description);
      if (collectRichTextVideoUrls(inputDocument).some((url) => !videoEmbed(url))) throw new Error("Utilisez un lien vidéo YouTube ou Vimeo valide.");
      let descriptionContent = inputDocument;
      const uploadedPublicPaths: string[] = [];
      if (supabase && !user.isDemo) {
        const uploaded = await uploadPublicRichTextImages(supabase, user.id, productId, inputDocument, input.descriptionFiles ?? {});
        descriptionContent = uploaded.document;
        uploadedPublicPaths.push(...uploaded.uploadedPaths);
      }
      const updated: Product = {
        ...product,
        title: input.title.trim(),
        subtitle: input.subtitle.trim(),
        description: richTextToPlainText(descriptionContent) || input.description.trim(),
        descriptionContent,
        category: input.category,
        tags: input.tags,
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        saveForLaterEnabled: input.saveForLaterEnabled ?? product.saveForLaterEnabled ?? true,
        files: product.isRemote ? undefined : files ?? product.files,
        fileName: files?.[0]?.fileName ?? (files === undefined ? product.fileName : undefined),
        currency: input.currency,
        cover: input.cover,
        coverLabel: input.coverLabel,
        details: input.details ?? product.details,
      };
      if (supabase && !user.isDemo) {
        const { error } = await supabase.from("products").update({
          title: updated.title,
          subtitle: updated.subtitle,
          description: updated.description,
          description_content: updated.descriptionContent,
          category: updated.category,
          tags: updated.tags,
          amount: Math.round(updated.price * 100),
          compare_at_amount: updated.compareAtPrice === undefined ? null : Math.round(updated.compareAtPrice * 100),
          save_for_later_enabled: updated.saveForLaterEnabled,
          currency: updated.currency,
          cover: updated.cover,
          cover_label: updated.coverLabel,
          details: updated.details,
        }).eq("id", productId).eq("creator_id", user.id);
        if (error) {
          if (uploadedPublicPaths.length) await supabase.storage.from("product-rich-images").remove(uploadedPublicPaths);
          throw new Error(error.message);
        }
        if (product.kind === "download" && files !== undefined) await saveRemoteProductFiles(supabase, user.id, productId, files, input.fileUploads ?? {});
      } else {
        await writeLocalFiles({ ...input.descriptionFiles, ...input.fileUploads });
      }
      setProducts((current) => current.map((item) => item.id === productId ? updated : item));
    },
    [products, supabase, user],
  );

  const deleteProduct = useCallback(
    async (productId: string) => {
      const product = products.find((item) => item.id === productId);
      if (!product || !user || product.creatorId !== user.id) return;
      if (supabase && !user.isDemo) {
        const { error } = await supabase.from("products").delete().eq("id", productId);
        if (error) throw new Error(error.message);
      }
      setProducts((current) => current.filter((item) => item.id !== productId));
    },
    [products, supabase, user],
  );

  const purchase = useCallback(async ({ product, buyerEmail, shippingAddress, buyerNote }: PurchaseInput) => {
    let order: Order;
    const remoteProduct = Boolean(supabase && product.isRemote);
    if (process.env.NEXT_PUBLIC_PAYMENT_MODE === "saspay" && !remoteProduct) {
      throw new Error("Ce produit n’est pas disponible pour le paiement réel.");
    }
    if (remoteProduct) {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: product.slug,
          buyerEmail: buyerEmail.trim().toLowerCase(),
          shippingAddress,
          buyerNote,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Le checkout n’a pas abouti.");
      order = { ...(payload.order as Order), checkoutUrl: payload.checkoutUrl, isRemote: true };
    } else {
      const result = await paymentProvider.createCheckout({ product, buyerEmail, shippingAddress });
      order = {
        id: result.reference,
        productId: product.id,
        productSlug: product.slug,
        productTitle: product.title,
        productKind: product.kind,
        creatorName: product.creatorName,
        creatorSlug: product.creatorSlug,
        buyerEmail: buyerEmail.trim().toLowerCase(),
        status: result.status,
        amount: product.price,
        currency: product.currency,
        createdAt: new Date().toISOString(),
        shippingAddress,
        buyerNote,
      };
    }
    setOrders((current) => [order, ...current]);
    return order;
  }, [supabase]);

  const cancelSubscription = useCallback(async (order: Order) => {
    if (order.status === "canceled_demo" || order.membershipRenewalCancelledAt) return;
    if (order.isRemote && /^[0-9a-f-]{36}$/i.test(order.id) && order.status === "paid") {
      const response = await fetch("/api/memberships/cancel-renewal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Le renouvellement n’a pas pu être arrêté.");
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, membershipRenewalCancelledAt: payload.cancelledAt } : item));
      return;
    }
    if (order.isRemote && /^[0-9a-f-]{36}$/i.test(order.id)) {
      const response = await fetch("/api/demo-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "L’abonnement de démonstration n’a pas pu être annulé.");
    } else {
      await paymentProvider.cancelSubscription(order.id);
    }
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: "canceled_demo" } : item));
  }, []);

  const loadProductContent = useCallback(async (product: Product) => {
    const isRemote = Boolean(supabase && product.isRemote);
    if (isRemote) {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/content`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Ce contenu n’est pas accessible.");
      return normalizeProductContent(payload.content);
    }
    const stored = await readLocalContent(product.id);
    const seed = seedProducts.find((item) => item.id === product.id);
    const seededContent = contentFromLegacy(seed ?? product) ?? emptyProductContent();
    if (!stored) return seededContent;
    if (!seed) return stored;

    // Bring seeded demo lessons up to date in existing local browsers without replacing creator edits.
    const seededLessons = new Map(seededContent.modules.flatMap((module) => module.lessons).map((lesson) => [lesson.id, lesson]));
    return {
      ...stored,
      modules: stored.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => {
          const seededLesson = seededLessons.get(lesson.id);
          return !lesson.videoUrl && seededLesson?.videoUrl ? { ...lesson, videoUrl: seededLesson.videoUrl } : lesson;
        }),
      })),
    };
  }, [supabase]);

  const saveProductContent = useCallback(async (productId: string, value: ProductContent, files: Record<string, File> = {}, productDraft?: Product) => {
    const product = products.find((item) => item.id === productId) ?? productDraft;
    if (!user || !product || product.creatorId !== user.id) throw new Error("Vous ne pouvez pas modifier ce contenu.");
    const content = normalizeProductContent(value);
    const videoUrls = [
      ...content.modules.flatMap((courseModule) => courseModule.lessons.flatMap((lesson) => [lesson.videoUrl, ...collectRichTextVideoUrls(lesson.descriptionContent)])),
      ...content.membershipPosts.flatMap((post) => [post.videoUrl, ...collectRichTextVideoUrls(post.bodyContent)]),
    ].filter((url): url is string => Boolean(url));
    if (videoUrls.some((url) => !videoEmbed(url))) throw new Error("Utilisez un lien vidéo YouTube ou Vimeo valide.");
    if (supabase && !user.isDemo) {
      const resolved = structuredClone(content);
      for (const [resourceId, file] of Object.entries(files)) {
        const path = `${user.id}/${productId}/resources/${resourceId}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("product-files").upload(path, file, { upsert: true });
        if (error) throw new Error(error.message);
        const resource = [...resolved.modules.flatMap((module) => module.lessons.flatMap((lesson) => lesson.resources ?? [])), ...resolved.membershipPosts.flatMap((post) => post.resources ?? [])].find((item) => item.id === resourceId);
        if (resource) resource.storagePath = path;
        let imageFound = false;
        for (const courseModule of resolved.modules) {
          for (const lesson of courseModule.lessons) {
            if (!lesson.descriptionContent) continue;
            lesson.descriptionContent = transformRichTextImages(lesson.descriptionContent, (attrs) => {
              if (attrs.resourceId === resourceId) { attrs.storagePath = path; imageFound = true; }
              return attrs;
            });
          }
        }
        for (const post of resolved.membershipPosts) {
          if (!post.bodyContent) continue;
          post.bodyContent = transformRichTextImages(post.bodyContent, (attrs) => {
            if (attrs.resourceId === resourceId) { attrs.storagePath = path; imageFound = true; }
            return attrs;
          });
        }
        if (!resource && !imageFound) {
          await supabase.storage.from("product-files").remove([path]);
          throw new Error("Une image ou ressource choisie n’est plus présente dans le contenu.");
        }
      }
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: resolved }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Le contenu n’a pas pu être enregistré.");
    } else {
      await writeLocalContent(productId, content, files);
    }
    setProducts((current) => {
      const updated = { ...product, details: { ...product.details, lessons: content.modules.reduce((count, module) => count + module.lessons.length, 0) } };
      return current.some((item) => item.id === productId) ? current.map((item) => item.id === productId ? updated : item) : [updated, ...current];
    });
  }, [products, supabase, user]);

  const loadCourseProgress = useCallback(async (productId: string): Promise<CourseProgress> => {
    const remote = Boolean(supabase && user && !user.isDemo && /^[0-9a-f-]{36}$/i.test(productId));
    if (remote) {
      const response = await fetch(`/api/courses/${encodeURIComponent(productId)}/progress`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "La progression n’est pas accessible.");
      return payload.progress as CourseProgress;
    }
    try { return JSON.parse(localStorage.getItem(`gumroad-progress:${user?.id}:${productId}`) ?? "{}"); }
    catch { return { completedLessonIds: [] }; }
  }, [supabase, user]);

  const saveCourseProgress = useCallback(async (productId: string, progress: CourseProgress) => {
    const remote = Boolean(supabase && user && !user.isDemo && /^[0-9a-f-]{36}$/i.test(productId));
    if (remote) {
      const response = await fetch(`/api/courses/${encodeURIComponent(productId)}/progress`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progress }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "La progression n’a pas pu être enregistrée.");
      return;
    }
    localStorage.setItem(`gumroad-progress:${user?.id}:${productId}`, JSON.stringify(progress));
  }, [supabase, user]);

  const loadProductFiles = useCallback(async (product: Pick<Product, "id" | "isRemote" | "files" | "fileName">) => {
    if (product.isRemote) {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/files`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Les fichiers ne sont pas accessibles.");
      return normalizeProductFiles(payload.files);
    }
    return product.files ?? (product.fileName ? [{ id: crypto.randomUUID(), name: product.fileName, fileName: product.fileName, position: 0 }] : []);
  }, []);

  const toggleFavorite = useCallback((productId: string) => {
    const product = products.find((item) => item.id === productId);
    setFavorites((current) => changeFavorite(current, productId, product ? product.saveForLaterEnabled : false));
  }, [products]);

  const value = useMemo<MarketplaceContextValue>(
    () => ({
      user,
      products,
      orders,
      favorites,
      ready,
      supabaseConnected,
      supabaseConfigured: Boolean(supabase),
      message,
      setMessage,
      register,
      login,
      logout,
      addProduct,
      updateProduct,
      togglePublished,
      deleteProduct,
      purchase,
      cancelSubscription,
      toggleFavorite,
      loadProductContent,
      loadProductFiles,
      saveProductContent,
      loadCourseProgress,
      saveCourseProgress,
    }),
    [
      user,
      products,
      orders,
      favorites,
      ready,
      supabaseConnected,
      supabase,
      message,
      register,
      login,
      logout,
      addProduct,
      updateProduct,
      togglePublished,
      deleteProduct,
      purchase,
      cancelSubscription,
      toggleFavorite,
      loadProductContent,
      loadProductFiles,
      saveProductContent,
      loadCourseProgress,
      saveCourseProgress,
    ],
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplace() {
  const context = useContext(MarketplaceContext);
  if (!context) throw new Error("useMarketplace doit être utilisé dans MarketplaceProvider.");
  return context;
}
