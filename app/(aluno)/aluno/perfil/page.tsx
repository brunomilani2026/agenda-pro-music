"use client";

import { useState, useEffect } from "react";
import { User, Mail, CreditCard, Music, CheckCircle, AlertCircle, Save } from "lucide-react";
import { fetchAlunoPerfilPage } from "../../actions";
import AvatarUpload from "@/components/AvatarUpload";
import PhoneInput from "@/components/ui/PhoneInput";
import { updateSessionProfileAvatar, updateAlunoPerfil } from "@/app/actions/profile.actions";
import { formatName, maskCPF, unmask, isValidCPF, isValidEmail, normalizePhoneForStorage } from "@/lib/utils";

export default function AlunoPerfilPage() {
  const [perfil, setPerfil] = useState<any>(null);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [cpfVal, setCpfVal] = useState('');
  const [instrumentVal, setInstrumentVal] = useState('');
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showNotif = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    // Uma server action só: duas chamadas separadas do cliente rodam em fila.
    fetchAlunoPerfilPage().then(({ perfil: p, credits: c }) => {
      setPerfil(p);
      setCredits(c);
      if (p) {
        setNameVal(p.name || '');
        setPhoneVal(p.phone || '');
        setEmailVal(p.email || '');
        setCpfVal(p.cpf ? maskCPF(p.cpf) : '');
        setInstrumentVal((p.instrument || '').toLowerCase());
      }
      setLoading(false);
    });
  }, []);

  const handleAvatarUpload = async (url: string): Promise<boolean> => {
    const success = await updateSessionProfileAvatar(url);
    if (success) setPerfil((prev: any) => ({ ...prev, avatar_url: url }));
    return success;
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = nameVal.trim();
    if (!trimmedName) { showNotif('Informe o seu nome.', 'error'); return; }
    if (emailVal && !isValidEmail(emailVal.trim())) { showNotif('E-mail inválido.', 'error'); return; }
    const cpfDigits = unmask(cpfVal);
    if (cpfDigits && !isValidCPF(cpfDigits)) { showNotif('CPF inválido.', 'error'); return; }

    setSaving(true);
    const ok = await updateAlunoPerfil({ name: trimmedName, phone: normalizePhoneForStorage(phoneVal), email: emailVal.trim(), cpf: cpfDigits, instrument: instrumentVal });
    if (ok) {
      setPerfil((prev: any) => ({ ...prev, name: trimmedName, phone: normalizePhoneForStorage(phoneVal), email: emailVal.trim(), cpf: cpfDigits, instrument: instrumentVal }));
      showNotif('Perfil atualizado com sucesso!', 'success');
    } else {
      showNotif('Erro ao salvar. Tente novamente.', 'error');
    }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-amber-500 font-bold">Carregando perfil...</div></div>;
  if (!perfil) return <div className="flex items-center justify-center h-full"><p className="text-red-500 font-bold">Erro ao carregar perfil.</p></div>;

  const packageLabels: Record<string, string> = { avulsa: 'Aula Avulsa', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral' };
  const instruments = ['violão', 'guitarra', 'piano', 'canto', 'bateria', 'baixo', 'cavaquinho', 'banjo', 'ukulele', 'teclado', 'flauta', 'saxofone', 'violino'];

  // Calcula o próximo vencimento real (igual ao dashboard): avança a data enquanto estiver no passado
  const pkg = (perfil.packagetype || '').toLowerCase();
  const monthsToAdd = pkg === 'mensal' ? 1 : pkg === 'trimestral' ? 3 : pkg === 'semestral' ? 6 : 0;
  let effectiveExpiration = perfil.expirationdate || '';
  if (effectiveExpiration && monthsToAdd > 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    for (let i = 0; i < 60 && effectiveExpiration < todayStr; i++) {
      const [y, m, d] = effectiveExpiration.split('-').map(Number);
      const next = new Date(y, m - 1 + monthsToAdd, d);
      effectiveExpiration = next.toISOString().split('T')[0];
    }
  }
  const expirationDisplay = effectiveExpiration ? effectiveExpiration.split('-').reverse().join('/') : 'Não definido';

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-8 animate-fade-in">

      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in-up">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl ${notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="text-sm font-bold">{notification.msg}</p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Meu Perfil</h1>
        <p className="text-gray-400 text-sm mt-1">Seus dados cadastrais e informações do plano.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {/* Foto de Perfil */}
        <div className="md:col-span-1 flex flex-col items-center gap-4 bg-gray-800 rounded-2xl border border-gray-700 shadow-xl p-6 h-fit">
          <AvatarUpload
            currentImageUrl={perfil.avatar_url}
            onUploadSuccess={handleAvatarUpload}
            entityId={perfil.idstudent || 'student'}
            type="student"
          />
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">{formatName(perfil.name)}</h2>
            <p className="text-xs text-gray-400 mt-1">Clique na foto para alterar</p>
          </div>
        </div>

        {/* Dados & Plano */}
        <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Editar dados pessoais */}
          <form onSubmit={handleSave} className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl p-6 space-y-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-amber-500" /> Dados Pessoais
            </h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nome</label>
                <input type="text" value={nameVal} onChange={e => setNameVal(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none transition-colors placeholder-gray-600"
                  placeholder="Seu nome completo" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <input type="email" value={emailVal} onChange={e => setEmailVal(e.target.value)}
                    className="w-full bg-gray-900/50 border border-gray-700 p-3 pl-10 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none transition-colors placeholder-gray-600"
                    placeholder="seu@email.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Telefone</label>
                <PhoneInput
                  value={phoneVal}
                  onChange={setPhoneVal}
                  selectClassName="bg-gray-900/50 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none transition-colors"
                  inputClassName="w-full bg-gray-900/50 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none transition-colors placeholder-gray-600"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CPF</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <input type="text" value={cpfVal} onChange={e => setCpfVal(maskCPF(e.target.value))}
                    className="w-full bg-gray-900/50 border border-gray-700 p-3 pl-10 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none transition-colors placeholder-gray-600"
                    placeholder="000.000.000-00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Instrumento</label>
                <div className="relative">
                  <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <select value={instrumentVal} onChange={e => setInstrumentVal(e.target.value)}
                    className="w-full bg-gray-900/50 border border-gray-700 p-3 pl-10 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none transition-colors appearance-none cursor-pointer capitalize">
                    <option value="">Selecione</option>
                    {instruments.map(inst => <option key={inst} value={inst}>{inst}</option>)}
                    {instrumentVal && !instruments.includes(instrumentVal.toLowerCase()) && (
                      <option value={instrumentVal}>{instrumentVal}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black rounded-xl text-sm transition-all active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:opacity-60">
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>

          {/* Plano */}
          <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl p-6 space-y-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-500" /> Meu Plano
            </h2>
            <div className="space-y-4">
              <InfoField icon={<CreditCard className="w-4 h-4" />} label="Pacote" value={packageLabels[perfil.packagetype] || perfil.packagetype} />
              <InfoField icon={<CreditCard className="w-4 h-4" />} label="Vencimento" value={expirationDisplay} />
            </div>

            <div className="mt-6 pt-6 border-t border-gray-700/50">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Créditos de Reposição</h3>
              {credits.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum crédito disponível.</p>
              ) : (
                <div className="space-y-2">
                  {credits.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-gray-900/50 p-3 rounded-xl border border-gray-700/50">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-white font-medium">1 Crédito</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        Expira em {c.expiresAt.split('-').reverse().join('/')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-xl border border-gray-700/50">
      <div className="text-amber-500">{icon}</div>
      <div className="flex-1">
        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{label}</p>
        <p className="text-sm text-white font-medium">{value}</p>
      </div>
    </div>
  );
}
