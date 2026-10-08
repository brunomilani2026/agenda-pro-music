"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Search, Music, UserPlus, ArrowRight, User } from "lucide-react";
import { fetchMarketplaceData, linkStudentToTeacher } from "../../actions";
import { useRouter } from "next/navigation";
import { formatName } from "@/lib/utils";

export default function TeacherMarketplace({ studentId }: { studentId: string }) {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedInstrument, setSelectedInstrument] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Uma server action só: duas chamadas separadas do cliente rodam em fila.
    fetchMarketplaceData().then(({ teachers: teachersData, instruments: instrumentsData }) => {
      setTeachers(teachersData);
      setInstruments(instrumentsData);
      setLoading(false);
    });
  }, []);

  const handleLink = async () => {
    if (!selectedInstrument || !selectedTeacherId) {
      setErrorMsg("Selecione um instrumento e um professor.");
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg("");
    
    const res = await linkStudentToTeacher(studentId, selectedTeacherId, selectedInstrument);
    if (res?.error) {
      setErrorMsg(res.error);
      setIsSubmitting(false);
    } else {
      // Reload the page to trigger the main dashboard render
      window.location.reload();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-pulse text-amber-500 font-bold">Carregando professores...</div>
      </div>
    );
  }

  const filteredTeachers = selectedInstrument 
    ? teachers.filter((t: any) => t.instruments?.includes(selectedInstrument))
    : teachers;

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-indigo-400 p-8 sm:p-12 shadow-2xl shadow-indigo-500/20 text-white border border-indigo-400">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Escolha seu Professor 🎸</h1>
          <p className="text-indigo-100 font-medium text-lg leading-relaxed">
            Para começar suas aulas, escolha o instrumento que você deseja aprender e selecione o professor ideal para a sua jornada musical.
          </p>
        </div>
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-60" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Filters Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-3xl shadow-xl">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-400" />
              Suas Escolhas
            </h2>

            <div className="space-y-6">
              {/* Instrument Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1">O que quer aprender?</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                    <Music className="w-5 h-5" />
                  </div>
                  <select 
                    value={selectedInstrument}
                    onChange={(e) => setSelectedInstrument(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Selecione o instrumento</option>
                    {instruments.map((inst: any) => (
                      <option key={inst.id} value={inst.name}>{inst.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Error Display */}
              {errorMsg && (
                <p className="text-red-500 text-sm font-semibold p-3 bg-red-500/10 rounded-xl border border-red-500/20">{errorMsg}</p>
              )}

              {/* Submit Button */}
              <button 
                onClick={handleLink}
                disabled={isSubmitting || !selectedInstrument || !selectedTeacherId}
                className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 group mt-8"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Vincular e Começar
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Teachers List */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-400" />
            Professores Disponíveis
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredTeachers.map((teacher: any) => {
              const pricings: { instrument: string; price: number; is_primary: boolean }[] = teacher.pricings || [];
              const primary = pricings.find((p) => p.is_primary);
              // Com um instrumento escolhido, mostra o preço DAQUELE instrumento
              // (não a média entre todos). Sem filtro, mostra o preço do principal.
              const selected = selectedInstrument
                ? pricings.find((p) => p.instrument === selectedInstrument)
                : primary;
              const displayPrice = selected ? selected.price : teacher.avg_price;
              const priceLabel = selectedInstrument || selected?.instrument || 'Preço médio';

              return (
              <div
                key={teacher.idusers_fk}
                onClick={() => setSelectedTeacherId(teacher.idusers_fk)}
                className={`cursor-pointer bg-gray-800/40 border p-6 rounded-3xl transition-all duration-300 hover:bg-gray-800 flex items-center gap-4 ${
                  selectedTeacherId === teacher.idusers_fk
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500 scale-[1.02]'
                    : 'border-gray-700/50 hover:border-gray-600'
                }`}
              >
                <div className={`w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center transition-colors relative border-2 shrink-0 ${
                  selectedTeacherId === teacher.idusers_fk ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400' : 'border-gray-700 bg-gray-900 text-gray-500'
                }`}>
                  {teacher.avatar_url ? (
                    <Image
                      src={teacher.avatar_url}
                      alt={teacher.name}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-xl text-white">{formatName(teacher.name)}</p>
                  <p className="text-sm text-gray-400 font-medium">
                    {primary ? `Especialista em ${primary.instrument}` : 'Professor(a) Especialista'}
                  </p>

                  {/* Instrumentos que o professor ensina */}
                  {pricings.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pricings.map((p) => (
                        <span
                          key={p.instrument}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            p.instrument === selectedInstrument
                              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                              : 'bg-gray-700/40 border-gray-600/40 text-gray-300'
                          }`}
                        >
                          {p.instrument}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 bg-indigo-500/10 w-fit px-3 py-1.5 rounded-xl border border-indigo-500/20">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 capitalize">{priceLabel}</span>
                    <span className="text-sm font-black text-indigo-400">
                      {displayPrice > 0 ? `R$ ${Number(displayPrice).toFixed(2).replace('.', ',')}` : 'A combinar'}
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
            
            {filteredTeachers.length === 0 && (
              <div className="col-span-2 text-center py-12 bg-gray-800/40 rounded-3xl border border-gray-700/50">
                <p className="text-gray-400">Nenhum professor encontrado para este instrumento.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
