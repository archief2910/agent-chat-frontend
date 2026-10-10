import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center rounded-lg text-sm font-medium transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none",
  {
    variants: {
      variant: {
        default: "bg-black text-white hover:bg-neutral-800",
        outline: "border border-[#ececec] bg-white text-[#111] hover:bg-[#f6f6f7]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-[13px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
