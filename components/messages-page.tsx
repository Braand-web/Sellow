"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ChatCircle,
  Paperclip,
  PaperPlaneTilt,
  X,
  LockSimple,
  ShoppingBag,
} from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { useMessaging } from "@/components/messaging-provider";
import {
  attachmentError,
  customerBadge,
  messageError,
} from "@/lib/messaging.mjs";
import { formatPrice } from "@/components/product-card";
import type { ConversationDetail, MessageAttachment } from "@/lib/types";

function Attachment({
  attachment,
  conversationId,
}: {
  attachment: MessageAttachment;
  conversationId: string;
}) {
  const { api } = useMessaging();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!api || !attachment.mimeType.startsWith("image/")) return;
    let active = true;
    let url = "";
    api
      .download(conversationId, attachment.id)
      .then((value) => {
        url = value;
        if (active) setPreview(value);
        else if (value.startsWith("blob:")) URL.revokeObjectURL(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [api, attachment.id, attachment.mimeType, conversationId]);
  async function download() {
    if (!api) return;
    setBusy(true);
    setError("");
    try {
      const url = await api.download(conversationId, attachment.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.name;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
      if (url.startsWith("blob:"))
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {preview && (
        <a
          href={preview}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Afficher ${attachment.name}`}
        >
          {/* Authorized temporary images preserve their complete frame. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="message-image"
            src={preview}
            alt={attachment.name}
            loading="lazy"
          />
        </a>
      )}
      <button
        className="message-file"
        type="button"
        onClick={download}
        disabled={busy}
      >
        <Paperclip aria-hidden="true" size={17} />
        <span>
          {attachment.name}
          <small>
            {Math.ceil(attachment.size / 1024)} Ko ·{" "}
            {busy ? "Ouverture…" : "Ouvrir le fichier"}
          </small>
        </span>
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function MessagesPage() {
  const { user } = useMarketplace();
  const { conversationId } = useParams<{ conversationId?: string }>();
  return (
    <MessagesInbox
      key={`${user?.id ?? "visitor"}:${conversationId ?? "list"}`}
    />
  );
}
function MessagesInbox() {
  const { user, ready, products, orders, supabaseConfigured } =
    useMarketplace();
  const {
    enabled,
    api,
    conversations,
    revision,
    error: listingError,
    refresh,
  } = useMessaging();
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();
  const search = useSearchParams();
  const id = params.conversationId;
  const productId = search.get("produit") ?? undefined,
    orderId = search.get("commande") ?? undefined,
    sellerId = search.get("vendeur") ?? undefined;
  const [loaded, setLoaded] = useState<{
    account: string;
    id: string;
    detail: ConversationDetail;
  } | null>(null);
  const [view, setView] = useState<"list" | "chat" | "purchases">(
    id ? "chat" : "list",
  );
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const nonce = useRef(crypto.randomUUID());
  const uploaded = useRef<Map<File, string>>(new Map());
  const openingKey = useRef("");
  const readIds = useRef(new Set<string>());
  const log = useRef<HTMLDivElement>(null);
  const account = useRef(user?.id);
  const detail =
    loaded && loaded.account === user?.id && loaded.id === id
      ? loaded.detail
      : null;
  const currentProduct = products.find((p) => p.id === productId);
  const currentOrder = orders.find((o) => o.id === orderId);
  const contextTitle = currentOrder?.productTitle ?? currentProduct?.title;
  const lastSeq = detail?.messages.at(-1)?.seq;
  useEffect(() => {
    account.current = user?.id;
    const uploads = uploaded.current,
      reads = readIds.current;
    return () => {
      account.current = undefined;
      uploads.clear();
      reads.clear();
    };
  }, [user?.id]);
  useEffect(() => {
    if (!api || !user || id || (!productId && !orderId && !sellerId)) return;
    const key = `${user.id}:${productId}:${orderId}:${sellerId}`;
    if (openingKey.current === key) return;
    openingKey.current = key;
    let active = true;
    setOpening(true);
    api
      .open({ productId, orderId, sellerId })
      .then((c) => {
        if (active) {
          const q = new URLSearchParams(
            productId
              ? { produit: productId }
              : orderId
                ? { commande: orderId }
                : {},
          );
          router.replace(`/messages/${c.id}${q.size ? `?${q}` : ""}`);
          setView("chat");
          refresh();
        }
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          openingKey.current = "";
        }
      })
      .finally(() => {
        if (active) setOpening(false);
      });
    return () => {
      active = false;
      openingKey.current = "";
    };
  }, [api, user, id, productId, orderId, sellerId, router, refresh]);
  useEffect(() => {
    if (!api || !id || !user) return;
    let active = true;
    api
      .detail(id)
      .then((detail) => {
        if (active) {
          setLoaded({ account: user.id, id, detail });
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          setLoaded(null);
          setError(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, [api, id, user, revision]);
  useEffect(() => {
    if (!detail || !api || !id) return;
    // A message is read only after its DOM bubble enters the visible, active
    // conversation. Background tabs and the mobile purchase view do not count.
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          document.visibilityState !== "visible" ||
          (window.innerWidth <= 1080 && view !== "chat")
        )
          return;
        const visible = entries
          .filter((e) => e.isIntersecting && e.intersectionRect.height > 0)
          .map((e) => e.target as HTMLElement)
          .filter((el) => !readIds.current.has(el.dataset.messageId!));
        if (!visible.length) return;
        const ids = visible.map((el) => el.dataset.messageId!);
        ids.forEach((id) => readIds.current.add(id));
        void api
          .update(id, {
            readSeq: Math.max(...visible.map((el) => Number(el.dataset.seq))),
            readIds: ids,
          })
          .then(refresh)
          .catch(() => {
            ids.forEach((id) => readIds.current.delete(id));
          });
      },
      { threshold: 0 },
    );
    log.current
      ?.querySelectorAll("[data-incoming='true']")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [detail, api, id, view, user?.id, refresh]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lastSeq, id]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!api || !id || !user || busy) return;
    const validation = messageError(
      body,
      files.map((_, i) => String(i)),
    );
    if (validation) {
      setError(validation);
      return;
    }
    const actor = user.id;
    setBusy(true);
    setError("");
    try {
      const ids: string[] = [];
      for (const file of files) {
        let attachment = uploaded.current.get(file);
        if (!attachment) {
          attachment = await api.upload(id, file);
          uploaded.current.set(file, attachment);
        }
        ids.push(attachment);
      }
      if (account.current !== actor) return;
      await api.send(id, {
        body,
        attachments: ids,
        clientRequestId: nonce.current,
        productId,
        orderId,
      });
      if (account.current === actor) {
        setBody("");
        setFiles([]);
        uploaded.current.clear();
        nonce.current = crypto.randomUUID();
        refresh();
      }
    } catch (error) {
      if (account.current === actor) setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preferences(patch: {
    blocked?: boolean;
    emailNotifications?: boolean;
  }) {
    if (!api || !id) return;
    if (patch.emailNotifications !== undefined)
      setLoaded((current) =>
        current
          ? {
              ...current,
              detail: {
                ...current.detail,
                emailNotifications: patch.emailNotifications!,
              },
            }
          : current,
      );
    try {
      await api.update(id, patch);
      refresh();
    } catch (error) {
      setError((error as Error).message);
      refresh();
    }
  }
  async function older() {
    if (!api || !id || !detail || !user) return;
    try {
      const old = await api.detail(id, detail.messages[0]?.seq);
      setLoaded({
        account: user.id,
        id,
        detail: {
          ...detail,
          messages: [...old.messages, ...detail.messages],
          hasMore: old.hasMore,
        },
      });
    } catch (error) {
      setError((error as Error).message);
    }
  }

  if (!ready)
    return (
      <div className="page-wrap">
        <div className="loading-card" />
      </div>
    );
  if (!enabled)
    return (
      <div className="page-wrap empty-state">
        <h1>La messagerie arrive bientôt</h1>
        <p>
          Vous pourrez échanger avec les vendeurs depuis votre espace Sellow.
        </p>
      </div>
    );
  if (!user) {
    const next = `/messages${id ? `/${id}` : ""}${search.size ? `?${search}` : ""}`;
    return (
      <div className="page-wrap empty-state">
        <ChatCircle size={36} />
        <h1>Échangez avec les créateurs</h1>
        <p>
          Connectez-vous pour poser une question avant un achat ou retrouver vos
          discussions après une commande.
        </p>
        <Link
          className="button button-dark"
          href={`/connexion?next=${encodeURIComponent(next)}`}
        >
          Se connecter
        </Link>
        <Link
          className="text-link"
          href={`/inscription?next=${encodeURIComponent(next)}`}
        >
          Créer un compte
        </Link>
      </div>
    );
  }
  const sellerView = detail?.conversation.sellerId === user.id;
  const customerName = detail
    ? sellerView
      ? detail.conversation.customerName
      : detail.conversation.sellerName
    : "";
  const purchasedProduct =
    productId &&
    detail?.summary.purchases.some(
      (p) => p.productId === productId && p.kind === "paid",
    );
  return (
    <div className="page-wrap messages-page">
      <div className="dashboard-header">
        <div>
          <p className="page-eyebrow">Vos échanges sur Sellow</p>
          <h1>Messages</h1>
          <p>Posez vos questions et suivez vos échanges avec les créateurs.</p>
        </div>
        <Link className="text-link" href="/studio">
          Mon espace <ArrowLeft size={16} />
        </Link>
      </div>
      {(!supabaseConfigured || user.isDemo) && (
        <p className="demo-auth-note">
          Messagerie de démonstration : échanges conservés dans ce navigateur,
          aucun e-mail envoyé.
        </p>
      )}
      {(error || listingError) && (
        <p className="form-error" role="alert">
          {error || listingError}
        </p>
      )}
      <nav className="messages-mobile-nav" aria-label="Vues de la messagerie">
        <button
          type="button"
          aria-current={view === "list" ? "page" : undefined}
          onClick={() => setView("list")}
        >
          Discussions
        </button>
        <button
          type="button"
          disabled={!detail}
          aria-current={view === "chat" ? "page" : undefined}
          onClick={() => setView("chat")}
        >
          Messages
        </button>
        <button
          type="button"
          disabled={!detail}
          aria-current={view === "purchases" ? "page" : undefined}
          onClick={() => setView("purchases")}
        >
          Achats
        </button>
      </nav>
      <div className={`messages-layout messages-view-${view}`}>
        <aside className="messages-list" aria-label="Vos discussions">
          <h2>
            Discussions <span>{conversations.length}</span>
          </h2>
          {conversations.map((c) => (
            <Link
              className={`conversation-row${c.id === id ? " selected" : ""}`}
              key={c.id}
              href={`/messages/${c.id}`}
              onClick={() => setView("chat")}
              aria-current={c.id === id ? "page" : undefined}
            >
              <span className="avatar avatar-rose">
                {(c.sellerId === user.id ? c.customerName : c.sellerName)
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <span>
                <strong>
                  {c.sellerId === user.id ? c.customerName : c.sellerName}
                </strong>
                {c.sellerId === user.id && (
                  <span
                    className={`customer-badge${c.summary.paidCount ? " buyer" : ""}`}
                  >
                    {customerBadge(c.summary)}
                  </span>
                )}
                <small>{c.lastMessage || "Nouvelle discussion"}</small>
              </span>
              {c.unread > 0 && (
                <span
                  className="message-count"
                  aria-label={`${c.unread} message${c.unread > 1 ? "s" : ""} non lu${c.unread > 1 ? "s" : ""}`}
                >
                  {c.unread > 99 ? "99+" : c.unread}
                </span>
              )}
            </Link>
          ))}
          {!conversations.length && !listingError && (
            <div className="messages-empty">
              <ChatCircle size={30} />
              <p>Aucune discussion pour le moment.</p>
              <p>
                Ouvrez une fiche produit et choisissez « Contacter le vendeur ».
              </p>
              <Link className="text-link" href="/#decouvrir">
                Explorer les produits
              </Link>
            </div>
          )}
        </aside>
        <section className="messages-chat" aria-label="Discussion privée">
          {detail ? (
            <>
              <header className="message-thread-header">
                <div>
                  <h2>{customerName}</h2>
                  <p>{sellerView ? "Votre client" : "Votre vendeur"}</p>
                  {sellerView && (
                    <span
                      className={`customer-badge${detail.summary.paidCount ? " buyer" : ""}`}
                    >
                      {customerBadge(detail.summary)}
                    </span>
                  )}
                  {purchasedProduct && (
                    <span className="customer-badge buyer">Produit acheté</span>
                  )}
                </div>
                <span className="message-private">
                  <LockSimple size={16} aria-hidden="true" />
                  Privé
                </span>
              </header>
              <div
                className="message-log"
                ref={log}
                tabIndex={0}
                aria-label="Historique des messages"
              >
                <div className="message-history-note">
                  Vous et {customerName} pouvez consulter cet échange.
                </div>
                {detail.hasMore && (
                  <button
                    className="button button-light button-small"
                    type="button"
                    onClick={older}
                  >
                    Voir les messages précédents
                  </button>
                )}
                {detail.messages.map((m) => (
                  <article
                    className={`message-bubble${m.senderId === user.id ? " outgoing" : ""}`}
                    key={m.id}
                    data-seq={m.seq}
                    data-message-id={m.id}
                    data-incoming={m.senderId !== user.id}
                  >
                    <span className="sr-only">
                      {m.senderId === user.id ? "Vous" : customerName} :
                    </span>
                    {m.contextTitle && (
                      <div className="message-context">
                        <ShoppingBag size={15} aria-hidden="true" />
                        <span>
                          {m.contextTitle}
                          {sellerView &&
                            detail.summary.purchases.some(
                              (p) =>
                                p.kind === "paid" &&
                                (p.productId === m.productId ||
                                  p.id === m.orderId),
                            ) && (
                              <small className="customer-badge buyer">
                                Produit acheté
                              </small>
                            )}
                          {m.orderId && (
                            <small>
                              Commande {m.orderId.slice(0, 8).toUpperCase()}
                            </small>
                          )}
                        </span>
                      </div>
                    )}
                    {m.body && <p>{m.body}</p>}
                    {m.attachments.map((a) => (
                      <Attachment
                        key={a.id}
                        attachment={a}
                        conversationId={id!}
                      />
                    ))}
                    <time dateTime={m.createdAt}>
                      {new Intl.DateTimeFormat("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(m.createdAt))}
                    </time>
                  </article>
                ))}
              </div>
              {detail.blocked ? (
                <div className="message-blocked">
                  <LockSimple size={19} />
                  <p>
                    Les nouveaux messages sont bloqués. L’historique reste
                    disponible.
                  </p>
                  {detail.blockedByMe && (
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => preferences({ blocked: false })}
                    >
                      Débloquer mes échanges
                    </button>
                  )}
                </div>
              ) : (
                <form className="message-composer" onSubmit={send}>
                  {contextTitle && (
                    <p className="composer-context">
                      À propos de <strong>{contextTitle}</strong>
                    </p>
                  )}
                  <label htmlFor="message-body">Votre message</label>
                  <textarea
                    id="message-body"
                    rows={3}
                    maxLength={4000}
                    disabled={busy}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      nonce.current = crypto.randomUUID();
                    }}
                    placeholder="Écrivez votre message…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="message-file-selection">
                    {files.map((f, i) => (
                      <span key={`${f.name}:${i}`}>
                        {f.name}
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Retirer ${f.name}`}
                          onClick={() => {
                            setFiles(files.filter((_, index) => index !== i));
                            nonce.current = crypto.randomUUID();
                          }}
                        >
                          <X size={16} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="composer-actions">
                    <label
                      className={`button button-light button-small${busy ? " disabled" : ""}`}
                    >
                      <Paperclip size={18} aria-hidden="true" />
                      Joindre un fichier
                      <input
                        className="sr-only"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        disabled={busy}
                        onChange={(e) => {
                          const selected = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (files.length + selected.length > 3) {
                            setError(
                              "Vous pouvez joindre trois fichiers maximum.",
                            );
                            return;
                          }
                          const invalid = selected
                            .map(attachmentError)
                            .find(Boolean);
                          if (invalid) {
                            setError(invalid);
                            return;
                          }
                          setFiles([...files, ...selected]);
                          nonce.current = crypto.randomUUID();
                          setError("");
                        }}
                      />
                    </label>
                    <button
                      className="button button-dark button-small"
                      type="submit"
                      disabled={busy || (!body.trim() && !files.length)}
                    >
                      {busy ? "Envoi…" : "Envoyer"}
                      <PaperPlaneTilt size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="field-help">
                    {body.length}/4 000 · JPG, PNG, WebP ou PDF · 3 fichiers de
                    10 Mo maximum
                  </p>
                </form>
              )}
            </>
          ) : (
            <div className="messages-empty">
              <ChatCircle size={40} />
              <h2>
                {opening
                  ? "Ouverture de la discussion…"
                  : "Sélectionnez une discussion"}
              </h2>
              <p>
                Les échanges concernant plusieurs produits d’un même vendeur
                sont regroupés ici.
              </p>
            </div>
          )}
        </section>
        <aside
          className="messages-purchases"
          aria-label="Achats et préférences"
        >
          {detail ? (
            <>
              <h2>
                {sellerView ? "Résumé du client" : "Vos achats chez ce vendeur"}
              </h2>
              {sellerView && (
                <span
                  className={`customer-badge${detail.summary.paidCount ? " buyer" : ""}`}
                >
                  {customerBadge(detail.summary)}
                </span>
              )}
              {detail.summary.freeCount > 0 && (
                <p>
                  {detail.summary.freeCount} acquisition
                  {detail.summary.freeCount > 1 ? "s" : ""} gratuite
                  {detail.summary.freeCount > 1 ? "s" : ""}
                </p>
              )}
              {detail.summary.demoCount > 0 && (
                <p>
                  {detail.summary.demoCount} achat
                  {detail.summary.demoCount > 1 ? "s" : ""} de démonstration
                </p>
              )}
              {detail.summary.purchases.map((p) => (
                <article className="customer-purchase" key={p.id}>
                  <strong>{p.title}</strong>
                  <span>{formatPrice(p.amount, p.currency)}</span>
                  <span>
                    {p.kind === "refunded"
                      ? "Remboursé"
                      : p.kind === "free"
                        ? "Acquisition gratuite"
                        : p.kind === "demo"
                          ? "Démonstration · Aucun paiement réel"
                          : "Paiement confirmé"}
                  </span>
                  <time dateTime={p.createdAt}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "medium",
                    }).format(new Date(p.createdAt))}
                  </time>
                  <small>Commande {p.id.toUpperCase()}</small>
                </article>
              ))}
              {!detail.summary.purchases.length && (
                <p>Aucun achat confirmé auprès de ce vendeur.</p>
              )}
              <div className="message-preferences">
                <h3>Préférences</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={detail.emailNotifications}
                    onChange={(e) =>
                      preferences({ emailNotifications: e.target.checked })
                    }
                  />
                  Alertes par e-mail
                </label>
                <p>
                  Une alerte si un message reste non lu pendant cinq minutes.
                </p>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => preferences({ blocked: !detail.blockedByMe })}
                >
                  {detail.blockedByMe
                    ? "Débloquer mes échanges"
                    : "Bloquer les nouveaux messages"}
                </button>
                <p>Le blocage conserve votre historique.</p>
              </div>
            </>
          ) : (
            <p>
              Choisissez une discussion pour retrouver les achats et les
              préférences.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
