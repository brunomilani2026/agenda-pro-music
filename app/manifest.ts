import type { MetadataRoute } from "next";

// "Ficha" do app instalável (PWA): é o que o celular lê para criar o ícone na tela inicial.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/aluno/dashboard",
    name: "Agenda Pro Music",
    short_name: "Agenda Pro",
    description: "Suas aulas, tarefas, materiais e pagamentos em um só lugar.",
    lang: "pt-BR",
    start_url: "/aluno/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111827",
    theme_color: "#111827",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
