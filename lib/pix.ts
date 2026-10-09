// ============================================================
// Pix estático (BR Code / "copia e cola") — substitui a cobrança do Asaas.
//
// Gera o payload no padrão do Banco Central e o QR Code correspondente.
// Não há baixa automática: o professor confere no extrato do banco e
// confirma o pagamento na tela do financeiro (PaymentService.settlePayment).
//
// Configuração (variáveis de ambiente, só no servidor):
//   PIX_CHAVE            chave Pix do professor (CPF/CNPJ só dígitos, e-mail, +55..., ou aleatória)
//   PIX_NOME_RECEBEDOR   nome como aparece no banco (até 25 caracteres)
//   PIX_CIDADE           cidade do recebedor (até 15 caracteres)
// ============================================================
import QRCode from 'qrcode';

export type PixEstatico = {
  /** Código "copia e cola". */
  payload: string;
  /** QR Code em PNG, base64 (sem o prefixo `data:`). */
  qrcodeBase64: string;
};

/** Texto simples exigido pelo BR Code: sem acentos, caixa alta, caracteres seguros. */
function limpar(texto: string, max: number): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/** Campo EMV: ID (2) + tamanho (2, decimal) + valor. */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), em hexadecimal maiúsculo de 4 dígitos. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function pixConfigurado(): boolean {
  return !!(process.env.PIX_CHAVE && process.env.PIX_CHAVE.trim());
}

/** Identificador da transação: só letras e números, até 25 caracteres. */
export function txidDoPagamento(paymentId: string): string {
  return paymentId.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
}

/** Monta o payload "copia e cola" de um Pix estático com valor fixo. */
export function montarPayloadPix(opts: { valor: number; txid: string }): string {
  const chave = (process.env.PIX_CHAVE || '').trim();
  if (!chave) throw new Error('PIX_CHAVE não configurada.');
  if (!(opts.valor > 0)) throw new Error('Valor do Pix inválido.');

  const nome = limpar(process.env.PIX_NOME_RECEBEDOR || 'RECEBEDOR', 25) || 'RECEBEDOR';
  const cidade = limpar(process.env.PIX_CIDADE || 'BRASIL', 15) || 'BRASIL';
  // Identificador da transação: o Inter (recebedor) recusou o Pix quando o QR
  // trazia um txid próprio; o QR gerado pelo próprio app dele usa "***" (sem
  // identificador). Reproduzimos o mesmo formato. O vínculo com a fatura é feito
  // pelo sistema (botão "Já paguei" + baixa manual), não pelo txid.
  const txid = '***';

  const contaPix = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const semCrc =
    campo('00', '01') +
    campo('01', '11') + // 11 = QR estático
    campo('26', contaPix) +
    campo('52', '0000') +
    campo('53', '986') + // BRL
    campo('54', opts.valor.toFixed(2)) +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cidade) +
    campo('62', campo('05', txid)) +
    '6304';

  return semCrc + crc16(semCrc);
}

/** Gera o Pix (payload + QR Code PNG em base64) de uma cobrança. */
export async function gerarPixEstatico(opts: { valor: number; txid: string }): Promise<PixEstatico> {
  const payload = montarPayloadPix(opts);
  const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
  return { payload, qrcodeBase64: dataUrl.replace(/^data:image\/png;base64,/, '') };
}
