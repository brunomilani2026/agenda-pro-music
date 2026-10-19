// Envio de e-mail pela API do Brevo: modelo do e-mail (HTML + texto) e corpo da requisição.
// Módulo puro (sem rede): o envio de fato fica em services/email.service.ts.
// O HTML espelha email-templates/emailjs/notification.html, com tudo escapado (título, nome, texto e link vêm de dados do sistema).

export type DadosEmail = {
  title: string;
  toName?: string;
  message: string;
  buttonLabel: string;
  buttonUrl: string;
};

export const REMETENTE_PADRAO = { name: 'Agenda Pro Music', email: 'notificacoes@agendapromusic.com.br' };

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Só http(s) vira link; qualquer outra coisa (javascript:, data:) cai para "#". */
const urlSegura = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : '#');

/** Texto do aviso: quebras de linha viram <br> (funciona no Outlook) e endereços http(s) viram links clicáveis. */
function mensagemHtml(msg: string): string {
  const partes = esc(msg).split(/(https?:\/\/[^\s<]+)/g);
  return partes.map((p, i) => {
    if (i % 2 === 0) return p.replace(/\r?\n/g, '<br>');
    // Pontuação colada no fim do endereço não faz parte dele.
    const m = p.match(/^(.*?)([.,;:!?)]*)$/);
    const url = m ? m[1] : p;
    const resto = m ? m[2] : '';
    return `<a href="${url}" target="_blank" style="color:#b45309;font-weight:700;">${url}</a>${resto}`;
  }).join('');
}

export function renderEmailHtml(d: DadosEmail): string {
  const titulo = esc(d.title);
  const nome = esc((d.toName || '').trim());
  const botao = esc(d.buttonLabel);
  const link = esc(urlSegura(d.buttonUrl));
  const fonte = "font-family:'Segoe UI',Helvetica,Arial,sans-serif;";
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${titulo}</title>
<style>@media screen and (max-width:600px){.sm-w-full{width:100% !important}.sm-px-24{padding-left:24px !important;padding-right:24px !important}.sm-text-title{font-size:24px !important}}</style></head>
<body style="margin:0;padding:0;width:100%;background-color:#e7e5e4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${titulo}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#e7e5e4;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" class="sm-w-full" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:20px;overflow:hidden;">
<tr><td class="sm-px-24" style="background-color:#18181b;padding:40px 40px 36px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding-bottom:18px;"><img src="https://www.agendapromusic.com.br/email-logo.png" width="56" height="56" alt="Agenda Pro Music" style="display:block;width:56px;height:56px;border-radius:12px;background-color:#ffffff;"></td></tr>
<tr><td style="${fonte}font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#f59e0b;padding-bottom:14px;">🎵 Agenda Pro Music</td></tr>
<tr><td class="sm-text-title" style="${fonte}font-size:28px;line-height:1.25;font-weight:800;color:#fbbf24;">${titulo}</td></tr>
<tr><td style="padding-top:18px;"><div style="width:56px;height:4px;background-color:#f59e0b;border-radius:999px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
</table></td></tr>
<tr><td class="sm-px-24" style="padding:40px 40px 8px;">
<p style="margin:0 0 20px;${fonte}font-size:18px;font-weight:700;color:#18181b;">Olá${nome ? `, ${nome}` : ''}! 👋</p>
<p style="margin:0;${fonte}font-size:16px;line-height:1.65;color:#52525b;">${mensagemHtml(d.message)}</p>
</td></tr>
<tr><td class="sm-px-24" style="padding:32px 40px 40px;" align="left">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background-color:#f59e0b;">
<a href="${link}" target="_blank" style="display:inline-block;padding:16px 36px;${fonte}font-size:16px;font-weight:700;line-height:1;color:#18181b;text-decoration:none;border-radius:12px;"><span style="color:#18181b;">${botao}</span></a>
</td></tr></table></td></tr>
<tr><td class="sm-px-24" style="padding:0 40px;"><div style="height:1px;background-color:#f4f4f5;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td class="sm-px-24" style="padding:28px 40px 36px;">
<p style="margin:0 0 6px;${fonte}font-size:13px;line-height:1.6;color:#a1a1aa;">Você recebeu este e-mail porque tem uma conta na <strong style="color:#71717a;">Agenda Pro Music</strong>.</p>
<p style="margin:0;${fonte}font-size:13px;line-height:1.6;color:#a1a1aa;">E-mail automático — por favor, não responda.</p>
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" width="600" class="sm-w-full" style="width:600px;max-width:600px;"><tr><td align="center" style="padding:24px 16px 8px;${fonte}font-size:12px;color:#a8a29e;">© Agenda Pro Music · agendapromusic.com.br</td></tr></table>
</td></tr></table></body></html>`;
}

export function renderEmailTexto(d: DadosEmail): string {
  const nome = (d.toName || '').trim();
  return `Olá${nome ? `, ${nome}` : ''}!\n\n${d.title}\n\n${d.message}\n\n${d.buttonLabel}: ${urlSegura(d.buttonUrl)}\n\n—\nAgenda Pro Music · E-mail automático, por favor não responda.`;
}

export type CorpoBrevo = {
  sender: { name: string; email: string };
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent: string;
  tags: string[];
};

export function montarCorpoBrevo(d: DadosEmail & { toEmail: string }, remetente = REMETENTE_PADRAO, tags: string[] = ['notificacao']): CorpoBrevo {
  const nome = (d.toName || '').trim();
  return {
    sender: remetente,
    to: [nome ? { email: d.toEmail.trim(), name: nome } : { email: d.toEmail.trim() }],
    subject: d.title,
    htmlContent: renderEmailHtml(d),
    textContent: renderEmailTexto(d),
    tags,
  };
}
