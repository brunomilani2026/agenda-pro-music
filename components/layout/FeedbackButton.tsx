"use client";

import { useState } from "react";
import { MessageCircleHeart } from "lucide-react";
import FeedbackModal from "@/components/FeedbackModal";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="relative group">
        <button
          onClick={() => setOpen(true)}
          className="p-2 text-gray-400 hover:bg-gray-700 hover:text-white rounded-xl transition-colors border border-transparent hover:border-gray-600 focus:outline-none"
          aria-label="Dar feedback"
        >
          <MessageCircleHeart className="w-5 h-5" />
        </button>
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
          Feedback
        </span>
      </div>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
