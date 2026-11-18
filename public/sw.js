// Service worker do Agenda Pro Music: deixa o app instalável e recebe os avisos no celular (aula, pagamento…).
// Não guarda páginas em cache de propósito: o aluno sempre vê as aulas e os pagamentos atualizados.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = { body: event.data ? event.data.text() : "" }; }
  const titulo = dados.title || "Agenda Pro Music";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: dados.url || "/aluno/notificacoes" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/aluno/notificacoes";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if ("focus" in aba) {
          aba.navigate(destino).catch(() => {});
          return aba.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
