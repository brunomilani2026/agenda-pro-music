"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail, Lock, ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { submitLogin } from "./actions";

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isVerified = searchParams.get('verified') === 'true';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const result = await submitLogin(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else if (result.success && result.redirectUrl) {
      router.push(result.redirectUrl);
    }
  };

  return (
    <>
      <div className="w-full max-w-md animate-pop-in">
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
            Seja bem-vindo <span className="text-amber-500">de volta!</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">Acesse sua agenda e gerencie seus alunos com facilidade.</p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 p-8 rounded-[2rem] shadow-2xl">
          {isVerified && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 animate-pop-in">
              <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-emerald-400 text-sm font-bold leading-tight">
                Conta verificada com sucesso!<br/>
                <span className="text-emerald-500/80 text-xs font-medium">Faça login para continuar.</span>
              </p>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">E-mail</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-amber-500 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="seu@email.com"
                  className="w-full bg-gray-950 border border-gray-800 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/5 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 outline-none transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Senha</label>
                <Link href="/esqueci-senha" className="text-xs font-bold text-amber-500/70 hover:text-amber-500 transition-colors">Esqueceu a senha?</Link>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-amber-500 transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
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

            {errorMsg && (
              <p className="text-red-500 text-sm font-semibold text-center mt-2 animate-pop-in">{errorMsg}</p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-gray-900 font-black py-4 rounded-2xl shadow-xl shadow-amber-500/10 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group"
            >
              {isSubmitting ? (
                <div className="w-6 h-6 border-4 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
              ) : (
                <>
                  Entrar na Agenda
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Social / Divider (Optional, let's keep clean) */}
          <div className="mt-8 pt-8 border-t border-gray-700/50 text-center">
            <p className="text-gray-500 text-sm">
              Não tem uma conta?{" "}
              <Link href="/cadastro" className="text-amber-500 font-bold hover:underline">
                Crie um perfil grátis
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 selection:bg-amber-500/30">
      {/* Noise background */}
      <div className="bg-noise pointer-events-none opacity-[0.03]" />

      {/* Decorative Orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[150px] -z-10" />

      {/* Back button */}
      <Link
        href="/"
        className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-amber-500 transition-colors text-sm font-medium group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Voltar para a home
      </Link>

      <Suspense fallback={<div className="w-6 h-6 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
