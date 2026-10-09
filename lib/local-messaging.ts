import { seedCreators } from "@/lib/seed";
import { readLocalFile, writeLocalFiles } from "@/lib/content-storage";
import {
  attachmentError,
  customerSummary,
  fileMatches,
  messageError,
} from "@/lib/messaging.mjs";
import type {
  Conversation,
  ConversationDetail,
  DemoUser,
  Message,
  MessageAttachment,
  Order,
  Product,
} from "@/lib/types";

type Participant = {
  readSeq: number;
  readIds: string[];
  blocked: boolean;
  emailNotifications: boolean;
};
type State = {
  conversations: Conversation[];
  messages: Message[];
  participants: Record<string, Participant>;
  attachments: Record<
    string,
    MessageAttachment & { conversationId: string; uploaderId: string }
  >;
};
const empty = (): State => ({
  conversations: [],
  messages: [],
  participants: {},
  attachments: {},
});
const participantKey = (id: string, user: string) => `${id}:${user}`;
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("sellow-messages-local-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("La messagerie locale est indisponible."));
  });
}
async function transaction<T>(
  operation: (state: State) => T,
  write = false,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("state", write ? "readwrite" : "readonly");
    const store = tx.objectStore("state"),
      request = store.get("messages");
    let value: T;
    request.onsuccess = () => {
      try {
        const state = (request.result as State) ?? empty();
        value = operation(state);
        if (write) store.put(state, "messages");
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      db.close();
      if (write) window.dispatchEvent(new Event("sellow-messages-change"));
      resolve(value);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("L’enregistrement des messages a échoué."));
    };
  });
}
export function localMessaging(
  user: DemoUser,
  products: Product[],
  orders: Order[],
) {
  function access(state: State, id: string) {
    const c = state.conversations.find(
      (c) => c.id === id && [c.customerId, c.sellerId].includes(user.id),
    );
    if (!c) throw new Error("Cette discussion n’est pas accessible.");
    return c;
  }
  function summary(c: Conversation) {
    const email =
      c.customerId === user.id
        ? user.email
        : localAccounts().find((a) => a.id === c.customerId)?.email;
    return customerSummary(
      orders
        .filter(
          (o) =>
            !o.isRemote &&
            (o.buyerId === c.customerId || o.buyerEmail === email) &&
            o.creatorSlug === c.sellerSlug,
        )
        .map((o) => ({ ...o })),
    );
  }
  return {
    async list() {
      return transaction((state) =>
        state.conversations
          .filter((c) => [c.customerId, c.sellerId].includes(user.id))
          .map((c) => ({
            ...c,
            unread: state.messages.filter(
              (m) =>
                m.conversationId === c.id &&
                m.senderId !== user.id &&
                !state.participants[
                  participantKey(c.id, user.id)
                ].readIds?.includes(m.id),
            ).length,
            lastMessage: state.messages
              .filter((m) => m.conversationId === c.id)
              .at(-1)?.body,
            summary: summary(c),
          }))
          .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
      );
    },
    async open(source: {
      productId?: string;
      orderId?: string;
      sellerId?: string;
    }) {
      return transaction((state) => {
        const order = source.orderId
          ? orders.find(
              (o) =>
                o.id === source.orderId &&
                (o.buyerId === user.id || o.buyerEmail === user.email) &&
                ["paid_demo", "canceled_demo", "paid", "refunded"].includes(
                  o.status,
                ),
            )
          : undefined;
        const product = order
          ? products.find((p) => p.id === order.productId)
          : products.find(
              (p) =>
                p.published &&
                (source.productId
                  ? p.id === source.productId
                  : p.creatorId === source.sellerId),
            );
        if (!order && !product?.published)
          throw new Error("Le produit ou la commande n’est pas accessible.");
        const seller = [...localAccounts(), ...seedCreators].find(
          (a) => a.id === product?.creatorId || a.slug === order?.creatorSlug,
        );
        const sellerId = seller?.id ?? product?.creatorId;
        if (!sellerId || sellerId === user.id)
          throw new Error("Vous ne pouvez pas vous écrire à vous-même.");
        const prior = state.conversations.find(
          (c) => c.customerId === user.id && c.sellerId === sellerId,
        );
        if (prior) return prior;
        if (
          state.conversations.filter(
            (c) =>
              c.customerId === user.id &&
              Date.parse(c.createdAt) > Date.now() - 3600000,
          ).length >= 5
        )
          throw new Error("Patientez avant d’ouvrir une nouvelle discussion.");
        const c: Conversation = {
          id: crypto.randomUUID(),
          customerId: user.id,
          sellerId,
          customerName: user.name,
          sellerName: seller?.name ?? product!.creatorName,
          sellerSlug: seller?.slug ?? product!.creatorSlug,
          createdAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
          unread: 0,
        };
        state.conversations.push(c);
        for (const id of [c.customerId, c.sellerId])
          state.participants[participantKey(c.id, id)] = {
            readSeq: 0,
            readIds: [],
            blocked: false,
            emailNotifications: true,
          };
        return c;
      }, true);
    },
    async detail(id: string, before?: number): Promise<ConversationDetail> {
      return transaction((state) => {
        const c = access(state, id),
          me = state.participants[participantKey(id, user.id)];
        const rows = state.messages.filter(
          (m) => m.conversationId === id && (!before || m.seq < before),
        );
        return {
          conversation: c,
          messages: rows.slice(-50),
          hasMore: rows.length > 50,
          summary: summary(c),
          blocked: [c.customerId, c.sellerId].some(
            (id) => state.participants[participantKey(c.id, id)].blocked,
          ),
          blockedByMe: me.blocked,
          emailNotifications: me.emailNotifications,
        };
      });
    },
    async send(
      id: string,
      body: {
        body: string;
        attachments: string[];
        clientRequestId: string;
        productId?: string;
        orderId?: string;
      },
    ) {
      const error = messageError(body.body, body.attachments);
      if (error) throw new Error(error);
      return transaction((state) => {
        const c = access(state, id);
        const prior = state.messages.find(
          (m) =>
            m.conversationId === id &&
            m.senderId === user.id &&
            m.clientRequestId === body.clientRequestId,
        );
        if (prior) return;
        if (
          [c.customerId, c.sellerId].some(
            (id) => state.participants[participantKey(c.id, id)].blocked,
          )
        )
          throw new Error(
            "Les nouveaux messages sont bloqués dans cette discussion.",
          );
        if (
          state.messages.filter(
            (m) =>
              m.senderId === user.id &&
              Date.parse(m.createdAt) > Date.now() - 60000,
          ).length >= 20
        )
          throw new Error("Patientez avant d’envoyer un nouveau message.");
        const order = body.orderId
          ? orders.find(
              (o) =>
                o.id === body.orderId &&
                o.creatorSlug === c.sellerSlug &&
                (o.buyerId === c.customerId ||
                  o.buyerEmail ===
                    localAccounts().find((a) => a.id === c.customerId)
                      ?.email) &&
                ["paid", "refunded", "paid_demo", "canceled_demo"].includes(
                  o.status,
                ),
            )
          : undefined;
        const product = body.productId
          ? products.find(
              (p) =>
                p.id === body.productId &&
                p.creatorId === c.sellerId &&
                p.published,
            )
          : undefined;
        if ((body.orderId && !order) || (body.productId && !product))
          throw new Error("La référence du message est invalide.");
        const files = body.attachments.map((id) => state.attachments[id]);
        if (
          files.some(
            (a) => !a || a.conversationId !== c.id || a.uploaderId !== user.id,
          ) ||
          state.messages.some((m) =>
            m.attachments.some((a) => body.attachments.includes(a.id)),
          )
        )
          throw new Error("Un fichier n’est pas accessible.");
        const m: Message = {
          id: crypto.randomUUID(),
          seq: (state.messages.at(-1)?.seq ?? 0) + 1,
          conversationId: c.id,
          senderId: user.id,
          body: body.body.trim(),
          clientRequestId: body.clientRequestId,
          createdAt: new Date().toISOString(),
          productId: body.productId,
          orderId: body.orderId,
          contextTitle: order?.productTitle ?? product?.title,
          contextSlug: order?.productSlug ?? product?.slug,
          attachments: files.map((a) => ({
            id: a.id,
            name: a.name,
            mimeType: a.mimeType,
            size: a.size,
          })),
        };
        state.messages.push(m);
        c.lastMessageAt = m.createdAt;
      }, true);
    },
    async update(
      id: string,
      patch: {
        readSeq?: number;
        readIds?: string[];
        blocked?: boolean;
        emailNotifications?: boolean;
      },
    ) {
      return transaction((state) => {
        const c = access(state, id);
        const p = state.participants[participantKey(id, user.id)];
        if (
          patch.readSeq !== undefined &&
          state.messages.some(
            (m) => m.conversationId === id && m.seq === patch.readSeq,
          )
        )
          p.readSeq = Math.max(p.readSeq, patch.readSeq);
        if (patch.readIds)
          p.readIds = [
            ...new Set([
              ...(p.readIds ?? []),
              ...patch.readIds.filter((id) =>
                state.messages.some(
                  (m) => m.id === id && m.conversationId === c.id,
                ),
              ),
            ]),
          ];
        if (patch.blocked !== undefined) p.blocked = patch.blocked;
        if (patch.emailNotifications !== undefined)
          p.emailNotifications = patch.emailNotifications;
      }, true);
    },
    async upload(id: string, file: File) {
      const error = attachmentError(file);
      if (error) throw new Error(error);
      if (!fileMatches(new Uint8Array(await file.arrayBuffer()), file.type))
        throw new Error("Le fichier ne correspond pas au format annoncé.");
      const attachment: MessageAttachment = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mimeType: file.type,
      };
      await transaction((state) => {
        const c = access(state, id);
        if (
          [c.customerId, c.sellerId].some(
            (id) => state.participants[participantKey(c.id, id)].blocked,
          )
        )
          throw new Error("Cette discussion est bloquée.");
        state.attachments[attachment.id] = {
          ...attachment,
          conversationId: id,
          uploaderId: user.id,
        };
      }, true);
      await writeLocalFiles({ [attachment.id]: file });
      return attachment.id;
    },
    async download(id: string, attachmentId: string) {
      await transaction((state) => {
        access(state, id);
        if (
          !state.messages.some(
            (m) =>
              m.conversationId === id &&
              m.attachments.some((a) => a.id === attachmentId),
          )
        )
          throw new Error("Fichier inaccessible.");
      });
      const file = await readLocalFile(attachmentId);
      if (!file) throw new Error("Fichier indisponible.");
      return URL.createObjectURL(file);
    },
  };
}
export function localAccounts(): DemoUser[] {
  try {
    return JSON.parse(localStorage.getItem("sellow-demo-accounts") ?? "[]");
  } catch {
    return [];
  }
}
export function rememberLocalAccount(user: DemoUser) {
  localStorage.setItem(
    "sellow-demo-accounts",
    JSON.stringify([
      ...localAccounts().filter((a) => a.email !== user.email),
      user,
    ]),
  );
}
