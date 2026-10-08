"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail, User, MapPin, GraduationCap, ArrowLeft, ArrowRight, CheckCircle2, Music, Lock, UserPlus, Eye, EyeOff, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { submitTeacherRegistration, fetchTeacherRegistrationData } from "./actions";
import { submitStudentRegistration } from "../cadastro-aluno/actions";
import { InstrumentCatalog } from "@/types/database.types";
import { maskCPF, unmask, isValidCPF, isValidEmail, isValidPhone, normalizePhoneForStorage } from "@/lib/utils";
import PhoneInput from "@/components/ui/PhoneInput";

type TabState = 'professor' | 'aluno';

export default function RegisterPage() {
  const [activeTab, setActiveTab] = useState<TabState>('aluno');

  // Shared state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  // Estudante specific state
  const [studentCpf, setStudentCpf] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [studentCpfError, setStudentCpfError] = useState("");
  const [studentPhoneError, setStudentPhoneError] = useState("");
  const [studentEmailError, setStudentEmailError] = useState("");
  const [teachers, setTeachers] = useState<{ idusers_fk: string, name: string }[]>([]);

  // Professor specific state
  const [instruments, setInstruments] = useState<InstrumentCatalog[]>([]);
  const [isLoadingInstruments, setIsLoadingInstruments] = useState(true);
  const [phoneValue, setPhoneValue] = useState("");
  const [professorCpf, setProfessorCpf] = useState("");
  const [professorCpfError, setProfessorCpfError] = useState("");
  const [professorPhoneError, setProfessorPhoneError] = useState("");
  const [professorEmailError, setProfessorEmailError] = useState("");


  useEffect(() => {
    // Uma ação só: duas chamadas separadas do cliente rodam em fila.
    fetchTeacherRegistrationData().then(({ instruments: data, teachers }) => {
      if (data && Array.isArray(data)) {
        setInstruments(data);
      }
      setIsLoadingInstruments(false);
      setTeachers(teachers);
    });
  }, []);

  const handleProfessorSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    
    // Limpando os dados com Regex antes de enviar pro banco
    formData.set("telefone", normalizePhoneForStorage(phoneValue));
    formData.set("cpf", unmask(professorCpf));

    const result = await submitTeacherRegistration(formData);

    setIsSubmitting(false);

    if (result.error) {
      setErrorMsg(result.error);
    } else {
      setIsSuccess(true);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);

    // Limpando os dados com Regex antes de enviar pro banco
    formData.set("cpf", unmask(studentCpf));
    formData.set("phone", normalizePhoneForStorage(studentPhone));

    const result = await submitStudentRegistration(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else if (result.success && result.redirectUrl) {
      router.push(result.redirectUrl);
    }
  };

  if (isSuccess && activeTab === 'professor') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-noise pointer-events-none opacity-[0.03]" />
        <div className="max-w-md w-full text-center animate-pop-in">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-green-500/30">
            <CheckCircle2 className="w-10 h-10 text-green-500 animate-pulse" />
          </div>
          <h1 className="text-3xl font-black text-white mb-4">Cadastro Enviado!</h1>
          <p className="text-gray-400 mb-10 leading-relaxed">
            Seu perfil de professor foi enviado para aprovação. <br />
            Você receberá uma confirmação no seu e-mail em até 24 horas.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold rounded-2xl transition-all shadow-xl shadow-amber-500/10"
          >
            Voltar para a Home
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 selection:bg-amber-500/30">
      <div className="bg-noise pointer-events-none opacity-[0.03]" />

      <Link
        href="/"
        className="fixed top-8 left-8 hidden md:flex items-center gap-2 text-gray-500 hover:text-amber-500 transition-colors text-sm font-medium group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Voltar para a home
      </Link>

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 animate-pop-in">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-800 rounded-3xl mb-4 shadow-2xl border border-gray-700/50 relative overflow-hidden">
            <Image
              src="/Logo.png"
              alt="Logo"
              fill
              className="object-cover"
            />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Crie sua conta</h1>
          <p className="text-gray-400 mt-2">Acesse a maior plataforma de música.</p>
        </div>

        {/* Smooth Role Toggle Tabs */}
        <div className="relative flex max-w-md mx-auto bg-gray-800/40 p-1.5 rounded-2xl mb-10 border border-gray-700/50 animate-pop-in">
          {/* Sliding Pill */}
          <div
            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-0.375rem)] rounded-xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-lg ${activeTab === 'aluno'
                ? 'left-1.5 bg-amber-500/20 border border-amber-500/30'
                : 'left-[calc(50%+0.375rem)] bg-indigo-500/20 border border-indigo-500/30'
              }`}
          />

          <button
            type="button"
            onClick={() => { setErrorMsg(''); setActiveTab('aluno'); }}
            className={`flex-1 py-3 text-center rounded-xl font-bold text-sm uppercase tracking-wider relative z-10 transition-colors duration-300 ${activeTab === 'aluno' ? 'text-amber-500' : 'text-gray-500 hover:text-white'
              }`}
          >
            Sou Aluno
          </button>

          <button
            type="button"
            onClick={() => { setErrorMsg(''); setActiveTab('professor'); }}
            className={`flex-1 py-3 text-center rounded-xl font-bold text-sm uppercase tracking-wider relative z-10 transition-colors duration-300 ${activeTab === 'professor' ? 'text-indigo-400' : 'text-gray-500 hover:text-white'
              }`}
          >
            Sou Professor
          </button>
        </div>

        <div className="bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-[2.5rem] shadow-2xl relative overflow-hidden transition-all duration-500 animate-pop-in [animation-delay:100ms] opacity-0 [animation-fill-mode:forwards]" style={{ minHeight: activeTab === 'professor' ? '800px' : '550px' }}>

          {/* PROFESSOR FORM */}
          <div className={`transition-all duration-500 p-8 sm:p-12 ${activeTab === 'professor' ? 'translate-x-0 opacity-100 relative' : 'translate-x-[50%] opacity-0 pointer-events-none absolute inset-0'}`}>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-8" onSubmit={handleProfessorSubmit}>
              {/* Nome */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Nome Completo</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    required
                    type="text"
                    name="nome"
                    placeholder="Seu nome"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">E-mail Profissional</label>
                <div className="relative group">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${professorEmailError ? 'text-red-400' : 'text-gray-500 group-focus-within:text-indigo-400'}`}>
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    required
                    type="email"
                    name="email"
                    placeholder="seu@email.com"
                    onBlur={e => setProfessorEmailError(e.target.value && !isValidEmail(e.target.value) ? 'E-mail com formato inválido.' : '')}
                    onChange={() => professorEmailError && setProfessorEmailError('')}
                    className={`w-full bg-gray-950 border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${professorEmailError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-indigo-500/50 focus:ring-indigo-500/5'}`}
                  />
                </div>
                {professorEmailError && <p className="text-red-400 text-xs ml-1 mt-1">{professorEmailError}</p>}
              </div>

              {/* Senha */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Senha</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Sua senha segura"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 rounded-2xl py-4 pl-12 pr-12 text-white placeholder:text-gray-600 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Telefone */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Telefone / WhatsApp</label>
                <PhoneInput
                  required
                  value={phoneValue}
                  onChange={v => { setPhoneValue(v); if (professorPhoneError) setProfessorPhoneError(''); }}
                  onBlur={() => setProfessorPhoneError(!isValidPhone(phoneValue) ? 'Telefone inválido (mínimo 8 dígitos).' : '')}
                  selectClassName={`bg-gray-950 border rounded-2xl py-4 px-3 text-white outline-none transition-all focus:ring-4 ${professorPhoneError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-indigo-500/50 focus:ring-indigo-500/5'}`}
                  inputClassName={`flex-1 bg-gray-950 border rounded-2xl py-4 px-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${professorPhoneError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-indigo-500/50 focus:ring-indigo-500/5'}`}
                />
                {professorPhoneError && <p className="text-red-400 text-xs ml-1 mt-1">{professorPhoneError}</p>}
              </div>

              {/* CPF */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">CPF</label>
                <div className="relative group">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${professorCpfError ? 'text-red-400' : 'text-gray-500 group-focus-within:text-indigo-400'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <input
                    required
                    type="text"
                    name="cpf"
                    value={professorCpf}
                    onChange={e => { setProfessorCpf(maskCPF(e.target.value)); if (professorCpfError) setProfessorCpfError(''); }}
                    onBlur={() => setProfessorCpfError(professorCpf && !isValidCPF(professorCpf) ? 'CPF inválido.' : '')}
                    maxLength={14}
                    placeholder="000.000.000-00"
                    className={`w-full bg-gray-950 border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${professorCpfError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-indigo-500/50 focus:ring-indigo-500/5'}`}
                  />
                </div>
                {professorCpfError && <p className="text-red-400 text-xs ml-1 mt-1">{professorCpfError}</p>}
              </div>

              {/* Instrumento */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Instrumento Principal</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                    <Music className="w-5 h-5" />
                  </div>
                  <select name="instrumento" defaultValue="Outros" className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 rounded-2xl py-4 pl-12 pr-4 text-white outline-none transition-all appearance-none">
                    {isLoadingInstruments ? (
                      <option className="bg-gray-900" value="" disabled>Carregando instrumentos...</option>
                    ) : instruments.length > 0 ? (
                      instruments.map((inst) => (
                        <option key={inst.id} className="bg-gray-900" value={inst.name}>
                          {inst.name}
                        </option>
                      ))
                    ) : (
                      <option className="bg-gray-900" value="" disabled>Nenhum instrumento cadastrado</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Cidade */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Cidade / Estado</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <input
                    required
                    type="text"
                    name="cidade"
                    placeholder="Ex: São Paulo, SP"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Experiência */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Breve Experiência / Bio</label>
                <div className="relative group">
                  <div className="absolute top-4 left-4 text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <textarea
                    rows={4}
                    name="experiencia"
                    placeholder="Conte um pouco sobre sua trajetória musical..."
                    className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && activeTab === 'professor' && (
                <div className="md:col-span-2">
                  <p className="text-red-500 text-sm font-semibold text-center mt-2">{errorMsg}</p>
                </div>
              )}

              {/* Submit */}
              <div className="md:col-span-2 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/50 disabled:cursor-not-allowed text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Solicitar Cadastro
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* ALUNO FORM */}
          <div className={`transition-all duration-500 p-8 sm:p-12 ${activeTab === 'aluno' ? 'translate-x-0 opacity-100 relative' : '-translate-x-[50%] opacity-0 pointer-events-none absolute inset-0'}`}>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-8" onSubmit={handleStudentSubmit}>
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
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${studentEmailError ? 'text-red-400' : 'text-gray-500 group-focus-within:text-amber-500'}`}>
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="seu@email.com"
                    onBlur={e => setStudentEmailError(e.target.value && !isValidEmail(e.target.value) ? 'E-mail com formato inválido.' : '')}
                    onChange={() => studentEmailError && setStudentEmailError('')}
                    className={`w-full bg-gray-950 border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${studentEmailError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                  />
                </div>
                {studentEmailError && <p className="text-red-400 text-xs ml-1 mt-1">{studentEmailError}</p>}
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
              </div>

              {/* Phone Field */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Celular / WhatsApp</label>
                <PhoneInput
                  required
                  value={studentPhone}
                  onChange={v => { setStudentPhone(v); if (studentPhoneError) setStudentPhoneError(''); }}
                  onBlur={() => setStudentPhoneError(studentPhone && !isValidPhone(studentPhone) ? 'Telefone inválido (mínimo 8 dígitos).' : '')}
                  selectClassName={`bg-gray-950 border rounded-2xl py-4 px-3 text-white outline-none transition-all focus:ring-4 ${studentPhoneError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                  inputClassName={`flex-1 bg-gray-950 border rounded-2xl py-4 px-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${studentPhoneError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                />
                {studentPhoneError && <p className="text-red-400 text-xs ml-1 mt-1">{studentPhoneError}</p>}
              </div>

              {/* CPF Field */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">CPF</label>
                <div className="relative group max-w-[50%]">
                  <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${studentCpfError ? 'text-red-400' : 'text-gray-500 group-focus-within:text-amber-500'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    name="cpf"
                    required
                    value={studentCpf}
                    onChange={e => { setStudentCpf(maskCPF(e.target.value)); if (studentCpfError) setStudentCpfError(''); }}
                    onBlur={() => setStudentCpfError(studentCpf && !isValidCPF(studentCpf) ? 'CPF inválido.' : '')}
                    maxLength={14}
                    placeholder="000.000.000-00"
                    className={`w-full bg-gray-950 border rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all focus:ring-4 ${studentCpfError ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/5' : 'border-gray-800 focus:border-amber-500/50 focus:ring-amber-500/5'}`}
                  />
                </div>
                {studentCpfError && <p className="text-red-400 text-xs ml-1 mt-1">{studentCpfError}</p>}
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
                    {instruments.map((inst) => (
                      <option key={inst.id} className="bg-gray-900" value={inst.name}>
                        {inst.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Teacher Selection */}
              <div className="space-y-2">
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
                    {teachers.map((t) => (
                      <option key={t.idusers_fk} value={t.idusers_fk}>
                        Professor(a): {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && activeTab === 'aluno' && (
                <div className="md:col-span-2">
                  <p className="text-red-500 text-sm font-semibold text-center mt-4">{errorMsg}</p>
                </div>
              )}

              {/* Submit Button */}
              <div className="md:col-span-2 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting || teachers.length === 0}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-gray-900 font-black py-5 rounded-2xl shadow-xl shadow-amber-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 group"
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
              </div>
            </form>
          </div>

        </div>

        <div className="mt-8 text-center relative z-20">
          <p className="text-gray-500 text-sm">
            Já tem uma conta?{" "}
            <Link href="/login" className="text-amber-500 font-bold hover:underline">
              Fazer Login
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
