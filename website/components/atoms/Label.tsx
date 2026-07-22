import type { LabelHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

// Echt gekoppeld <label>, nooit een placeholder als vervanging — zie
// docs/UI-DESIGN.md §8.
export default function Label({ required = false, className, children, ...rest }: LabelProps) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-grijs-900", className)} {...rest}>
      {children}
      {required && (
        <>
          <span aria-hidden> *</span>
          <span className="sr-only"> (verplicht)</span>
        </>
      )}
    </label>
  );
}
