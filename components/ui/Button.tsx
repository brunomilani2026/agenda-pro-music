import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-amber-500 text-gray-900 hover:bg-amber-400 active:bg-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95",
  secondary:
    "bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600 border border-gray-600 active:scale-95",
  outline:
    "border-2 border-amber-500 text-amber-500 hover:bg-amber-500/10 active:bg-amber-500/20 active:scale-95",
  ghost:
    "text-gray-400 hover:bg-gray-800 active:bg-gray-700 hover:text-white active:scale-95",
  danger:
    "bg-red-600 text-white hover:bg-red-500 active:bg-red-800 shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm rounded-lg",
  md: "px-6 py-3 text-sm font-bold rounded-xl",
  lg: "px-8 py-4 text-base font-bold rounded-2xl",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        font-medium
        transition-all duration-150 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
