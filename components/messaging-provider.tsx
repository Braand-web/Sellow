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
import { useMarketplace } from "@/app/providers";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { localMessaging } from "@/lib/local-messaging";
import type {
  Conversation,
  ConversationDetail,
  SellerCustomerSummary,
} from "@/lib/types";

type ListedConversation = Conversation & { summary: SellerCustomerSummary };
type Source = { productId?: string; orderId?: string; sellerId?: string };
type Api = {
  list(): Promise<ListedConversation[]>;
  open(source: Source): Promise<Conversation>;
  detail(id: string, before?: number): Promise<ConversationDetail>;
  send(
    id: string,
    body: {
      body: string;
      attachments: string[];
      clientRequestId: string;
      productId?: string;
      orderId?: string;
    },
  ): Promise<unknown>;
  update(
    id: string,
    patch: {
      readSeq?: number;
      readIds?: string[];
      blocked?: boolean;
      emailNotifications?: boolean;
    },
  ): Promise<unknown>;
  upload(id: string, file: File): Promise<string>;
  download(id: string, attachmentId: string): Promise<string>;
};
const Context = createContext<{
  enabled: boolean;
  api: Api | null;
  conversations: ListedConversation[];
  unread: number;
  revision: number;
  error: string;
  refresh(): void;
}>({
  enabled: false,
  api: null,
  conversations: [],
  unread: 0,
  revision: 0,
  error: "",
  refresh() {},
});
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/conversations${path}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error ?? "La messagerie est temporairement indisponible.",
    );
  return data as T;
}
export function MessagingProvider({
  children,
  enabled: liveEnabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const { user, products, orders, supabaseConfigured } = useMarketplace();
  const enabled = supabaseConfigured ? liveEnabled : true;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    account: string;
    conversations: ListedConversation[];
    error: string;
  }>({ account: "", conversations: [], error: "" });
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    // Discard the previous authenticated account cache; descendants keep their UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ account: user?.id ?? "", conversations: [], error: "" });
  }, [user?.id]);
  const api = useMemo<Api | null>(() => {
    if (!user || !enabled) return null;
    if (!supabaseConfigured || user.isDemo)
      return localMessaging(user, products, orders);
    return {
      list: async () =>
        (await request<{ conversations: ListedConversation[] }>(""))
          .conversations,
      open: async (source) =>
        (await request<{ conversation: Conversation }>("", "POST", source))
          .conversation,
      detail: (id, before) =>
        request(`/${id}${before ? `?before=${before}` : ""}`),
      send: (id, body) => request(`/${id}`, "POST", body),
      update: (id, body) => request(`/${id}`, "PATCH", body),
      upload: async (id, file) => {
        const upload = await request<{
          id: string;
          path: string;
          token: string;
        }>(`/${id}/attachments`, "POST", {
          name: file.name,
          mimeType: file.type,
          size: file.size,
        });
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error("Le téléversement est indisponible.");
        const { error } = await client.storage
          .from("message-files")
          .uploadToSignedUrl(upload.path, upload.token, file, {
            contentType: file.type,
          });
        if (error) throw new Error("Le fichier n’a pas été envoyé. Réessayez.");
        return upload.id;
      },
      download: async (id, attachmentId) =>
        (
          await request<{ url: string }>(
            `/${id}/attachments?id=${attachmentId}`,
          )
        ).url,
    };
  }, [user, enabled, supabaseConfigured, products, orders]);
  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    api
      .list()
      .then((conversations) => {
        if (active) setState({ account: user.id, conversations, error: "" });
      })
      .catch((error) => {
        if (active)
          setState({
            account: user.id,
            conversations: [],
            error: error.message,
          });
      });
    return () => {
      active = false;
    };
  }, [api, user, revision]);
  useEffect(() => {
    if (!enabled || !user) return;
    const visibleRefresh = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    window.addEventListener("online", visibleRefresh);
    window.addEventListener("sellow-messages-change", visibleRefresh);
    const poll = window.setInterval(visibleRefresh, 15000);
    const client =
      supabaseConfigured && !user.isDemo ? getSupabaseBrowserClient() : null;
    const channel = client
      ?.channel(`sellow-messages:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        visibleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        visibleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        visibleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${user.id}`,
        },
        visibleRefresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") visibleRefresh();
      });
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
      window.removeEventListener("online", visibleRefresh);
      window.removeEventListener("sellow-messages-change", visibleRefresh);
      if (channel) void client?.removeChannel(channel);
    };
  }, [enabled, user, supabaseConfigured, refresh]);
  const conversations = state.account === user?.id ? state.conversations : [];
  return (
    <Context.Provider
      value={{
        enabled,
        api,
        conversations,
        unread: conversations.reduce((n, c) => n + c.unread, 0),
        revision,
        error: state.account === user?.id ? state.error : "",
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useMessaging = () => useContext(Context);
