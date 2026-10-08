"use client";

import Link from "next/link";
import Image from "next/image";
import { User, Mail, Lock, ArrowLeft, ArrowRight, Eye, EyeOff, Music, FileText, UserPlus } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { submitStudentRegistration, fetchStudentRegistrationData } from "./actions";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import PhoneInput from "@/components/ui/PhoneInput";
import { maskCPF, unmask, isValidCPF, isValidEmail, isValidPhone, normalizePhoneForStorage } from "@/lib/utils";

export default function StudentRegistrationPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [instruments, setInstruments] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<{ idusers_fk: string, name: string }[]>([]);
  const router = useRouter();

  const [cpfValue, setCpfValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    // Uma ação só: duas chamadas separadas do cliente rodam em fila.
    fetchStudentRegistrationData().then(({ instruments, teachers }) => {
      setInstruments(instruments);
      setTeachers(teachers);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");

    if (cpfValue && !isValidCPF(cpfValue)) { setCpfError('CPF inválido.'); return; }
    if (phoneValue && !isValidPhone(phoneValue)) { setPhoneError('Telefone inválido (mínimo 8 dígitos).'); return; }

    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    formData.set("cpf", unmask(cpfValue));
    formData.set("phone", normalizePhoneForStorage(phoneValue));
    const result = await submitStudentRegistration(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else if (result.success && result.redirectUrl) {
      router.push(result.redirectUrl);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 py-12 selection:bg-amber-500/30">
      {/* Noise background */}
      <div className="bg-noise pointer-events-none opacity-[0.03] fixed inset-0" />

      {/* Decorative Orbs */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[150px] -z-10" />

      {/* Back button */}
      <Link 
        href="/" 
        className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-amber-500 transition-colors text-sm font-medium group z-10"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Voltar para a home
      </Link>

      <div className="w-full max-w-2xl animate-pop-in relative z-10">
        {/* Logo Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-800 rounded-3xl shadow-2xl border border-gray-700/50 mb-6 group hover:scale-110 transition-transform cursor-pointer relative overflow-hidden">
            <Image 
              src="/Logo.png" 
              alt="Logo" 
              fill 
              className="object-cover"
            />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
            Crie seu <span className="text-amber-500">perfil</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">Conecte-se ao seu professor e acompanhe suas aulas.</p>
        </div>

        {/* Role Toggle Tabs */}
        <div className="flex max-w-md mx-auto bg-gray-800/40 p-1.5 rounded-2xl mb-10 border border-gray-700/50 animate-pop-in">
          <div className="flex-1 py-3 text-center rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 font-bold shadow-lg text-sm uppercase tracking-wider">
            Sou Aluno
          </div>
          <Link 
            href="/cadastro" 
            className="flex-1 py-3 text-center rounded-xl text-gray-500 font-bold hover:text-white transition-colors text-sm uppercase tracking-wider"
          >
            Sou Professor
          </Link>
        </div>

        {/* Registration Card */}
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 p-8 sm:p-10 rounded-[2rem] shadow-2xl">
          <form className="space-y-6" onSubmit={handleSubmit}>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name Field */}
                <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Nome Completo</label>
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-amber-500 transition-colors">
                    <User className="w-5 h-5" />
                    </div>
                    <input 
                    type="text"
                    name="name"
                    required
                    placeholder="Seu nome"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all"
                    />
                </div>
                </div>

                {/* Email Field */}
                <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">E-mail</label>
                <div className="relative group">
                    <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${emailError ? 'text-red-400' : 'text-gray-500 group-focus-within:text-amber-500'}`}>
                    <Mail className="w-5 h-5" />
                    </div>
                    <input
                    type="email"
                    name="email"
                    required
                    placeholder="seu@email.com"
                    onBlur={e => setEmailError(e.target.value && !isValidEmail(e.target.value) ? 'E-mail com formato inválido.' : '')}
                    onChange={() => emailError && setEmailError('')}
                    className={`w-full bg-gray-950 border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${emailError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                    />
                </div>
                {emailError && <p className="text-red-400 text-xs ml-1 mt-1">{emailError}</p>}
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Senha</label>
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-amber-500 transition-colors">
                    <Lock className="w-5 h-5" />
                    </div>
                    <input 
                    type={showPassword ? "text" : "password"} 
                    name="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/5 rounded-2xl py-4 pl-12 pr-12 text-white placeholder:text-gray-600 outline-none transition-all"
                    />
                    <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors"
                    >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
                {/* Medidor de força de senha */}
                <PasswordStrengthMeter password={passwordValue} />
                </div>

                {/* Phone Field */}
                <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Celular / WhatsApp</label>
                <PhoneInput
                  required
                  value={phoneValue}
                  onChange={v => { setPhoneValue(v); if (phoneError) setPhoneError(''); }}
                  onBlur={() => setPhoneError(phoneValue && !isValidPhone(phoneValue) ? 'Telefone inválido (mínimo 8 dígitos).' : '')}
                  selectClassName={`bg-gray-950 border rounded-2xl py-4 px-3 text-white outline-none transition-all focus:ring-4 ${phoneError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                  inputClassName={`flex-1 bg-gray-950 border rounded-2xl py-4 px-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${phoneError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                />
                {phoneError && <p className="text-red-400 text-xs ml-1 mt-1">{phoneError}</p>}
                </div>

                {/* CPF Field */}
                <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">CPF</label>
                <div className="relative group">
                    <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${cpfError ? 'text-red-400' : 'text-gray-500 group-focus-within:text-amber-500'}`}>
                    <FileText className="w-5 h-5" />
                    </div>
                    <input
                    type="text"
                    name="cpf"
                    required
                    value={cpfValue}
                    onChange={e => { setCpfValue(maskCPF(e.target.value)); if (cpfError) setCpfError(''); }}
                    onBlur={() => setCpfError(cpfValue && !isValidCPF(cpfValue) ? 'CPF inválido.' : '')}
                    maxLength={14}
                    placeholder="000.000.000-00"
                    className={`w-full bg-gray-950 border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${cpfError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                    />
                </div>
                {cpfError && <p className="text-red-400 text-xs ml-1 mt-1">{cpfError}</p>}
                </div>

                {/* Instrument Field */}
                <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Instrumento</label>
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-amber-500 transition-colors">
                    <Music className="w-5 h-5" />
                    </div>
                    <select 
                    name="instrument"
                    required
                    className="w-full bg-gray-950 border border-gray-800 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all appearance-none"
                    >
                    <option value="" disabled selected>Selecione seu instrumento</option>
                    {instruments.map(inst => (
                        <option key={inst} value={inst.charAt(0).toUpperCase() + inst.slice(1)}>
                        {inst.charAt(0).toUpperCase() + inst.slice(1)}
                        </option>
                    ))}
                    </select>
                </div>
                </div>
            </div>

            {/* Teacher Selection */}
            <div className="space-y-2 pt-2 border-t border-gray-700/50 mt-4">
              <label className="text-xs font-bold uppercase tracking-widest text-amber-500 ml-1">Quem é o seu professor?</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-amber-500 transition-colors">
                  <UserPlus className="w-5 h-5" />
                </div>
                <select 
                  name="teacherId"
                  required
                  className="w-full bg-gray-950 border border-gray-800 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all appearance-none"
                >
                  <option value="" disabled selected>Selecione na lista</option>
                  {teachers.map(t => (
                    <option key={t.idusers_fk} value={t.idusers_fk}>
                      Professor(a): {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {errorMsg && (
              <p className="text-red-500 text-sm font-semibold text-center mt-4 animate-pop-in">{errorMsg}</p>
            )}

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={isSubmitting || teachers.length === 0}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-gray-900 font-black py-4 rounded-2xl shadow-xl shadow-amber-500/10 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group mt-6"
            >
              {isSubmitting ? (
                 <div className="w-6 h-6 border-4 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
              ) : (
                <>
                  Criar Conta de Aluno
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-8 pt-8 border-t border-gray-700/50 text-center">
            <p className="text-gray-500 text-sm">
              Já tem uma conta de aluno?{" "}
              <Link href="/login" className="text-amber-500 font-bold hover:underline">
                Fazer Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
