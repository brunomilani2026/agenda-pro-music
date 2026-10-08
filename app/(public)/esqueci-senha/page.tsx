"use client";

import Link from "next/link";
import { Mail, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { requestPasswordReset } from "./actions";

export default function EsqueciSenhaPage() {
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const result = await requestPasswordReset(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setIsSubmitting(false);
    } else {
      setSent(true);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 selection:bg-amber-500/30">
      <div className="bg-noise pointer-events-none opacity-[0.03]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[150px] -z-10" />

      <Link
        href="/login"
        className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-amber-500 transition-colors text-sm font-medium group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Voltar para o login
      </Link>

      <div className="w-full max-w-md animate-pop-in">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
            Esqueceu a <span className="text-amber-500">senha?</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            Informe seu e-mail e enviaremos um link para você criar uma nova senha.
          </p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 p-8 rounded-[2rem] shadow-2xl">
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-14 h-14 text-amber-500 mx-auto" />
              <p className="text-white font-bold">Verifique seu e-mail</p>
              <p className="text-gray-400 text-sm">
                Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.
                Não esqueça de olhar a caixa de spam.
              </p>
              <Link
                href="/login"
                className="inline-block mt-2 text-amber-500 font-bold hover:underline"
              >
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
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

              {errorMsg && (
                <p className="text-red-500 text-sm font-semibold text-center mt-2 animate-pop-in">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-gray-900 font-black py-4 rounded-2xl shadow-xl shadow-amber-500/10 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group"
              >
                {isSubmitting ? (
                  <div className="w-6 h-6 border-4 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                ) : (
                  <>
                    Enviar link
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
