// Service worker do Agenda Pro Music. Por enquanto só deixa o app instalável e pronto para receber avisos.
// Não guarda páginas em cache de propósito: o aluno sempre vê as aulas e os pagamentos atualizados.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
