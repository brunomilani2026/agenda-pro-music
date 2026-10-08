"use client";

import { User, Shield, CreditCard, CheckCircle, AlertCircle, Lock, Eye, EyeOff, Video } from "lucide-react";
import { useAppContext } from "../AppContext";
import AvatarUpload from "@/components/AvatarUpload";
import CreditPackagesManager from "@/components/CreditPackagesManager";
import TeacherInstrumentsManager from "@/components/TeacherInstrumentsManager";
import PhoneInput from "@/components/ui/PhoneInput";
import { updateSessionProfileAvatar, updateTeacherProfileData, changePassword } from "@/app/actions/profile.actions";
import { formatName, normalizePhoneForStorage } from "@/lib/utils";
import { useState, useEffect } from "react";

export default function ConfigPage() {
  const { teacherProfile, setTeacherProfile } = useAppContext();
  const [phoneVal, setPhoneVal] = useState(teacherProfile?.phone || '');
  const [nameVal, setNameVal] = useState(formatName(teacherProfile?.name) || '');
  const [emailVal, setEmailVal] = useState(teacherProfile?.email || '');
  const [bioVal, setBioVal] = useState((teacherProfile as any)?.bio || '');
  const [meetLinkVal, setMeetLinkVal] = useState(teacherProfile?.meet_link || '');
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // O `teacherProfile` chega de forma assíncrona do AppContext (null no 1º render),
  // então re-hidrata os campos quando o perfil é carregado/atualizado.
  useEffect(() => {
    if (!teacherProfile) return;
    setNameVal(formatName(teacherProfile.name) || '');
    setEmailVal(teacherProfile.email || '');
    setPhoneVal(teacherProfile.phone || '');
    setBioVal((teacherProfile as any).bio || '');
    setMeetLinkVal(teacherProfile.meet_link || '');
  }, [teacherProfile]);

  // Estado do modal de troca de senha
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwShow, setPwShow] = useState({ current: false, next: false });
  const [pwSaving, setPwSaving] = useState(false);

  const showNotification = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleAvatarUpload = async (url: string): Promise<boolean> => {
    const success = await updateSessionProfileAvatar(url);
    if (success) setTeacherProfile({ ...teacherProfile, avatar_url: url });
    return success;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      showNotification('As senhas não coincidem.', 'error');
      return;
    }
    setPwSaving(true);
    try {
      const result = await changePassword({ currentPassword: pwForm.current, newPassword: pwForm.next });
      if (result.success) {
        showNotification('Senha alterada com sucesso!', 'success');
        setPwModal(false);
        setPwForm({ current: '', next: '', confirm: '' });
      } else {
        showNotification(result.error || 'Erro ao alterar senha.', 'error');
      }
    } catch {
      // Falha de rede ou versão do app desatualizada (Server Action 404 após deploy).
      showNotification('Falha de conexão. Recarregue a página e tente novamente.', 'error');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // O servidor recusa link torto, mas só devolve um booleano — validar aqui
    // é o que permite dizer ao professor qual campo está errado.
    const meetLink = meetLinkVal.trim();
    if (meetLink && !/^https?:\/\/\S+$/i.test(meetLink)) {
      showNotification('O link da sala deve começar com https:// — copie a URL completa do Meet.', 'error');
      return;
    }
    setSaving(true);
    try {
      const ok = await updateTeacherProfileData({ name: nameVal, phone: phoneVal, bio: bioVal, email: emailVal, meetLink });
      if (ok) {
        setTeacherProfile({ ...teacherProfile, name: nameVal, phone: normalizePhoneForStorage(phoneVal), bio: bioVal, email: emailVal, meet_link: meetLink || null });
        showNotification('Perfil atualizado com sucesso!', 'success');
      } else {
        showNotification('Erro ao salvar. Tente novamente.', 'error');
      }
    } catch {
      // Falha de rede ou versão do app desatualizada (Server Action 404 após deploy).
      showNotification('Falha de conexão. Recarregue a página e tente novamente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col space-y-8 animate-fade-in max-w-4xl">
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in-up">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl ${notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
            {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="text-sm font-bold">{notification.msg}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-white">Configurações</h1>
        <p className="text-gray-400">Gerencie suas informações pessoais e preferências da conta.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Perfil e Foto */}
        <div className="md:col-span-1 flex flex-col items-center gap-4 bg-gray-800/40 p-8 rounded-3xl border border-gray-700/50 h-fit">
          <AvatarUpload
            currentImageUrl={teacherProfile?.avatar_url}
            onUploadSuccess={handleAvatarUpload}
            entityId={teacherProfile?.idteacher ?? teacherProfile?.idstudent ?? 'profile'}
            type={teacherProfile?._role === 'aluno' ? 'student' : 'teacher'}
          />
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">Sua Foto</h2>
            <p className="text-xs text-gray-500 mt-1">
              {teacherProfile?._role === 'aluno'
                ? 'Visível para professores do marketplace'
                : 'Visível para seus alunos no marketplace'}
            </p>
          </div>
        </div>

        {/* Informações da Conta */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-gray-800/40 p-6 rounded-3xl border border-gray-700/50 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-amber-500" /> Informações do Perfil
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome</label>
                <input
                  type="text"
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors"
                  placeholder="Seu nome"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">E-mail</label>
                <input
                  type="email"
                  value={emailVal}
                  onChange={e => setEmailVal(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors"
                  placeholder="seu@email.com"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
                <PhoneInput
                  value={phoneVal}
                  onChange={setPhoneVal}
                  selectClassName="bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors"
                  inputClassName="w-full bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors"
                />
              </div>
              {teacherProfile?._role !== 'aluno' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                    <Video className="w-3 h-3 text-amber-500" /> Link da sala de aula (Google Meet)
                  </label>
                  <input
                    type="url"
                    value={meetLinkVal}
                    onChange={e => setMeetLinkVal(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors"
                    placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  />
                  <p className="text-[11px] text-gray-500 ml-1 leading-relaxed">
                    Sala fixa usada em todas as suas aulas. Vira o botão <span className="text-gray-300 font-semibold">&ldquo;Entrar na aula&rdquo;</span> nos e-mails de lembrete e na tela do aluno — não precisa mais colar o link nas notas de cada aula.
                  </p>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Biografia / Experiência</label>
                <textarea
                  rows={4}
                  value={bioVal}
                  onChange={e => setBioVal(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 p-3 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors resize-none"
                  placeholder="Escreva um pouco sobre sua formação e experiência."
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black rounded-xl text-sm transition-all active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>

          <div className="bg-gray-800/40 p-6 rounded-3xl border border-gray-700/50 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" /> Segurança
            </h3>
            <button
              onClick={() => { setPwModal(true); setPwForm({ current: '', next: '', confirm: '' }); }}
              className="flex items-center gap-2 text-sm font-bold text-amber-500 hover:text-amber-400 underline decoration-amber-500/30 underline-offset-4"
            >
              <Lock className="w-4 h-4" /> Alterar senha de acesso
            </button>
          </div>

          {teacherProfile?._role !== 'aluno' && (
            <>
              <TeacherInstrumentsManager />

              <div className="bg-gray-800/40 p-6 rounded-3xl border border-gray-700/50 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-amber-500" /> Plano e Assinatura
                </h3>
                {teacherProfile?.ispremium ? (
                  <div className="flex items-center justify-between bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20">
                    <div>
                      <p className="text-amber-500 font-black text-sm uppercase tracking-widest">Plano Premium</p>
                      <p className="text-amber-400/60 text-xs mt-0.5">Acesso ilimitado a todas as funções</p>
                    </div>
                    <span className="bg-amber-500 text-gray-900 text-[10px] font-black px-2 py-1 rounded-md">ATIVO</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-700/30 p-4 rounded-2xl border border-gray-600/30">
                    <div>
                      <p className="text-gray-200 font-black text-sm uppercase tracking-widest">Plano Grátis</p>
                      <p className="text-gray-400/80 text-xs mt-0.5">Faça upgrade para liberar todas as funções</p>
                    </div>
                    <span className="bg-gray-600 text-gray-200 text-[10px] font-black px-2 py-1 rounded-md">ATIVO</span>
                  </div>
                )}
              </div>

              <CreditPackagesManager />
            </>
          )}
        </div>
      </div>
    </div>

      {/* Modal Troca de Senha */}
      {pwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fade-in">
          <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-3xl w-full max-w-md shadow-2xl border border-gray-700/50 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Alterar Senha</h3>
                <p className="text-xs text-gray-400">Mínimo de 6 caracteres</p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {(['current', 'next', 'confirm'] as const).map((field) => {
                const labels = { current: 'Senha atual', next: 'Nova senha', confirm: 'Confirmar nova senha' };
                const showKey = field === 'current' ? 'current' : 'next';
                return (
                  <div key={field} className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">{labels[field]}</label>
                    <div className="relative">
                      <input
                        type={pwShow[showKey] ? 'text' : 'password'}
                        required
                        value={pwForm[field]}
                        onChange={e => setPwForm({ ...pwForm, [field]: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 p-3 pr-10 rounded-xl text-white text-sm focus:border-amber-500/50 outline-none transition-colors"
                        placeholder="••••••••"
                      />
                      {field !== 'confirm' && (
                        <button
                          type="button"
                          onClick={() => setPwShow({ ...pwShow, [showKey]: !pwShow[showKey] })}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                          {pwShow[showKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setPwModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-gray-300 bg-gray-700 rounded-xl hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="flex-1 px-4 py-3 text-sm font-black text-gray-900 bg-amber-500 hover:bg-amber-400 rounded-xl transition-all disabled:opacity-50"
                >
                  {pwSaving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
