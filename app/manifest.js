export default function manifest() {
  return {
    name: "ERP Renovables",
    short_name: "ERP Renovables",
    description: "Sistema de gestión para BSI Renovables",
    start_url: "/",
    display: "standalone",
    background_color: "#1b3b57",
    theme_color: "#1b3b57",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
