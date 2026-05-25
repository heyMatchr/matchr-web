import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#0B1F17",
    description: "A private premium social and dating experience.",
    display: "standalone",
    icons: [
      {
        sizes: "192x192",
        src: "/matchr-icon-192.png",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/matchr-icon-512.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/matchr-maskable-512.png",
        type: "image/png",
      },
    ],
    name: "Matchr",
    orientation: "portrait",
    short_name: "Matchr",
    start_url: "/",
    theme_color: "#0B1F17",
  };
}
