"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
}

export default function StarRating({ value, onChange }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex flex-row-reverse justify-end gap-1" onMouseLeave={() => setHovered(0)}>
      {[5, 4, 3, 2, 1].map((star) => {
        const filled = (hovered || value) >= star;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            className="p-0.5 transition-transform hover:scale-110"
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
          >
            <Star
              className={`w-7 h-7 transition-colors ${
                filled ? "fill-amber-500 text-amber-500" : "fill-transparent text-gray-500"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
