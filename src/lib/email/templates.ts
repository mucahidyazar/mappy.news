import { type Locale } from "@/i18n/routing";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const COPY = {
  tr: {
    verify: {
      subject: "mappy.news e-posta adresini doğrula",
      heading: "E-posta adresini doğrula",
      body: "mappy.news hesabını etkinleştirmek için aşağıdaki butona tıkla. Bağlantı 24 saat geçerlidir.",
      cta: "E-postamı doğrula",
    },
    reset: {
      subject: "mappy.news şifre sıfırlama",
      heading: "Şifreni sıfırla",
      body: "Hesabın için şifre sıfırlama isteği aldık. Yeni bir şifre belirlemek için aşağıdaki butona tıkla. Bağlantı 1 saat geçerlidir.",
      cta: "Yeni şifre belirle",
    },
    ignore: "Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin.",
    fallback: "Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:",
    footer: "mappy.news · Yerel olaylar, haritada.",
  },
  en: {
    verify: {
      subject: "Verify your mappy.news email address",
      heading: "Verify your email address",
      body: "Click the button below to activate your mappy.news account. The link is valid for 24 hours.",
      cta: "Verify my email",
    },
    reset: {
      subject: "Reset your mappy.news password",
      heading: "Reset your password",
      body: "We received a request to reset your password. Click the button below to choose a new one. The link is valid for 1 hour.",
      cta: "Choose a new password",
    },
    ignore: "If you didn't request this, you can safely ignore this email.",
    fallback: "If the button doesn't work, paste this link into your browser:",
    footer: "mappy.news · Local incidents, on the map.",
  },
} as const;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function layout(locale: Locale, heading: string, body: string, cta: string, url: string): EmailContent["html"] {
  const copy = COPY[locale];
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#f3f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1d33">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e8f0">
          <tr><td style="background:#022859;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em">mappy.news</td></tr>
          <tr><td style="padding:28px">
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3b4a63">${escapeHtml(body)}</p>
            <a href="${safeUrl}" style="display:inline-block;background:#022859;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${escapeHtml(cta)}</a>
            <p style="margin:24px 0 6px;font-size:13px;color:#6b7a90">${escapeHtml(copy.fallback)}</p>
            <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#6b7a90">${safeUrl}</p>
            <p style="margin:0;font-size:13px;color:#6b7a90">${escapeHtml(copy.ignore)}</p>
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e3e8f0;font-size:12px;color:#8a97ab">${escapeHtml(copy.footer)}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function build(locale: Locale, kind: "verify" | "reset", url: string): EmailContent {
  const copy = COPY[locale];
  const section = copy[kind];
  return {
    subject: section.subject,
    html: layout(locale, section.heading, section.body, section.cta, url),
    text: `${section.heading}\n\n${section.body}\n\n${url}\n\n${copy.ignore}`,
  };
}

export const verificationEmail = (locale: Locale, url: string) => build(locale, "verify", url);
export const resetPasswordEmail = (locale: Locale, url: string) => build(locale, "reset", url);
