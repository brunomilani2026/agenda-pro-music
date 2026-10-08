export type LessonStatus = "agendada" | "aguardando_pagamento" | "realizada" | "cancelada" | "remarcada";

export type Instrument =
  | "violao"
  | "guitarra"
  | "piano"
  | "teclado"
  | "bateria"
  | "baixo"
  | "canto"
  | "violino"
  | "saxofone"
  | "flauta"
  | "cavaquinho";

export interface Lesson {
  id: string;
  studentName: string;
  teacherName: string;
  instrument: Instrument;
  date: string;        // formato ISO: "2026-03-19"
  startTime: string;   // formato "HH:mm"
  endTime: string;     // formato "HH:mm"
  status: LessonStatus;
  notes?: string;
}

export interface LessonFormData {
  studentName: string;
  teacherName: string;
  instrument: Instrument;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
}
