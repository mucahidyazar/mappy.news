import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "mappy.news",
    short_name: "mappy.news",
    description: "Türkiye'deki yerel olaylar haritada · Local incidents across Turkey, on a map",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9fc",
    theme_color: "#022859",
    lang: "tr",
    categories: ["news"],
    icons: [
      { src: "/brand/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
