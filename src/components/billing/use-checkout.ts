"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { apiRequest } from "@/lib/utils/client-api";

type PaddleGlobal = {
  Environment: { set: (env: string) => void };
  Initialize: (opts: { token: string }) => void;
  Checkout: { open: (opts: { transactionId: string; customer?: { email: string }; settings?: Record<string, unknown> }) => void };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";
let loader: Promise<PaddleGlobal> | null = null;
let initializedToken: string | null = null;

function loadPaddle(): Promise<PaddleGlobal> {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PADDLE_JS;
    script.async = true;
    script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle.js unavailable")));
    script.onerror = () => {
      loader = null;
      reject(new Error("Paddle.js failed to load"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

interface CheckoutResponse {
  purchaseId: string;
  transactionId: string;
  clientToken: string;
  environment: "sandbox" | "production";
  email: string;
}

/**
 * Opens Paddle's hosted checkout for a transaction created on the server. The
 * browser never decides what is purchased or whether it succeeded: the return
 * page polls the purchase, which only the signed webhook can mark as paid.
 */
export function useCheckout() {
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const start = async (product: string, opts: { projectId?: string; next?: string } = {}) => {
    setPending(product);
    setError(null);
    const res = await apiRequest<CheckoutResponse>("/api/billing/checkout", "POST", { product, projectId: opts.projectId });
    if (!res.ok || !res.data) {
      setPending(null);
      setError({ message: res.error ?? t.errors.checkoutFailed, code: res.code ?? undefined });
      return;
    }
    const data = res.data;
    try {
      const paddle = await loadPaddle();
      if (initializedToken !== data.clientToken) {
        if (data.environment === "sandbox") paddle.Environment.set("sandbox");
        paddle.Initialize({ token: data.clientToken });
        initializedToken = data.clientToken;
      }
      const next = opts.next ? `&next=${encodeURIComponent(opts.next)}` : "";
      paddle.Checkout.open({
        transactionId: data.transactionId,
        customer: { email: data.email },
        settings: { displayMode: "overlay", successUrl: `${window.location.origin}/billing/return?purchase=${data.purchaseId}${next}` },
      });
    } catch {
      setError({ message: t.errors.checkoutFailed });
    } finally {
      setPending(null);
    }
  };

  return { start, pending, error };
}
