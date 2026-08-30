"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FolderRow } from "@/lib/folders";
import type { ProcessListItem } from "@/lib/queries/processes";
import { buildProcessGraph, type BuildOptions, type GraphLink, type GraphNode } from "@/lib/process-graph";
import { toneBadge } from "@/lib/tone";
import type { Tone } from "@/lib/mock-data";

type Positioned = GraphNode & { x?: number; y?: number };

interface FGMethods {
  zoomToFit: (ms?: number, padding?: number) => void;
  centerAt: (x?: number, y?: number, ms?: number) => void;
  zoom: (k?: number, ms?: number) => void;
}

const criticalityTone: Record<string, Tone> = { alta: "danger", media: "warning", baixa: "success" };
const criticalityLabel: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const TYPE_LABEL: Record<string, string> = { process: "Processo", folder: "Pasta", department: "Departamento", system: "Sistema" };

function endId(v: unknown): string {
  return typeof v === "object" && v !== null ? String((v as { id: string }).id) : String(v);
}
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function ProcessGraphCanvas({
  processes,
  folders,
  foldersEnabled,
  systemsByProcess,
}: {
  processes: ProcessListItem[];
  folders: FolderRow[];
  foldersEnabled: boolean;
  systemsByProcess: Record<string, string[]>;
}) {
  // Lib client-only, carregada no browser (dá ref real p/ zoom/centralizar).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ForceGraph, setForceGraph] = useState<any>(null);
  const fgRef = useRef<FGMethods | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const [showFolders, setShowFolders] = useState(foldersEnabled);
  const [showDepartments, setShowDepartments] = useState(true);
  const [showSystems, setShowSystems] = useState(false);
  const [colorBy, setColorBy] = useState<"folder" | "criticality">("folder");
  const [query, setQuery] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const hasSystems = useMemo(() => Object.values(systemsByProcess).some((a) => a.length), [systemsByProcess]);

  useEffect(() => {
    let alive = true;
    import("react-force-graph-2d").then((m) => {
      if (alive) setForceGraph(() => m.default);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ForceGraph]);

  const options: BuildOptions = useMemo(
    () => ({ showFolders, showDepartments, showSystems, colorBy }),
    [showFolders, showDepartments, showSystems, colorBy],
  );

  const graphData = useMemo(
    () => buildProcessGraph(processes, folders, systemsByProcess, options),
    [processes, folders, systemsByProcess, options],
  );

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const link = (a: string, b: string) => (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b);
    for (const l of graphData.links) {
      const s = endId(l.source);
      const t = endId(l.target);
      link(s, t);
      link(t, s);
    }
    return m;
  }, [graphData]);

  const highlightNodes = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    adjacency.get(hoverId)?.forEach((n) => set.add(n));
    return set;
  }, [hoverId, adjacency]);

  const fitKey = `${graphData.nodes.length}:${graphData.links.length}`;
  const fittedRef = useRef<string>("");
  useEffect(() => {
    fittedRef.current = "";
  }, [fitKey]);

  const modeProcessos = showFolders && showDepartments && !showSystems;
  const modeOcpm = showSystems && !showDepartments;

  function focusSearch() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = graphData.nodes.find((n) => n.name.toLowerCase().includes(q)) as Positioned | undefined;
    if (hit && typeof hit.x === "number" && typeof hit.y === "number") {
      fgRef.current?.centerAt(hit.x, hit.y, 600);
      fgRef.current?.zoom(4, 600);
      setSelected(hit);
    }
  }

  const memberProcesses = (ids?: string[]) =>
    (ids ?? []).map((id) => processes.find((p) => p.id === id)).filter((p): p is ProcessListItem => Boolean(p));

  return (
    <div className="relative flex h-full min-h-0">
      {/* ÁREA DO GRAFO */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-page">
        {ForceGraph && size.w > 0 && size.h > 0 ? (
          <ForceGraph
            ref={fgRef}
            graphData={graphData}
            width={size.w}
            height={size.h}
            backgroundColor="#eef2f7"
            nodeRelSize={1}
            nodeVal={(n: GraphNode) => n.val}
            nodeLabel={(n: GraphNode) => `${TYPE_LABEL[n.type]}: ${n.name}`}
            cooldownTicks={120}
            d3VelocityDecay={0.3}
            onEngineStop={() => {
              if (fittedRef.current !== fitKey) {
                fittedRef.current = fitKey;
                fgRef.current?.zoomToFit(500, 60);
              }
            }}
            nodeCanvasObjectMode={() => "replace"}
            nodeCanvasObject={(node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
              const n = node as Positioned;
              if (typeof n.x !== "number" || typeof n.y !== "number") return;
              const r = n.val;
              const isHi = !highlightNodes || highlightNodes.has(n.id);
              const dim = Boolean(highlightNodes) && !isHi;

              // glow
              ctx.globalAlpha = dim ? 0.05 : 0.2;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r * 1.7, 0, 2 * Math.PI);
              ctx.fillStyle = n.color;
              ctx.fill();

              // núcleo
              ctx.globalAlpha = dim ? 0.12 : 1;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = n.color;
              ctx.fill();
              if (n.type !== "process") {
                ctx.lineWidth = 1.6 / scale;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
              }

              const showLabel = scale > 1.6 || (highlightNodes ? highlightNodes.has(n.id) : n.type !== "process" && r > 7);
              if (showLabel) {
                const fs = Math.max(11 / scale, 1.4);
                ctx.font = `${n.type === "process" ? 600 : 700} ${fs}px Segoe UI, system-ui, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.globalAlpha = dim ? 0.12 : 0.92;
                ctx.fillStyle = "#334155";
                ctx.fillText(truncate(n.name, 26), n.x, n.y + r + 1.5 / scale);
              }
              ctx.globalAlpha = 1;
            }}
            nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
              const n = node as Positioned;
              if (typeof n.x !== "number" || typeof n.y !== "number") return;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(n.x, n.y, n.val * 1.35, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkColor={(l: GraphLink) => {
              if (!hoverId) return "rgba(148,163,184,0.28)";
              const on = endId(l.source) === hoverId || endId(l.target) === hoverId;
              return on ? "rgba(71,85,105,0.85)" : "rgba(148,163,184,0.06)";
            }}
            linkWidth={(l: GraphLink) => (hoverId && (endId(l.source) === hoverId || endId(l.target) === hoverId) ? 2 : 1)}
            linkDirectionalParticles={(l: GraphLink) =>
              hoverId && (endId(l.source) === hoverId || endId(l.target) === hoverId) ? 2 : 0
            }
            onNodeHover={(n: GraphNode | null) => {
              setHoverId(n ? n.id : null);
              if (wrapRef.current) wrapRef.current.style.cursor = n ? "pointer" : "grab";
            }}
            onNodeClick={(n: GraphNode) => {
              const p = n as Positioned;
              setSelected(n);
              if (typeof p.x === "number" && typeof p.y === "number") fgRef.current?.centerAt(p.x, p.y, 500);
            }}
            onBackgroundClick={() => setSelected(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted">
              <div className="h-8 w-8 animate-[pt-pulse_1.2s_ease-in-out_infinite] rounded-full bg-accent-2" />
              <span className="text-[12px]">Montando o grafo…</span>
            </div>
          </div>
        )}

        {/* TOOLBAR flutuante */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/95 px-2.5 py-2 shadow-md backdrop-blur-sm">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && focusSearch()}
              placeholder="Buscar processo, sistema…"
              className="h-8 w-52 rounded-[9px] border border-border bg-page px-3 text-[12.5px] outline-none focus:border-accent-2"
            />

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-1 rounded-[9px] border border-border p-0.5">
              <button
                onClick={() => {
                  setShowFolders(foldersEnabled);
                  setShowDepartments(true);
                  setShowSystems(false);
                }}
                className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold ${modeProcessos ? "bg-accent-soft text-accent-hover" : "text-slate-500 hover:bg-page"}`}
              >
                Processos
              </button>
              <button
                onClick={() => {
                  setShowSystems(true);
                  setShowDepartments(false);
                  setShowFolders(foldersEnabled);
                }}
                className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold ${modeOcpm ? "bg-accent-soft text-accent-hover" : "text-slate-500 hover:bg-page"}`}
                title="Objetos: sistemas viram nós (OCPM)"
              >
                OCPM
              </button>
            </div>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-slate-600">
              <Toggle label="Pastas" checked={showFolders} disabled={!foldersEnabled} onChange={setShowFolders} dot="#6366f1" />
              <Toggle label="Áreas" checked={showDepartments} onChange={setShowDepartments} dot="#6366f1" />
              <Toggle label="Sistemas" checked={showSystems} onChange={setShowSystems} dot="#0891b2" />
            </div>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted">Cor:</span>
              <select
                value={colorBy}
                onChange={(e) => setColorBy(e.target.value as "folder" | "criticality")}
                className="h-8 rounded-[9px] border border-border bg-surface px-2 text-[12px] font-semibold text-slate-600 outline-none focus:border-accent-2"
              >
                <option value="folder">Pasta</option>
                <option value="criticality">Criticidade</option>
              </select>
            </div>
          </div>

          {showSystems && !hasSystems && (
            <div className="pointer-events-auto rounded-[10px] border border-warning bg-warning-soft px-3 py-1.5 text-[11.5px] font-semibold text-warning-text">
              Nenhum sistema registrado ainda — mapeie processos com sistemas para ver a rede OCPM.
            </div>
          )}
        </div>

        {/* LEGENDA */}
        <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1 rounded-[10px] border border-border bg-surface/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur-sm">
          <LegendItem color="#94a3b8" label="Processo" />
          {showFolders && <LegendItem color="#6366f1" label="Pasta" ring />}
          {showDepartments && <LegendItem color="#6366f1" label="Departamento" ring />}
          {showSystems && <LegendItem color="#0891b2" label="Sistema" ring />}
        </div>
      </div>

      {/* PAINEL LATERAL */}
      {selected && (
        <aside className="flex w-[300px] flex-none flex-col gap-3 overflow-auto border-l border-border bg-surface px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[.08em] text-muted uppercase">{TYPE_LABEL[selected.type]}</div>
              <h2 className="m-0 text-[16px] font-bold tracking-tight text-ink">{selected.name}</h2>
            </div>
            <button onClick={() => setSelected(null)} className="flex-none rounded-md px-1.5 text-[16px] leading-none text-slate-400 hover:text-slate-600">
              ×
            </button>
          </div>

          {selected.type === "process" ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {selected.criticality && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[criticalityTone[selected.criticality]]}`}>
                    {criticalityLabel[selected.criticality]}
                  </span>
                )}
                {selected.department && (
                  <span className="rounded-full bg-page px-2 py-0.5 text-[10px] font-semibold text-slate-500">{selected.department}</span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected.mapped ? "bg-success-soft text-success-strong" : "bg-page text-slate-400"}`}>
                  {selected.mapped ? "Mapeado" : "Não mapeado"}
                </span>
              </div>
              {selected.code && <div className="font-mono text-[11px] text-muted">{selected.code}</div>}
              {selected.ownerName && (
                <div className="text-[12px] text-slate-600">
                  Dono: <b className="font-semibold text-ink">{selected.ownerName}</b>
                </div>
              )}
              <Link
                href={selected.mapped ? `/modelagem/${selected.processId}` : `/mapeamento`}
                className="mt-1 rounded-[10px] bg-accent px-4 py-2.5 text-center text-[12.5px] font-bold text-white hover:bg-accent-hover"
              >
                {selected.mapped ? "Abrir no modelador →" : "Mapear processo →"}
              </Link>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold text-muted">
                {memberProcesses(selected.memberProcessIds).length} processo(s) conectado(s)
              </div>
              {memberProcesses(selected.memberProcessIds).map((p) => (
                <Link
                  key={p.id}
                  href={p.mapped ? `/modelagem/${p.id}` : `/mapeamento`}
                  className="flex items-center justify-between gap-2 rounded-[9px] border border-border-soft bg-surface px-3 py-2 hover:border-accent-soft-border hover:bg-accent-soft/40"
                >
                  <span className="truncate text-[12.5px] font-semibold text-slate-700">{p.name}</span>
                  {p.criticality && (
                    <span className={`flex-none rounded-full px-1.5 py-0.5 text-[9px] font-bold ${toneBadge[criticalityTone[p.criticality]]}`}>
                      {criticalityLabel[p.criticality]}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
  dot,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  dot: string;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-[8px] px-2 py-1 ${
        checked ? "bg-accent-soft text-accent-hover" : "text-slate-500 hover:bg-page"
      } disabled:opacity-40`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: checked ? dot : "#cbd5e1" }} />
      {label}
    </button>
  );
}

function LegendItem({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: ring ? `0 0 0 1.5px #fff, 0 0 0 2.5px ${color}` : undefined }}
      />
      {label}
    </div>
  );
}
