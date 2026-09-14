"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface RevealProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
  duration?: number;
}

export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  once = true,
  duration = 0.7,
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px 0px -60px 0px" }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function RevealStagger({
  children,
  className,
  delay = 0,
  gap = 0.08,
  y = 18,
  once = true,
  duration = 0.6,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  gap?: number;
  y?: number;
  once?: boolean;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-80px 0px -60px 0px" }}
      variants={{
        hidden: {},
        show: {
          transition: {
            delayChildren: delay,
            staggerChildren: gap,
          },
        },
      }}
      className={cn(className)}
    >
      {Array.isArray(children)
        ? children.map((child, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration, ease: [0.22, 1, 0.36, 1] },
                },
              }}
            >
              {child}
            </motion.div>
          ))
        : children}
    </motion.div>
  );
}
