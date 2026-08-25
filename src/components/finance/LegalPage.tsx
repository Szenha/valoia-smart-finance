import { Link } from "@tanstack/react-router";
import { TiclioLogo } from "@/components/brand/ticlio-logo";

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-3xl">
        <Link to="/login" aria-label="Voltar para login" className="inline-flex">
          <TiclioLogo variant="full-on-light" className="h-10 w-auto" />
        </Link>
        <article className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Atualizado em {updatedAt}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
          <div className="mt-6 space-y-5 text-sm leading-6 text-slate-700">{children}</div>
        </article>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}
