"use client";

import { useEffect, useState } from "react";
import { Music, Plus, Trash2, Loader2, Star } from "lucide-react";
import {
  fetchTeacherInstruments,
  saveTeacherInstrument,
  deleteTeacherInstrument,
  setPrimaryTeacherInstrument,
} from "@/app/actions/teacher-pricing.actions";

type Pricing = { id: string; instrument: string; price: number; is_primary: boolean };
type CatalogItem = { id: string; name: string };

const formatBRL = (v: number) =>
  v > 0 ? `R$ ${Number(v).toFixed(2).replace(".", ",")}` : "A combinar";

export default function TeacherInstrumentsManager() {
  const [pricings, setPricings] = useState<Pricing[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newInstrument, setNewInstrument] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const { pricings, catalog } = await fetchTeacherInstruments();
      setPricings(pricings);
      setCatalog(catalog);
    } catch {
      setError("Falha ao carregar instrumentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  // Instrumentos do catálogo que o professor ainda não cadastrou.
  const available = catalog.filter(
    (c) => !pricings.some((p) => p.instrument.toLowerCase() === c.name.toLowerCase())
  );

  const handleAdd = async () => {
    setError(null);
    const instrument = newInstrument.trim();
    const price = Number(newPrice.replace(",", "."));
    if (!instrument) return setError("Selecione um instrumento.");
    if (!Number.isFinite(price) || price < 0) return setError("Informe um preço válido.");

    setSaving(true);
    try {
      const res = await saveTeacherInstrument({ instrument, price });
      if (!res.success) {
        setError(res.error || "Erro ao salvar.");
      } else {
        setNewInstrument("");
        setNewPrice("");
        await reload();
      }
    } catch {
      setError("Falha de conexão. Recarregue a página e tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (instrument: string) => {
    setError(null);
    setRemoving(instrument);
    try {
      const res = await deleteTeacherInstrument(instrument);
      if (!res.success) setError(res.error || "Erro ao remover.");
      else await reload();
    } catch {
      setError("Falha de conexão. Recarregue a página e tente novamente.");
    } finally {
      setRemoving(null);
    }
  };

  const handleSetPrimary = async (instrument: string) => {
    setError(null);
    setSettingPrimary(instrument);
    try {
      const res = await setPrimaryTeacherInstrument(instrument);
      if (!res.success) setError(res.error || "Erro ao definir principal.");
      else await reload();
    } catch {
      setError("Falha de conexão. Recarregue a página e tente novamente.");
    } finally {
      setSettingPrimary(null);
    }
  };

  return (
    <div className="bg-gray-800/40 p-6 rounded-3xl border border-gray-700/50 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Music className="w-5 h-5 text-amber-500" /> Instrumentos que ensino
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Cadastre quantos instrumentos quiser com o preço por aula e marque o principal (⭐).
          É o que permite os alunos te encontrarem no marketplace e definir os instrumentos da agenda.
        </p>
      </div>

      {error && (
        <p className="text-red-500 text-sm font-semibold p-3 bg-red-500/10 rounded-xl border border-red-500/20">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <>
          {/* Lista atual */}
          <div className="space-y-2">
            {pricings.length === 0 && (
              <p className="text-sm text-gray-500 py-2">
                Você ainda não cadastrou nenhum instrumento.
              </p>
            )}
            {pricings.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between border rounded-xl px-4 py-3 ${
                  p.is_primary ? "bg-amber-500/5 border-amber-500/30" : "bg-gray-900 border-gray-700"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Music className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-white font-bold text-sm truncate">{p.instrument}</span>
                  {p.is_primary && (
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md shrink-0">
                      <Star className="w-3 h-3" fill="currentColor" /> Principal
                    </span>
                  )}
                  <span className="text-amber-400 font-black text-sm shrink-0">{formatBRL(p.price)}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!p.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(p.instrument)}
                      disabled={settingPrimary === p.instrument}
                      className="text-gray-500 hover:text-amber-400 transition-colors disabled:opacity-50 p-1"
                      title="Tornar principal"
                    >
                      {settingPrimary === p.instrument ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Star className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(p.instrument)}
                    disabled={removing === p.instrument}
                    className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50 p-1"
                    title="Remover"
                  >
                    {removing === p.instrument ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Adicionar novo */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <select
              value={newInstrument}
              onChange={(e) => setNewInstrument(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors appearance-none cursor-pointer disabled:opacity-50"
              disabled={available.length === 0}
            >
              <option value="" disabled>
                {available.length === 0 ? "Todos os instrumentos já cadastrados" : "Selecione o instrumento"}
              </option>
              {available.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Preço/aula (R$)"
              className="sm:w-40 bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newInstrument}
              className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black rounded-xl text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
