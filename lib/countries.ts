// Lista de países para o seletor de DDI do campo de telefone. Brasil primeiro
// (público majoritário do app), depois ordem alfabética por nome em pt-BR.
export interface Country {
  iso2: string;
  name: string;
  dial: string;
}

export const COUNTRIES: Country[] = [
  { iso2: 'BR', name: 'Brasil', dial: '55' },
  { iso2: 'AR', name: 'Argentina', dial: '54' },
  { iso2: 'AU', name: 'Austrália', dial: '61' },
  { iso2: 'AT', name: 'Áustria', dial: '43' },
  { iso2: 'BE', name: 'Bélgica', dial: '32' },
  { iso2: 'BO', name: 'Bolívia', dial: '591' },
  { iso2: 'CA', name: 'Canadá', dial: '1' },
  { iso2: 'CL', name: 'Chile', dial: '56' },
  { iso2: 'CN', name: 'China', dial: '86' },
  { iso2: 'CO', name: 'Colômbia', dial: '57' },
  { iso2: 'KR', name: 'Coreia do Sul', dial: '82' },
  { iso2: 'CR', name: 'Costa Rica', dial: '506' },
  { iso2: 'HR', name: 'Croácia', dial: '385' },
  { iso2: 'DK', name: 'Dinamarca', dial: '45' },
  { iso2: 'EC', name: 'Equador', dial: '593' },
  { iso2: 'EG', name: 'Egito', dial: '20' },
  { iso2: 'SV', name: 'El Salvador', dial: '503' },
  { iso2: 'ES', name: 'Espanha', dial: '34' },
  { iso2: 'US', name: 'Estados Unidos', dial: '1' },
  { iso2: 'FI', name: 'Finlândia', dial: '358' },
  { iso2: 'FR', name: 'França', dial: '33' },
  { iso2: 'DE', name: 'Alemanha', dial: '49' },
  { iso2: 'GR', name: 'Grécia', dial: '30' },
  { iso2: 'GT', name: 'Guatemala', dial: '502' },
  { iso2: 'NL', name: 'Holanda (Países Baixos)', dial: '31' },
  { iso2: 'HN', name: 'Honduras', dial: '504' },
  { iso2: 'HU', name: 'Hungria', dial: '36' },
  { iso2: 'IN', name: 'Índia', dial: '91' },
  { iso2: 'ID', name: 'Indonésia', dial: '62' },
  { iso2: 'IE', name: 'Irlanda', dial: '353' },
  { iso2: 'IS', name: 'Islândia', dial: '354' },
  { iso2: 'IL', name: 'Israel', dial: '972' },
  { iso2: 'IT', name: 'Itália', dial: '39' },
  { iso2: 'JP', name: 'Japão', dial: '81' },
  { iso2: 'LU', name: 'Luxemburgo', dial: '352' },
  { iso2: 'MY', name: 'Malásia', dial: '60' },
  { iso2: 'MA', name: 'Marrocos', dial: '212' },
  { iso2: 'MX', name: 'México', dial: '52' },
  { iso2: 'MZ', name: 'Moçambique', dial: '258' },
  { iso2: 'NO', name: 'Noruega', dial: '47' },
  { iso2: 'NZ', name: 'Nova Zelândia', dial: '64' },
  { iso2: 'PA', name: 'Panamá', dial: '507' },
  { iso2: 'PY', name: 'Paraguai', dial: '595' },
  { iso2: 'PE', name: 'Peru', dial: '51' },
  { iso2: 'PL', name: 'Polônia', dial: '48' },
  { iso2: 'PT', name: 'Portugal', dial: '351' },
  { iso2: 'GB', name: 'Reino Unido', dial: '44' },
  { iso2: 'CZ', name: 'República Tcheca', dial: '420' },
  { iso2: 'DO', name: 'República Dominicana', dial: '1' },
  { iso2: 'RO', name: 'Romênia', dial: '40' },
  { iso2: 'RU', name: 'Rússia', dial: '7' },
  { iso2: 'SG', name: 'Singapura', dial: '65' },
  { iso2: 'ZA', name: 'África do Sul', dial: '27' },
  { iso2: 'SE', name: 'Suécia', dial: '46' },
  { iso2: 'CH', name: 'Suíça', dial: '41' },
  { iso2: 'TH', name: 'Tailândia', dial: '66' },
  { iso2: 'TR', name: 'Turquia', dial: '90' },
  { iso2: 'UY', name: 'Uruguai', dial: '598' },
  { iso2: 'VE', name: 'Venezuela', dial: '58' },
  { iso2: 'AO', name: 'Angola', dial: '244' },
  { iso2: 'CV', name: 'Cabo Verde', dial: '238' },
  { iso2: 'GW', name: 'Guiné-Bissau', dial: '245' },
  { iso2: 'ST', name: 'São Tomé e Príncipe', dial: '239' },
  { iso2: 'TL', name: 'Timor-Leste', dial: '670' },
];

export const DEFAULT_COUNTRY_ISO2 = 'BR';

export function findCountryByIso2(iso2: string): Country {
  return COUNTRIES.find(c => c.iso2 === iso2) ?? COUNTRIES[0];
}

// Casa o maior DDI conhecido no início de uma string só de dígitos (sem '+').
// Ex.: "5511999990000" -> Brasil (55), não confunde com um DDI de 1 dígito
// que por acaso também bata no começo.
export function matchCountryByDialPrefix(digits: string): Country | null {
  let best: Country | null = null;
  for (const c of COUNTRIES) {
    if (digits.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) {
      best = c;
    }
  }
  return best;
}

// Gera o emoji de bandeira a partir do código ISO 3166-1 alpha-2 via regional
// indicator symbols — sem depender de imagem ou lib externa.
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
