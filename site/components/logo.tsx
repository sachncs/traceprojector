import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Logo({
  className,
  showWordmark = true,
  size = "md",
}: LogoProps) {
  const sizes = {
    sm: { box: "h-6 w-6", text: "text-sm" },
    md: { box: "h-7 w-7", text: "text-[15px]" },
    lg: { box: "h-8 w-8", text: "text-base" },
  } as const;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 32 32"
        className={cn(sizes[size].box)}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="traceprojector"
      >
        <defs>
          <linearGradient
            id="logo-gradient"
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="oklch(0.78 0.18 282)" />
            <stop offset="0.55" stopColor="oklch(0.78 0.16 240)" />
            <stop offset="1" stopColor="oklch(0.82 0.14 200)" />
          </linearGradient>
          <linearGradient
            id="logo-gradient-soft"
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="oklch(0.78 0.18 282 / 0.2)" />
            <stop offset="1" stopColor="oklch(0.82 0.14 200 / 0.2)" />
          </linearGradient>
        </defs>
        <g
          stroke="url(#logo-gradient)"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 4.5 L27 11 L22.5 24 L9.5 24 L5 11 Z" opacity="0.95" />
          <path d="M16 4.5 L16 24" opacity="0.6" />
          <path d="M5 11 L22.5 24" opacity="0.4" />
          <path d="M27 11 L9.5 24" opacity="0.4" />
        </g>
        <circle cx="16" cy="11" r="2.4" fill="url(#logo-gradient)" />
        <circle
          cx="16"
          cy="11"
          r="4.5"
          fill="none"
          stroke="url(#logo-gradient-soft)"
          strokeWidth="0.5"
        />
      </svg>
      {showWordmark && (
        <span
          className={cn(
            "font-semibold tracking-[-0.02em] text-foreground",
            sizes[size].text,
          )}
        >
          traceprojector
        </span>
      )}
    </div>
  );
}
