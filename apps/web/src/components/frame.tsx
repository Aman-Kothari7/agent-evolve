import { cn } from "@/lib/utils";

// A hairline box with drafting "+" marks on its corners.
export function Frame({ className, children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div className={cn("frame", className)} {...rest}>
      <span className="cross cross-tl" />
      <span className="cross cross-tr" />
      <span className="cross cross-bl" />
      <span className="cross cross-br" />
      {children}
    </div>
  );
}
