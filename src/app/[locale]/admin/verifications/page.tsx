import { Check, ExternalLink, MapPin, X } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ActionButton } from "@/components/admin/action-button";
import { EmptyPanel, PageHeader } from "@/components/admin/page-header";
import { Pagination, parsePage } from "@/components/admin/pagination";
import { STATUS_BADGE } from "@/components/admin/status-styles";
import { RelativeTime } from "@/components/news/relative-time";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/session";
import { VERIFICATION_STATUSES, type VerificationStatus } from "@/lib/domain/constants";
import { distanceKm } from "@/lib/domain/location";
import { newsPath } from "@/lib/news/format";
import { cn } from "@/lib/utils";
import { listVerificationsForReview, PAGE_SIZE } from "@/server/admin/moderation";
import { approveVerification, rejectVerification } from "@/server/actions/admin-moderation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.verifications" });
  return { title: t("title") };
}

export default async function VerificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission("verifications.review");
  const search = await searchParams;
  const status: VerificationStatus = (VERIFICATION_STATUSES as readonly string[]).includes(search.status ?? "")
    ? (search.status as VerificationStatus)
    : "pending";
  const page = parsePage(search.page);
  const t = await getTranslations("admin.verifications");
  const tStatus = await getTranslations("profile.status");
  const { items, total } = await listVerificationsForReview(status, page);

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 flex gap-2">
        {VERIFICATION_STATUSES.map((value) => (
          <Link
            key={value}
            href={{ pathname: "/admin/verifications", query: value === "pending" ? {} : { status: value } }}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm",
              status === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {tStatus(value)}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyPanel title={t("empty")} />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const moved =
              item.latitude != null && item.longitude != null && item.newsLatitude != null && item.newsLongitude != null
                ? distanceKm({ latitude: item.latitude, longitude: item.longitude }, { latitude: item.newsLatitude, longitude: item.newsLongitude })
                : null;
            return (
              <li key={item.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <Link href={`/admin/news/${item.newsId}`} className="font-medium hover:underline">
                      {item.newsTitle}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t("current")}: {item.newsLocation} ·{" "}
                      <Link href={newsPath(item.newsSlug)} target="_blank" className="inline-flex items-center gap-0.5 hover:underline">
                        {t("viewStory")} <ExternalLink className="size-3" />
                      </Link>
                    </p>
                  </div>
                  <Badge variant="outline" className={STATUS_BADGE[item.status]}>
                    {tStatus(item.status)}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 rounded-xl bg-muted/50 p-3 text-sm md:grid-cols-[1fr_auto]">
                  <div className="space-y-1">
                    <p className="flex items-start gap-1.5 font-medium">
                      <MapPin className="mt-0.5 size-4 shrink-0" /> {item.address}
                    </p>
                    {item.latitude != null && item.longitude != null ? (
                      <p className="text-xs text-muted-foreground">
                        {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                        {moved != null ? ` · ${t("distance", { km: moved.toFixed(1) })}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("noPin")}</p>
                    )}
                    {item.note ? <p className="text-xs">{item.note}</p> : null}
                    {item.evidenceUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs underline">
                        {url}
                      </a>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground md:text-right">
                    <p className="font-medium text-foreground">{item.userName}</p>
                    <p>{item.userEmail}</p>
                    <p>
                      {t("points", { points: item.userPoints })} · <RelativeTime value={item.createdAt} />
                    </p>
                  </div>
                </div>
                {item.status === "pending" ? (
                  <div className="mt-3 flex justify-end gap-2">
                    <ActionButton variant="outline" size="sm" action={rejectVerification.bind(null, { id: item.id })} success={t("rejected")}>
                      <X className="size-4" /> {t("reject")}
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      action={approveVerification.bind(null, { id: item.id })}
                      success={t("approved")}
                      errorMessages={{ geocode: t("geocodeFailed") }}
                    >
                      <Check className="size-4" /> {t("approve")}
                    </ActionButton>
                  </div>
                ) : item.reviewNote ? (
                  <p className="mt-2 text-xs text-muted-foreground">{item.reviewNote}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Pagination pathname="/admin/verifications" query={{ status: status === "pending" ? undefined : status }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
