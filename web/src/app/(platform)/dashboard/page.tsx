import Link from "next/link";
import { getDashboardData } from "@/lib/queries/dashboard";
import { toneBadge, toneBar, toneDot, toneText } from "@/lib/tone";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { kpis, departmentMaturity, pendingAlerts } = await getDashboardData();

  return (
    <div className="flex max-w-[1240px] flex-col gap-5 px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Visão Geral</h1>
          <p className="mt-1 text-[13px] text-muted">Saúde do mapeamento de processos · Atualizado há 12 min</p>
        </div>
        <Link
          href="/processos"
          className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-accent-hover"
        >
          + Novo Processo
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[14px] border border-border bg-surface px-5 py-4.5 shadow-sm">
            <div className="text-[12px] font-semibold text-muted">{k.label}</div>
            <div className={`mt-1.5 text-[30px] font-bold tracking-tight ${k.valueTone ? toneText[k.valueTone] : ""}`}>
              {k.value}
            </div>
            {k.progress ? (
              <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-page">
                <div className="h-full rounded-full bg-accent" style={{ width: `${k.progress}%` }} />
              </div>
            ) : (
              <div className={`mt-1 text-[11.5px] font-semibold ${k.tone === "success" ? toneText.success : "text-muted"}`}>
                {k.note}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-4">
        <div className="rounded-[14px] border border-border bg-surface px-6 py-5.5 shadow-sm">
          <div className="mb-4.5 flex items-center justify-between">
            <div className="text-[14px] font-bold">Maturidade por Departamento</div>
            <div className="text-[11.5px] text-muted">% de processos atualizados</div>
          </div>
          <div className="flex flex-col gap-3.5">
            {departmentMaturity.map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <div className="w-23 flex-none text-[12.5px] font-semibold text-slate-700">{d.name}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${toneBar[d.tone]}`} style={{ width: `${d.pct}%` }} />
                </div>
                <div className={`w-9.5 flex-none text-right text-[12px] font-bold ${toneText[d.tone]}`}>{d.pct}%</div>
              </div>
            ))}
          </div>
          <div className="mt-4.5 flex gap-4 border-t border-border-soft pt-3.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full bg-success" />
              Saudável (≥80%)
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full bg-warning" />
              Atenção (60–79%)
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full bg-danger" />
              Risco (&lt;60%)
            </div>
          </div>
        </div>

        <div className="rounded-[14px] border border-border bg-surface px-6 py-5.5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[14px] font-bold">Ações Pendentes</div>
            <a href="#" className="text-[12px] font-semibold">
              Ver todas
            </a>
          </div>
          <div className="flex flex-col gap-1.5">
            {pendingAlerts.map((a) => (
              <div key={a.title} className="flex cursor-pointer items-start gap-2.5 rounded-[10px] p-2.5 hover:bg-page/60">
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${toneDot[a.tone]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] leading-tight font-semibold">{a.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted">{a.desc}</div>
                </div>
                <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[a.tone]}`}>
                  {a.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
