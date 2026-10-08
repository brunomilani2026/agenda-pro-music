"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Trash2, Star, Loader2, Check, X, Edit3 } from "lucide-react";
import {
  fetchTeacherCreditPackages,
  createTeacherCreditPackage,
  updateTeacherCreditPackage,
  deleteTeacherCreditPackage,
} from "@/app/actions/credit-package.actions";

type Pkg = {
  id: string;
  name: string;
  credits: number;
  price: number;
  validity_days: number;
  popular: boolean;
  active: boolean;
  sort_order: number;
};

type EditDraft = { name: string; credits: string; price: string; validity_days: string };

export default function CreditPackagesManager() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditDraft>>({});
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({ name: "", credits: "", price: "", validity_days: "180" });
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const list = await fetchTeacherCreditPackages();
    setPackages(list);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const startEdit = (p: Pkg) => {
    setEditing(prev => ({
      ...prev,
      [p.id]: {
        name: p.name,
        credits: String(p.credits),
        price: String(p.price),
        validity_days: String(p.validity_days),
      },
    }));
  };

  const cancelEdit = (id: string) => {
    setEditing(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const saveEdit = async (id: string) => {
    const draft = editing[id];
    if (!draft) return;
    setSavingId(id);
    setError(null);
    const res = await updateTeacherCreditPackage(id, {
      name: draft.name,
      credits: Number(draft.credits),
      price: Number(draft.price),
      validity_days: Number(draft.validity_days),
    });
    if (!res.success) {
      setError(res.error || "Erro ao salvar.");
    } else {
      cancelEdit(id);
      await reload();
    }
    setSavingId(null);
  };

  const togglePopular = async (p: Pkg) => {
    setSavingId(p.id);
    await updateTeacherCreditPackage(p.id, { popular: !p.popular });
    await reload();
    setSavingId(null);
  };

  const toggleActive = async (p: Pkg) => {
    setSavingId(p.id);
    await updateTeacherCreditPackage(p.id, { active: !p.active });
    await reload();
    setSavingId(null);
  };

  const removePkg = async (p: Pkg) => {
    if (!confirm(`Excluir o combo "${p.name}"?`)) return;
    setSavingId(p.id);
    await deleteTeacherCreditPackage(p.id);
    await reload();
    setSavingId(null);
  };

  const createPkg = async () => {
    setError(null);
    setSavingId("__new__");
    const res = await createTeacherCreditPackage({
      name: draft.name,
      credits: Number(draft.credits),
      price: Number(draft.price),
      validity_days: Number(draft.validity_days),
      sort_order: packages.length + 1,
    });
    if (!res.success) {
      setError(res.error || "Erro ao criar combo.");
    } else {
      setDraft({ name: "", credits: "", price: "", validity_days: "180" });
      setCreating(false);
      await reload();
    }
    setSavingId(null);
  };

  return (
    <div className="bg-gray-800/40 p-6 rounded-3xl border border-gray-700/50 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-amber-500" /> Combos de Créditos
        </h3>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 px-3 py-2 rounded-lg transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Novo combo
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Estes são os pacotes que seus alunos verão na tela de compra. Defina o nome, a quantidade de créditos e o preço.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map(p => {
            const draftRow = editing[p.id];
            const isEditing = !!draftRow;
            const busy = savingId === p.id;

            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-4 transition-all ${
                  p.active ? "bg-gray-900/60 border-gray-700" : "bg-gray-900/30 border-gray-800 opacity-60"
                }`}
              >
                {isEditing ? (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr,90px,110px,110px,auto] gap-3 items-center">
                    <input
                      type="text"
                      value={draftRow.name}
                      onChange={e =>
                        setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], name: e.target.value } }))
                      }
                      placeholder="Nome do combo"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="1"
                      value={draftRow.credits}
                      onChange={e =>
                        setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], credits: e.target.value } }))
                      }
                      placeholder="Créditos"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftRow.price}
                      onChange={e =>
                        setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], price: e.target.value } }))
                      }
                      placeholder="Preço (R$)"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="1"
                      value={draftRow.validity_days}
                      onChange={e =>
                        setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], validity_days: e.target.value } }))
                      }
                      placeholder="Dias"
                      title="Validade em dias"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(p.id)}
                        disabled={busy}
                        className="bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20 p-2 rounded-lg disabled:opacity-50"
                        title="Salvar"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => cancelEdit(p.id)}
                        disabled={busy}
                        className="bg-gray-700/50 text-gray-400 border border-gray-700 hover:bg-gray-700 p-2 rounded-lg"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-center">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-bold">{p.name}</p>
                        {p.popular && (
                          <span className="bg-amber-500 text-gray-900 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                            Popular
                          </span>
                        )}
                        {!p.active && (
                          <span className="bg-gray-700 text-gray-300 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                            Oculto
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {p.credits} crédito{p.credits > 1 ? "s" : ""} · R$ {p.price.toFixed(2).replace(".", ",")} · validade {p.validity_days} dias
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => togglePopular(p)}
                        disabled={busy}
                        className={`p-2 rounded-lg border text-xs font-bold transition-all disabled:opacity-50 ${
                          p.popular
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-gray-700/30 text-gray-400 border-gray-700 hover:border-amber-500/30"
                        }`}
                        title={p.popular ? "Remover destaque" : "Marcar como popular"}
                      >
                        <Star className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        disabled={busy}
                        className="text-xs font-bold bg-gray-700/30 text-gray-300 border border-gray-700 hover:border-gray-600 px-3 py-2 rounded-lg disabled:opacity-50"
                      >
                        {p.active ? "Ocultar" : "Ativar"}
                      </button>
                      <button
                        onClick={() => startEdit(p)}
                        disabled={busy}
                        className="bg-gray-700/30 text-gray-300 border border-gray-700 hover:border-amber-500/30 p-2 rounded-lg disabled:opacity-50"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removePkg(p)}
                        disabled={busy}
                        className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 p-2 rounded-lg disabled:opacity-50"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {creating && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr,90px,110px,110px,auto] gap-3 items-center">
                <input
                  type="text"
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Ex: Pacote Anual"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  value={draft.credits}
                  onChange={e => setDraft(d => ({ ...d, credits: e.target.value }))}
                  placeholder="Créditos"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price}
                  onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
                  placeholder="Preço (R$)"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  value={draft.validity_days}
                  onChange={e => setDraft(d => ({ ...d, validity_days: e.target.value }))}
                  placeholder="Dias"
                  title="Validade em dias"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={createPkg}
                    disabled={savingId === "__new__"}
                    className="bg-amber-500 text-gray-900 font-bold text-xs px-3 py-2 rounded-lg hover:bg-amber-400 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingId === "__new__" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Adicionar
                  </button>
                  <button
                    onClick={() => {
                      setCreating(false);
                      setDraft({ name: "", credits: "", price: "", validity_days: "180" });
                      setError(null);
                    }}
                    className="bg-gray-700/50 text-gray-400 border border-gray-700 hover:bg-gray-700 p-2 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
