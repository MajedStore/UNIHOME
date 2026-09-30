import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "يوني هوم",
    short_name: "يوني هوم",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9f8",
    theme_color: "#17645b",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
