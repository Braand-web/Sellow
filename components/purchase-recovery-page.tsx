"use client";
import { useEffect, useState } from "react";
import { EmailAccessForm } from "@/components/email-access-form";

export function PurchaseRecoveryPage({ enabled }: { enabled: boolean }) {
  const [orderId, setOrderId] = useState<string | undefined>();
  const [next, setNext] = useState<string | undefined>();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => { setOrderId(params.get("commande") ?? undefined); setNext(params.get("next") ?? undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <section className="form-shell auth-shell"><p className="page-eyebrow">Votre bibliothèque Sellow</p><h1>Retrouvez vos achats</h1><p>Saisissez l’adresse utilisée pour acheter. Un code vous permettra de retrouver vos contenus sur cet appareil.</p><EmailAccessForm orderId={orderId} next={next} enabled={enabled} /></section>;
}
