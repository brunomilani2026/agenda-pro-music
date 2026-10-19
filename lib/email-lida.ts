// Liga cada e-mail registrado ao aviso do app que saiu junto (mesmo aluno, mesmo título, horário próximo)
// para mostrar se o aluno LEU o aviso. Não diz se o e-mail foi aberto: isso não é confiável.
export type AvisoLeitura = { id: string; title: string; created_at: string; read: boolean; read_at: string | null };
export type EmailParaPar = { id: string; title: string; created_at: string };
export type Leitura = { lida: boolean; lida_em: string | null };

const JANELA_MS = 10 * 60 * 1000;

/** Para cada e-mail, o aviso de mesmo título mais próximo no tempo (dentro de 10 min), sem reaproveitar aviso. */
export function parearLeitura(emails: EmailParaPar[], avisos: AvisoLeitura[]): Map<string, Leitura> {
  const out = new Map<string, Leitura>();
  const usados = new Set<string>();
  const t = (iso: string) => new Date(iso).getTime();
  // Do mais recente ao mais antigo: cada e-mail pega o aviso mais próximo ainda livre.
  for (const e of [...emails].sort((a, b) => t(b.created_at) - t(a.created_at))) {
    let melhor: AvisoLeitura | null = null; let dist = Infinity;
    for (const a of avisos) {
      if (usados.has(a.id) || a.title !== e.title) continue;
      const d = Math.abs(t(a.created_at) - t(e.created_at));
      if (d <= JANELA_MS && d < dist) { melhor = a; dist = d; }
    }
    if (melhor) { usados.add(melhor.id); out.set(e.id, { lida: !!melhor.read, lida_em: melhor.read ? melhor.read_at : null }); }
  }
  return out;
}

/** "Não lida há N dias" só a partir de 3 dias; senão null. */
export function diasSemLer(createdIso: string, agoraMs: number = Date.now()): number | null {
  const dias = Math.floor((agoraMs - new Date(createdIso).getTime()) / 86400000);
  return dias >= 3 ? dias : null;
}
