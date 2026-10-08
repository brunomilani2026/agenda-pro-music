"use client";

import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, Star, X } from 'lucide-react';
import Link from 'next/link';

const DISMISSED_KEY = 'premium_banner_dismissed_until';
const SNOOZE_DAYS = 7;

export default function PremiumUpgradeBanner() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    if (!dismissedUntil || Date.now() > Number(dismissedUntil)) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISSED_KEY, String(until));
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-8 animate-fade-in">
      {/* Efeito Glow Traseiro (Neon) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-amber-500/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative w-full max-w-2xl bg-white/5 rounded-[2rem] border border-white/10 shadow-[0_0_40px_rgba(245,158,11,0.1)] overflow-hidden flex flex-col p-8 sm:p-12 items-center text-center">

        {/* Linha de Neon Superior */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-80 shadow-[0_0_10px_rgba(245,158,11,0.8)]"></div>

        {/* Etiqueta Minimalista */}
        <div className="absolute top-6 left-6 text-white/40 text-[10px] uppercase tracking-[0.3em] font-light">
          <span className="text-amber-500 font-bold">Pro</span> Music
        </div>

        {/* Botão Fechar */}
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 text-white/40 hover:text-white hover:rotate-90 transition-all duration-300"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Ícone Minimalista */}
        <div className="w-16 h-16 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center mb-8 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
          <Star className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
        </div>

        {/* Título & Descrição */}
        <h3 className="text-2xl sm:text-3xl font-light text-white mb-3 tracking-tight">
          Eleve seu estúdio. <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">Seja PRO.</span>
        </h3>
        <p className="text-white/50 text-sm sm:text-base font-light mb-10 max-w-lg">
          Minimalismo na gestão, máximo de resultado. Automatize suas cobranças e expanda sua base de alunos sem limites.
        </p>

        {/* Lista de Features - Minimalista */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8 text-sm text-white/70 w-full mb-12 text-left">
          <div className="flex items-center gap-4 group">
            <Check className="w-4 h-4 text-amber-500 group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] transition-all" />
            <span className="font-light tracking-wide">Alunos Ilimitados</span>
          </div>
          <div className="flex items-center gap-4 group">
            <Check className="w-4 h-4 text-amber-500 group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] transition-all" />
            <span className="font-light tracking-wide">Cobrança por Pix com QR Code</span>
          </div>
          <div className="flex items-center gap-4 group">
            <Check className="w-4 h-4 text-amber-500 group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] transition-all" />
            <span className="font-light tracking-wide">Notificações por SMS/E-mail</span>
          </div>
          <div className="flex items-center gap-4 group">
            <Check className="w-4 h-4 text-amber-500 group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] transition-all" />
            <span className="font-light tracking-wide">Relatórios e Métricas</span>
          </div>
        </div>

        {/* CTA Section - Neon Botão */}
        <div className="flex flex-col items-center w-full">
          <Link
            href="/configuracoes"
            className="group relative w-full sm:w-auto px-12 py-4 rounded-full border border-amber-500/50 bg-amber-500/5 hover:bg-amber-500 hover:text-black text-amber-400 font-medium tracking-widest uppercase text-xs transition-all duration-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] flex justify-center items-center gap-3"
            onClick={handleClose}
          >
            Assinar por R$ 29,90 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <div className="mt-4 text-[10px] text-white/30 uppercase tracking-widest font-light">
            Cancele a qualquer momento
          </div>
        </div>
      </div>
    </div>
  );
}
