"use client";

import Link from "next/link";
import { Lock, ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // O link do e-mail estabelece a sessão de recuperação automaticamente.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setCanReset(true);
        setChecking(false);
      }
    });

    // Fallback: checa se já há sessão (token já processado)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setCanReset(true);
      setChecking(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;

    if (password.length < 6) {
      setErrorMsg("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg("Não foi possível redefinir a senha. O link pode ter expirado.");
      setIsSubmitting(false);
      return;
    }

    // O aviso "senha alterada" é enviado nativamente pelo Supabase
    // (Authentication → Emails → Password changed).
    setDone(true);
    setIsSubmitting(false);
    setTimeout(() => router.push("/login"), 2500);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 selection:bg-amber-500/30">
      <div className="bg-noise pointer-events-none opacity-[0.03]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[150px] -z-10" />

      <div className="w-full max-w-md animate-pop-in">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
            Criar <span className="text-amber-500">nova senha</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">Defina uma nova senha para sua conta.</p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 p-8 rounded-[2rem] shadow-2xl">
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-14 h-14 text-amber-500 mx-auto" />
              <p className="text-white font-bold">Senha redefinida!</p>
              <p className="text-gray-400 text-sm">Redirecionando para o login...</p>
            </div>
          ) : checking ? (
            <p className="text-gray-400 text-sm text-center">Validando o link...</p>
          ) : !canReset ? (
            <div className="text-center space-y-4">
              <p className="text-white font-bold">Link inválido ou expirado</p>
              <p className="text-gray-400 text-sm">
                Solicite um novo link de redefinição.
              </p>
              <Link href="/esqueci-senha" className="inline-block text-amber-500 font-bold hover:underline">
                Pedir novo link
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Nova senha</label>
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

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Confirmar senha</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-amber-500 transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="confirm"
                    required
                    placeholder="••••••••"
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
                    Salvar nova senha
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
