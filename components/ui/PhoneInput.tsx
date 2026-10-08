'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY_ISO2, findCountryByIso2, matchCountryByDialPrefix, flagEmoji } from '@/lib/countries';
import { maskPhone, stripBrazilDdi } from '@/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  placeholder?: string;
  selectClassName?: string;
  inputClassName?: string;
  id?: string;
}

// Máscara só para BR e só quando o número cabe no formato nacional (<= 11
// dígitos) — nunca deixa maskPhone truncar dígitos de um valor carregado.
function displayNational(iso2: string, digits: string): string {
  return iso2 === 'BR' && digits.length <= 11 ? maskPhone(digits) : digits;
}

// Aceita tanto o formato novo ("+5511999990000") quanto o legado, salvo antes
// do seletor de país existir — só dígitos, com ou sem o DDI 55 na frente.
// Retorna o nacional já pronto para exibição (mascarado quando BR).
function parseValue(value: string): { iso2: string; national: string } {
  if (!value) return { iso2: DEFAULT_COUNTRY_ISO2, national: '' };
  if (value.startsWith('+')) {
    const digits = value.slice(1).replace(/\D/g, '');
    const country = matchCountryByDialPrefix(digits);
    if (country) return { iso2: country.iso2, national: displayNational(country.iso2, digits.slice(country.dial.length)) };
    return { iso2: DEFAULT_COUNTRY_ISO2, national: digits };
  }
  const digits = stripBrazilDdi(value.replace(/\D/g, ''));
  return { iso2: DEFAULT_COUNTRY_ISO2, national: displayNational(DEFAULT_COUNTRY_ISO2, digits) };
}

export default function PhoneInput({
  value,
  onChange,
  onBlur,
  required,
  placeholder,
  selectClassName = '',
  inputClassName = '',
  id,
}: PhoneInputProps) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const [iso2, setIso2] = useState(parsed.iso2);
  const [national, setNational] = useState(parsed.national);
  const lastEmittedRef = useRef<string | null>(null);

  // Resincroniza quando o valor externo muda por outro motivo que não a
  // digitação aqui dentro (ex.: abrir o formulário de edição de outro aluno).
  // O eco da própria digitação é ignorado — senão a máscara seria apagada a
  // cada tecla pelos dígitos crus de parseValue.
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    setIso2(parsed.iso2);
    setNational(parsed.national);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (nextIso2: string, nextNational: string) => {
    const digits = nextNational.replace(/\D/g, '');
    const next = digits ? `+${findCountryByIso2(nextIso2).dial}${digits}` : '';
    lastEmittedRef.current = next;
    onChange(next);
  };

  const handleCountryChange = (nextIso2: string) => {
    const digits = national.replace(/\D/g, '');
    const formatted = displayNational(nextIso2, digits);
    setIso2(nextIso2);
    setNational(formatted);
    emit(nextIso2, formatted);
  };

  const handleNumberChange = (raw: string) => {
    // Máscara BR só faz sentido pro formato nacional brasileiro; os demais
    // países variam demais (e não temos lib de telefone) — só filtra dígitos.
    // stripBrazilDdi cobre colar o número internacional completo no campo.
    const formatted = iso2 === 'BR'
      ? maskPhone(stripBrazilDdi(raw.replace(/\D/g, '')))
      : raw.replace(/[^\d\s-]/g, '');
    setNational(formatted);
    emit(iso2, formatted);
  };

  return (
    <div className="flex gap-2">
      <select
        id={id ? `${id}-country` : undefined}
        value={iso2}
        onChange={e => handleCountryChange(e.target.value)}
        className={selectClassName}
      >
        {COUNTRIES.map(c => (
          <option key={c.iso2} value={c.iso2}>
            {flagEmoji(c.iso2)} +{c.dial}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        required={required}
        value={national}
        onChange={e => handleNumberChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || (iso2 === 'BR' ? '(11) 99999-0000' : 'Número')}
        className={inputClassName}
      />
    </div>
  );
}
