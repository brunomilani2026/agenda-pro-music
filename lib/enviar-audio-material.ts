"use client";

// Envia uma gravação para a biblioteca de materiais (arquivo privado) e devolve o id do material,
// para ser usado como material de apoio da tarefa. Usa o mesmo caminho seguro da tela Materiais:
// o servidor valida e prepara o envio, o navegador envia direto ao armazenamento privado, e o
// servidor confere que o arquivo chegou antes de cadastrar.

import { createClient } from "@/lib/supabase/client";
import { concluirUpload, prepararUpload } from "@/app/(app)/materiais/actions";
import { mimeAudioAceito, mimeLimpo } from "@/lib/gravacao";

export async function enviarAudioComoMaterial(arquivo: File, titulo: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const mime = mimeLimpo(arquivo.type);
  if (!mimeAudioAceito(mime)) return { ok: false, error: "O formato de áudio gravado por este navegador não é aceito." };

  const prep = await prepararUpload({ nome: arquivo.name, mime, tamanho: arquivo.size });
  if (!prep.ok) return prep;

  const { error } = await createClient().storage.from("materials").uploadToSignedUrl(prep.path, prep.token, arquivo, { contentType: mime });
  if (error) return { ok: false, error: "Não foi possível enviar o áudio. Tente de novo." };

  const fim = await concluirUpload(prep.path, {
    title: `Áudio: ${titulo}`.slice(0, 160), category: "Áudio", description: "Gravado pelo professor para uma tarefa.", file_name: arquivo.name,
  });
  return fim.ok ? { ok: true, id: fim.id } : fim;
}
