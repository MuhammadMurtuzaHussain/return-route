import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Return Route",
    short_name: "Return Route",
    description: "Plan a walk that pays: pick up deposit cans and bottles on the way to a return machine.",
    start_url: "/",
    display: "standalone",
    background_color: "#edf1ec",
    theme_color: "#1f4d33",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
