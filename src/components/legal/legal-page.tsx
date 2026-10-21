import { getFormatter } from "next-intl/server";

import { Page, PageIntro } from "@/components/layout/container";
import { LEGAL_UPDATED_AT, type LegalDocument } from "@/content/legal";

export async function LegalPage({ document, contactEmail }: { document: LegalDocument; contactEmail?: string }) {
  const format = await getFormatter();
  return (
    <Page>
      <PageIntro
        title={document.title}
        description={
          <>
            {document.description}
            <span className="mt-2 block text-sm">
              {document.updated}: {format.dateTime(new Date(`${LEGAL_UPDATED_AT}T12:00:00Z`), { dateStyle: "long" })}
            </span>
          </>
        }
      />
      <article className="max-w-3xl space-y-8">
        {document.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed text-foreground/85">
                {paragraph}
              </p>
            ))}
            {section.items ? (
              <ul className="list-disc space-y-2 pl-5 leading-relaxed text-foreground/85 marker:text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        {contactEmail ? (
          <p className="rounded-xl border bg-card p-4 text-sm">
            <a href={`mailto:${contactEmail}`} className="font-medium underline underline-offset-4">
              {contactEmail}
            </a>
          </p>
        ) : null}
      </article>
    </Page>
  );
}
