import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const clickyButtonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 font-medium transition-all duration-300 select-none active:scale-[0.97] active:duration-100 overflow-hidden group",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-secondary hover:border-foreground/20",
        ghost:
          "bg-transparent text-foreground hover:bg-secondary/80",
        accent:
          "bg-accent text-accent-foreground hover:bg-accent/90 shadow-md hover:shadow-lg",
        glass:
          "bg-white/5 backdrop-blur-md text-foreground border border-white/10 hover:bg-white/10 hover:border-white/20",
      },
      size: {
        default: "px-8 py-3 text-xs uppercase tracking-[0.2em] rounded-full",
        sm: "px-5 py-2 text-[10px] uppercase tracking-[0.15em] rounded-full",
        lg: "px-12 py-4 text-xs uppercase tracking-[0.25em] rounded-full",
        icon: "w-10 h-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ClickyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof clickyButtonVariants> {
  ripple?: boolean;
}

const ClickyButton = React.forwardRef<HTMLButtonElement, ClickyButtonProps>(
  ({ className, variant, size, ripple = true, children, onClick, ...props }, ref) => {
    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (ripple) {
          const btn = e.currentTarget;
          const rect = btn.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const rippleEl = document.createElement("span");
          rippleEl.className =
            "absolute rounded-full bg-white/20 animate-ping pointer-events-none";
          rippleEl.style.left = `${x}px`;
          rippleEl.style.top = `${y}px`;
          rippleEl.style.width = "10px";
          rippleEl.style.height = "10px";
          rippleEl.style.transform = "translate(-50%, -50%)";
          btn.appendChild(rippleEl);
          setTimeout(() => rippleEl.remove(), 600);
        }
        onClick?.(e);
      },
      [onClick, ripple]
    );

    return (
      <button
        className={cn(clickyButtonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </button>
    );
  }
);
ClickyButton.displayName = "ClickyButton";

export { ClickyButton, clickyButtonVariants };
