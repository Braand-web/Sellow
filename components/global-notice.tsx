"use client";

import { useEffect } from "react";
import { X } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";

export function GlobalNotice() {
  const { message, setMessage } = useMarketplace();
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [message, setMessage]);
  if (!message) return null;
  return <div className="toast-message" role="status"><span>{message}</span><button type="button" onClick={() => setMessage(null)} aria-label="Fermer le message"><X size={16} /></button></div>;
}
