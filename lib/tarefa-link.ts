// Links de uma tarefa. Ficam no fim da descrição (um por linha), então não precisam de coluna nova no banco:
// o professor preenche o campo "Links" e a tela do aluno mostra cada um como botão.
// Descrições antigas, com o link digitado no meio do texto, também viram botão.
const RE_URL = /https?:\/\/[^\s<>"']+/gi;

/** Separa o texto (mantendo as quebras de linha) dos endereços http(s) que ele contém. */
export function dividirDescricao(descricao: string | null | undefined): { texto: string; links: string[] } {
  const bruto = (descricao ?? '').toString();
  const links: string[] = [];
  const semLinks = bruto.replace(RE_URL, (m) => {
    const limpo = m.replace(/[.,;:!?)\]]+$/, '');
    try {
      const u = new URL(limpo);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !links.includes(u.toString())) links.push(u.toString());
    } catch { /* inválido: some do texto e não vira botão */ }
    return '';
  });
  const texto = semLinks
    .split(/\r?\n/).map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  return { texto, links };
}

/** Monta a descrição que vai para o banco: texto + links (um por linha, separados por uma linha em branco). */
export function juntarDescricao(texto: string, links: string[]): string {
  return [texto.trim(), links.map(l => l.trim()).filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
}

/** Aceita "youtu.be/abc" (sem https) e devolve o endereço completo; null se vazio ou inválido. */
export function normalizarLink(entrada: string): { ok: true; url: string | null } | { ok: false } {
  const t = (entrada ?? '').trim();
  if (!t) return { ok: true, url: null };
  const comEsquema = /^https?:\/\//i.test(t) ? t : (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : '');
  if (!comEsquema) return { ok: false };
  try {
    const u = new URL(comEsquema);
    return u.protocol === 'http:' || u.protocol === 'https:' ? { ok: true, url: u.toString() } : { ok: false };
  } catch { return { ok: false }; }
}

/** Texto do botão conforme o endereço. */
export function rotuloDoLink(url: string, indice = 0, total = 1): string {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* segue com o genérico */ }
  const base = /youtu(\.be|be\.com)$/.test(host) ? 'Abrir vídeo' : host.endsWith('drive.google.com') || host.endsWith('docs.google.com') ? 'Abrir no Google Drive' : 'Abrir link';
  return total > 1 ? `${base} ${indice + 1}` : base;
}
