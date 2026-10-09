"use client";
import Link from "next/link";
import { ChatCircle } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { useMessaging } from "@/components/messaging-provider";
export function ContactSellerButton({
  productId,
  orderId,
  sellerId,
  remote = true,
}: {
  productId?: string;
  orderId?: string;
  sellerId?: string;
  remote?: boolean;
}) {
  const { user, supabaseConfigured } = useMarketplace();
  const { enabled } = useMessaging();
  if (!enabled || user?.id === sellerId || (supabaseConfigured && !remote))
    return null;
  const query = new URLSearchParams(
    orderId
      ? { commande: orderId }
      : productId
        ? { produit: productId }
        : sellerId
          ? { vendeur: sellerId }
          : {},
  );
  const next = `/messages?${query}`;
  return (
    <Link
      className="button button-light button-small contact-seller"
      href={user ? next : `/connexion?next=${encodeURIComponent(next)}`}
    >
      <ChatCircle size={18} aria-hidden="true" />
      Contacter le vendeur
    </Link>
  );
}
