"use client";

import { Loader2, MapPinCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { type LocationValue, LocationPicker } from "@/components/map/location-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession } from "@/lib/auth/client";
import { submitVerification } from "@/server/actions/public";

export function VerifyLocationDialog({ newsId }: { newsId: string }) {
  const t = useTranslations("verify");
  const tErrors = useTranslations("errors");
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<LocationValue | undefined>();
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [pending, startTransition] = useTransition();

  if (!session?.user) {
    return (
      <Button asChild variant="outline" className="w-full gap-2">
        <Link href={{ pathname: "/sign-in", query: { next: pathname } }}>
          <MapPinCheck className="size-4" /> {t("cta")}
        </Link>
      </Button>
    );
  }

  function submit() {
    const text = address.trim() || location?.label || "";
    if (text.length < 5) {
      toast.error(t("addressRequired"));
      return;
    }
    startTransition(async () => {
      const result = await submitVerification({
        newsId,
        address: text,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        note: note.trim() || undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.message === "duplicate" ? t("duplicate") : tErrors(result.error));
        return;
      }
      toast.success(t("successTitle"), { description: t("successDescription") });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <MapPinCheck className="size-4" /> {t("cta")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <LocationPicker
            value={location}
            onChange={(value) => {
              setLocation(value);
              if (!address) setAddress(value.street ? `${value.street}, ${value.label}` : value.label);
            }}
          />
          <Field>
            <FieldLabel htmlFor="verify-address">{t("address")}</FieldLabel>
            <Input id="verify-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} placeholder={t("addressPlaceholder")} />
            <FieldDescription>{t("addressHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="verify-note">{t("note")}</FieldLabel>
            <Textarea id="verify-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} placeholder={t("notePlaceholder")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="verify-evidence">{t("evidence")}</FieldLabel>
            <Input id="verify-evidence" type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
