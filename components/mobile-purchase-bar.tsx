"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { formatPrice } from "@/components/product-card";
import type { Product } from "@/lib/types";

type MobilePurchaseBarProps = {
  product: Product;
  label: string;
  checkoutHref: string;
  purchaseRef: RefObject<HTMLAnchorElement | null>;
};

export function MobilePurchaseBar({ product, label, checkoutHref, purchaseRef }: MobilePurchaseBarProps) {
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const purchase = purchaseRef.current;
    if (!purchase || !("IntersectionObserver" in window)) return;
    const mobile = window.matchMedia("(max-width: 780px)");
    let observer: IntersectionObserver;
    const observePosition = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(([entry]) => {
        setVisible(mobile.matches && !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
      }, {
        threshold: 0,
        // Include the area below the screen so a jump directly from above to
        // below the button still crosses an observer boundary. Only passing
        // the TOP of the actual viewport can activate the purchase bar.
        rootMargin: `0px 0px ${Math.max(document.documentElement.scrollHeight, window.innerHeight)}px 0px`,
      });
      observer.observe(purchase);
    };
    const updateViewport = () => {
      observePosition();
      setVisible(mobile.matches && purchase.getBoundingClientRect().bottom <= 0);
    };
    observePosition();
    mobile.addEventListener("change", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      observer.disconnect();
      mobile.removeEventListener("change", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [purchaseRef]);

  useEffect(() => {
    const bar = barRef.current;
    if (!visible || !bar) return;
    // Reserve the actual height, including wrapping labels and device safe areas.
    const updateHeight = () => document.body.style.setProperty("--mobile-purchase-bar-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    document.body.dataset.mobilePurchaseBar = "true";
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      delete document.body.dataset.mobilePurchaseBar;
      document.body.style.removeProperty("--mobile-purchase-bar-height");
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="mobile-purchase-bar" ref={barRef} role="region" aria-label="Achat rapide">
      <div className="mobile-purchase-inner">
        <p className="mobile-purchase-price">
          <span className="sr-only">Prix : </span>{formatPrice(product.price, product.currency)}
          {product.kind === "membership" && <small> / mois</small>}
        </p>
        <Link className="button button-dark" href={checkoutHref}>
          <span>{label}</span><ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
