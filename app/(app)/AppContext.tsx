"use client";

import {
  createContext, useContext, useState, useCallback, useMemo, useRef,
  type Dispatch, type SetStateAction, type ReactNode,
} from "react";
import { Lesson } from "@/types/lesson";
import {
  mergeRange, rangeCovers, missingSubRanges, type LessonWindow,
} from "@/lib/lesson-window";
import type { InitialAppData } from "./initial-data";
import { fetchAgendaLessonsInRange, fetchTeacherPayments, fetchAgendaStudents } from "./agenda/actions";

export type PaymentMethod = "Pix" | "Dinheiro" | "Cartão" | "Transferência";

export interface Student {
  id: string;
  name: string;
  phone: string;
  email: string;
  instrument: string;
  lessonPrice: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  /** 'bloqueado' vem do banco na inadimplência — a UI de alunos só oferece ativo/inativo. */
  status: "ativo" | "inativo" | "bloqueado";
  totalLessons?: number;
  usedLessons?: number;
  cpf?: string;
  packagetype?: string;
  expirationdate?: string;
  discountType?: "percent" | "fixed";
  discountValue?: number; // desconto nas compras de créditos (0 = sem desconto)
}

export interface Payment {
  id: string;
  studentName: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  notes?: string;
  status: "pago" | "pendente" | "vencido" | "renegociado" | "cancelado";
  renegotiated_from?: string | null;
}

/** Mapeia o pagamento cru do servidor para o formato da UI. */
export function mapPayments(raw: any[]): Payment[] {
  return raw.map((p: any) => ({
    id: p.id,
    studentName: p.studentName,
    amount: p.amount,
    date: p.duedate,
    method: p.method as PaymentMethod,
    status: p.status as Payment['status'],
    notes: p.notes,
    renegotiated_from: p.renegotiated_from ?? null,
  }));
}

interface AppContextData {
  students: Student[];
  setStudents: Dispatch<SetStateAction<Student[]>>;
  lessons: Lesson[];
  setLessons: Dispatch<SetStateAction<Lesson[]>>;
  payments: Payment[];
  setPayments: Dispatch<SetStateAction<Payment[]>>;
  teacherProfile: any;
  setTeacherProfile: Dispatch<SetStateAction<any>>;
  instruments: string[];
  setInstruments: Dispatch<SetStateAction<string[]>>;
  pendingRequestsCount: number;
  isLoaded: boolean;

  // ─── Janela de aulas ───────────────────────────────────────
  /** true se todas as datas de [from, to] já estiverem em `lessons`. */
  isRangeLoaded: (from: string, to: string) => boolean;
  /** Busca e mescla o que faltar de [from, to]. Idempotente e deduplicado. */
  ensureRangeLoaded: (from: string, to: string) => Promise<void>;
  /** Mescla aulas por id, preservando as otimistas (`temp-`). */
  mergeLessons: (incoming: Lesson[]) => void;
  /** Recarrega do servidor tudo que já está carregado (pós-mutação). */
  reloadLoadedLessons: () => Promise<void>;

  /** Recarrega pagamentos; `maxAgeMs` evita refetch logo após o seed. */
  refreshPayments: (opts?: { maxAgeMs?: number }) => Promise<void>;

  /**
   * Recarrega alunos; `maxAgeMs` evita refetch logo após o seed.
   * Necessário porque `expirationdate` e `status` mudam por fora da tela
   * (baixa de pagamento, cron de cobrança, webhook) e a lista ficava velha
   * até um F5 — o professor via o vencimento antigo depois de dar baixa.
   */
  refreshStudents: (opts?: { maxAgeMs?: number }) => Promise<void>;
}

const AppContext = createContext<AppContextData | undefined>(undefined);

export function AppProvider({
  children,
  usertype,
  initialData,
}: {
  children: ReactNode;
  usertype?: string;
  initialData: InitialAppData | null;
}) {
  // Semeado pelo servidor (layout) — não há mais useEffect de boot, então a
  // primeira pintura já sai com dados. O admin não consome nada disto e chega
  // com initialData=null de propósito.
  const [students, setStudents] = useState<Student[]>(() => initialData?.students ?? []);
  const [lessons, setLessons] = useState<Lesson[]>(() => initialData?.lessons ?? []);
  const [payments, setPayments] = useState<Payment[]>(() => mapPayments(initialData?.payments ?? []));
  const [teacherProfile, setTeacherProfile] = useState<any>(() => initialData?.profile ?? null);
  const [instruments, setInstruments] = useState<string[]>(() => initialData?.instruments ?? []);
  const [pendingRequestsCount] = useState(() => initialData?.pendingRequests.length ?? 0);
  const isLoaded = initialData !== null || usertype === 'admin';

  // Intervalos de datas já carregados em `lessons`.
  const loadedRangesRef = useRef<LessonWindow[]>(initialData ? [initialData.lessonWindow] : []);
  // Buscas em voo, por chave de intervalo — clicar rápido em «semana anterior»
  // não deve disparar a mesma busca várias vezes.
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  const paymentsFetchedAtRef = useRef(initialData?.seededAt ?? 0);
  const studentsFetchedAtRef = useRef(initialData?.seededAt ?? 0);

  /**
   * Mescla por id. Ids otimistas são `temp-…` e nunca colidem com UUID, então
   * uma aula recém-criada sobrevive à chegada de uma semana buscada em paralelo.
   * Nada é removido aqui — quem limpa os `temp-` é reloadLoadedLessons().
   */
  const mergeLessons = useCallback((incoming: Lesson[]) => {
    if (!incoming.length) return;
    setLessons(prev => {
      const byId = new Map(prev.map(l => [l.id, l]));
      for (const l of incoming) byId.set(l.id, l); // servidor vence em id real
      return Array.from(byId.values());
    });
  }, []);

  const isRangeLoaded = useCallback(
    (from: string, to: string) => rangeCovers(loadedRangesRef.current, from, to),
    []
  );

  const ensureRangeLoaded = useCallback(async (from: string, to: string) => {
    const gaps = missingSubRanges(loadedRangesRef.current, from, to);
    if (!gaps.length) return;

    const key = `${from}_${to}`;
    const pending = inFlightRef.current.get(key);
    if (pending) return pending;

    const task = (async () => {
      const results = await Promise.all(
        gaps.map(g => fetchAgendaLessonsInRange(g.from, g.to))
      );
      mergeLessons(results.flat());
      // Só marca como carregado APÓS o merge — se alguém chamar isRangeLoaded
      // no meio, a resposta correta ainda é "não".
      for (const g of gaps) {
        loadedRangesRef.current = mergeRange(loadedRangesRef.current, g);
      }
    })().finally(() => {
      inFlightRef.current.delete(key);
    });

    inFlightRef.current.set(key, task);
    return task;
  }, [mergeLessons]);

  /**
   * Recarrega do servidor exatamente os intervalos já carregados. Usado depois
   * de mutações, no lugar de rebaixar tudo com o histórico inteiro.
   * Descarta as aulas otimistas (`temp-`), já substituídas pelas reais.
   */
  const reloadLoadedLessons = useCallback(async () => {
    const ranges = loadedRangesRef.current;
    if (!ranges.length) return;
    const results = await Promise.all(
      ranges.map(r => fetchAgendaLessonsInRange(r.from, r.to))
    );
    const fresh = results.flat();
    setLessons(prev => {
      // Mantém só o que está fora dos intervalos recarregados; dentro deles o
      // servidor é a verdade (inclusive para exclusões).
      const outside = prev.filter(
        l => !l.id.startsWith('temp-') && !ranges.some(r => l.date >= r.from && l.date <= r.to)
      );
      const byId = new Map([...outside, ...fresh].map(l => [l.id, l]));
      return Array.from(byId.values());
    });
  }, []);

  const refreshPayments = useCallback(async (opts?: { maxAgeMs?: number }) => {
    const maxAge = opts?.maxAgeMs ?? 0;
    if (maxAge && Date.now() - paymentsFetchedAtRef.current < maxAge) return;
    const fresh = await fetchTeacherPayments();
    paymentsFetchedAtRef.current = Date.now();
    setPayments(mapPayments(fresh));
  }, []);

  const refreshStudents = useCallback(async (opts?: { maxAgeMs?: number }) => {
    const maxAge = opts?.maxAgeMs ?? 0;
    if (maxAge && Date.now() - studentsFetchedAtRef.current < maxAge) return;
    const fresh = await fetchAgendaStudents();
    studentsFetchedAtRef.current = Date.now();
    setStudents(fresh);
  }, []);

  // Sem useMemo, um novo objeto por render re-renderizava Sidebar, Topbar,
  // NotificationBell e a página inteira a cada mudança de qualquer estado.
  const value = useMemo<AppContextData>(() => ({
    students, setStudents,
    lessons, setLessons,
    payments, setPayments,
    teacherProfile, setTeacherProfile,
    instruments, setInstruments,
    pendingRequestsCount,
    isLoaded,
    isRangeLoaded,
    ensureRangeLoaded,
    mergeLessons,
    reloadLoadedLessons,
    refreshPayments,
    refreshStudents,
  }), [
    students, lessons, payments, teacherProfile, instruments,
    pendingRequestsCount, isLoaded,
    isRangeLoaded, ensureRangeLoaded, mergeLessons, reloadLoadedLessons,
    refreshPayments, refreshStudents,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const noop = () => {};
const APP_CONTEXT_DEFAULTS: AppContextData = {
  students: [],
  setStudents: noop,
  lessons: [],
  setLessons: noop,
  payments: [],
  setPayments: noop,
  teacherProfile: null,
  setTeacherProfile: noop,
  instruments: [],
  setInstruments: noop,
  pendingRequestsCount: 0,
  isLoaded: false,
  isRangeLoaded: () => false,
  ensureRangeLoaded: async () => {},
  mergeLessons: noop,
  reloadLoadedLessons: async () => {},
  refreshPayments: async () => {},
  refreshStudents: async () => {},
};

export function useAppContext() {
  return useContext(AppContext) ?? APP_CONTEXT_DEFAULTS;
}
