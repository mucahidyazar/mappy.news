"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

function XMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.4L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 1.9 2.9 4.6 4.1 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z" />
    </svg>
  );
}

const subscribeNever = () => () => {};
const canUseNativeShare = () => typeof navigator.share === "function";

export function ShareButtons({ title, url }: { title: string; url: string }) {
  const t = useTranslations("story");
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(subscribeNever, canUseNativeShare, () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; nothing else to do.
    }
  }

  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(title);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
        {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
        {copied ? t("copied") : t("copyLink")}
      </Button>
      <Button variant="outline" size="icon-sm" asChild aria-label={t("shareOnX")}>
        <a href={`https://x.com/intent/post?text=${text}&url=${encoded}`} target="_blank" rel="noopener noreferrer">
          <XMark />
        </a>
      </Button>
      <Button variant="outline" size="icon-sm" asChild aria-label={t("shareOnWhatsApp")}>
        <a href={`https://wa.me/?text=${text}%20${encoded}`} target="_blank" rel="noopener noreferrer">
          <WhatsAppMark />
        </a>
      </Button>
      {canShare ? (
        <Button variant="outline" size="icon-sm" aria-label={t("share")} onClick={() => void navigator.share({ title, url }).catch(() => {})}>
          <Share2 className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function ViewPing({ newsId }: { newsId: string }) {
  useEffect(() => {
    const key = `mappy:viewed:${newsId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode without storage still counts once per load.
    }
    void fetch(`/api/news/${newsId}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [newsId]);
  return null;
}
