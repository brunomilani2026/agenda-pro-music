"use client";

import { useMemo } from "react";
import { Shield, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

interface PasswordStrengthMeterProps {
  password: string;
}

interface StrengthLevel {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

const CRITERIA = [
  { label: "Mínimo 8 caracteres", test: (pw: string) => pw.length >= 8 },
  { label: "Letra minúscula (a-z)", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Letra maiúscula (A-Z)", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Número (0-9)", test: (pw: string) => /[0-9]/.test(pw) },
  { label: "Caractere especial (!@#$%...)", test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
];

const STRENGTH_LEVELS: StrengthLevel[] = [
  { label: "Muito Fraca", color: "text-red-500", bgColor: "bg-red-500", icon: <ShieldX className="w-4 h-4" /> },
  { label: "Fraca", color: "text-orange-500", bgColor: "bg-orange-500", icon: <ShieldAlert className="w-4 h-4" /> },
  { label: "Razoável", color: "text-yellow-500", bgColor: "bg-yellow-500", icon: <ShieldAlert className="w-4 h-4" /> },
  { label: "Boa", color: "text-lime-500", bgColor: "bg-lime-500", icon: <Shield className="w-4 h-4" /> },
  { label: "Forte", color: "text-green-500", bgColor: "bg-green-500", icon: <ShieldCheck className="w-4 h-4" /> },
  { label: "Muito Forte", color: "text-emerald-400", bgColor: "bg-emerald-400", icon: <ShieldCheck className="w-4 h-4" /> },
];

export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { score, results } = useMemo(() => {
    const results = CRITERIA.map((c) => c.test(password));
    const score = results.filter(Boolean).length;
    return { score, results };
  }, [password]);

  if (!password) return null;

  const level = STRENGTH_LEVELS[score];
  const percentage = Math.max(((score) / CRITERIA.length) * 100, 8);

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 ${level.color} transition-colors duration-300`}>
            {level.icon}
            <span className="text-[10px] font-black uppercase tracking-widest">
              {level.label}
            </span>
          </div>
          <span className="text-[10px] font-bold text-gray-600">
            {score}/{CRITERIA.length}
          </span>
        </div>

        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${level.bgColor} transition-all duration-500 ease-out`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {CRITERIA.map((criterion, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-[11px] font-medium transition-all duration-300 ${
              results[i] ? "text-green-500" : "text-gray-600"
            }`}
          >
            <span
              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] font-black transition-all duration-300 ${
                results[i]
                  ? "bg-green-500/20 border-green-500/50 text-green-500"
                  : "bg-gray-800 border-gray-700 text-gray-700"
              }`}
            >
              {results[i] ? "✓" : ""}
            </span>
            {criterion.label}
          </div>
        ))}
      </div>
    </div>
  );
}
