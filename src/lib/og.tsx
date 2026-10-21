import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Shared pieces of the generated Open Graph images (1200×630). */
export const OG_SIZE = { width: 1200, height: 630 } as const;

type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: "normal" };

let fonts: Promise<OgFont[]> | undefined;

/** Inter in two subsets: latin plus latin-ext for ğ, ş, ı and İ. */
export function ogFonts(): Promise<OgFont[]> {
  fonts ??= Promise.all(
    (
      [
        ["inter-latin-500-normal.woff", 500],
        ["inter-latin-ext-500-normal.woff", 500],
        ["inter-latin-700-normal.woff", 700],
        ["inter-latin-ext-700-normal.woff", 700],
      ] as const
    ).map(async ([file, weight]) => {
      const buffer = await readFile(join(process.cwd(), "src/assets/fonts", file));
      return { name: "Inter", data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, weight, style: "normal" as const };
    }),
  );
  return fonts;
}

let logo: Promise<string> | undefined;

export function ogLogo(): Promise<string> {
  logo ??= readFile(join(process.cwd(), "public/brand/web-app-manifest-192x192.png")).then(
    (buffer) => `data:image/png;base64,${buffer.toString("base64")}`,
  );
  return logo;
}

export function OgFrame({ children, logoSrc }: { children: React.ReactNode; logoSrc: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 64px",
        background: "linear-gradient(135deg, #031a3b 0%, #022859 55%, #0b3f7f 100%)",
        color: "#ffffff",
        fontFamily: "Inter",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={56} height={56} style={{ borderRadius: 12 }} alt="" />
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
          mappy<span style={{ color: "#8fb4ff" }}>.news</span>
        </div>
      </div>
      {children}
    </div>
  );
}
