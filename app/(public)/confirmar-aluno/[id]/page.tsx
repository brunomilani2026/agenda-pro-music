"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Lock, Mail, Users } from "lucide-react";
import Image from "next/image";
import { confirmStudent } from "./actions";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

export default function ConfirmStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem!");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setIsLoading(true);
    const res = await confirmStudent(unwrappedParams.id, password);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push("/login?confirmed=true");
      }, 3000);
    } else {
      setError(res.error || "Ocorreu um erro desconhecido.");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Abstract Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-[2rem] p-8 md:p-10 shadow-2xl relative z-10 flex flex-col animate-fade-in-up">
        {/* Logo */}
        <div className="flex justify-center mb-8 relative">
          <div className="absolute inset-0 bg-amber-500 blur-2xl opacity-20 rounded-full" />
          <Image
            src="/Logo.png"
            alt="PRO MUSIC"
            width={120}
            height={60}
            className="h-10 w-auto object-contain relative"
            priority
          />
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center text-center space-y-6 flex-1 py-10">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-2 animate-bounce flex-shrink-0 border border-green-500/20">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">Conta <span className="text-green-500">Ativada!</span></h2>
              <p className="text-sm text-gray-400 font-medium">Sua conta de aluno agora está pronta.</p>
              <p className="text-xs text-amber-500 mt-2 font-bold opacity-80 animate-pulse">Redirecionando para o login...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase italic tracking-tighter">
                Ative sua <span className="text-amber-500">Matrícula</span>
              </h1>
              <p className="text-sm text-gray-400 mt-2 font-medium tracking-wide">
                Crie uma senha de acesso para ver seu painel de aulas e pacotes.
              </p>
            </div>

            <form onSubmit={handleConfirm} className="space-y-6 flex-1 flex flex-col justify-center">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold rounded-2xl flex items-center justify-center text-center animate-shake">
                  {error}
                </div>
              )}

              <div className="space-y-5">
                <div className="group">
                  <label className="text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest pl-2 block group-focus-within:text-amber-500 transition-colors">
                    Sua Nova Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-amber-500 transition-colors" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-gray-950/50 border border-gray-800 rounded-2xl p-4 pl-12 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all placeholder-gray-700 font-bold tracking-widest text-lg"
                      placeholder="••••••"
                    />
                  </div>
                  {/* Medidor de força de senha */}
                  <PasswordStrengthMeter password={password} />
                </div>

                <div className="group">
                  <label className="text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest pl-2 block group-focus-within:text-amber-500 transition-colors">
                    Confirme a Senha
                  </label>
                  <div className="relative">
                    <CheckCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-amber-500 transition-colors" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-gray-950/50 border border-gray-800 rounded-2xl p-4 pl-12 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all placeholder-gray-700 font-bold tracking-widest text-lg"
                      placeholder="••••••"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full relative group overflow-hidden bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-4 px-6 rounded-2xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2 uppercase tracking-widest text-sm">
                    {isLoading ? "Ativando Conta..." : "Ativar Matrícula"}
                  </span>
                  <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-gray-600 font-bold uppercase tracking-widest relative z-10">
        Desenvolvido por PRO MUSIC AGENDA
      </p>
    </div>
  );
}
