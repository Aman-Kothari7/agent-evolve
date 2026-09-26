export function PageHeader({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-8 gap-y-4">
      <div className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-1 text-3xl lg:text-4xl">{title}</h1>
        {children && <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>}
      </div>
      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}
