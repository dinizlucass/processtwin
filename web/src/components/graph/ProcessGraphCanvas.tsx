"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FolderRow } from "@/lib/folders";
import type { ProcessListItem } from "@/lib/queries/processes";
import type { Handoff } from "@/lib/handoffs";
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

const HANDOFF_COLOR = "#7c3aed"; // violeta — distinto das arestas de hierarquia

function endId(v: unknown): string {
  return typeof v === "object" && v !== null ? String((v as { id: string }).id) : String(v);
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function ProcessGraphCanvas({
  processes,
  folders,
  foldersEnabled,
  systemsByProcess,
  handoffs,
}: {
  processes: ProcessListItem[];
  folders: FolderRow[];
  foldersEnabled: boolean;
  systemsByProcess: Record<string, string[]>;
  handoffs: Handoff[];
}) {
  const router = useRouter();
  // Lib client-only, carregada no browser (dá ref real p/ zoom/centralizar).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ForceGraph, setForceGraph] = useState<any>(null);
  const fgRef = useRef<FGMethods | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const [showFolders, setShowFolders] = useState(foldersEnabled);
  const [showDepartments, setShowDepartments] = useState(true);
  const [showSystems, setShowSystems] = useState(false);
  const [showHandoffs, setShowHandoffs] = useState(true);
  const [colorBy, setColorBy] = useState<"folder" | "criticality">("folder");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [relationshipError, setRelationshipError] = useState("");
  const [targetProcess, setTargetProcess] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("");

  const hasSystems = useMemo(() => Object.values(systemsByProcess).some((a) => a.length), [systemsByProcess]);
  const processName = useMemo(() => new Map(processes.map((p) => [p.id, p.name])), [processes]);

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

  // busca reativa (CON-04): filtra/realça enquanto digita, sem esperar Enter
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const options: BuildOptions = useMemo(
    () => ({ showFolders, showDepartments, showSystems, showHandoffs, colorBy }),
    [showFolders, showDepartments, showSystems, showHandoffs, colorBy],
  );

  const graphData = useMemo(
    () => buildProcessGraph(processes, folders, systemsByProcess, options, handoffs),
    [processes, folders, systemsByProcess, options, handoffs],
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

  // nós que casam com a busca (realce reativo)
  const searchMatches = useMemo(() => {
    const q = norm(debouncedQuery);
    if (!q) return null;
    const set = new Set<string>();
    for (const n of graphData.nodes) if (norm(`${n.name} ${n.code ?? ""}`).includes(q)) set.add(n.id);
    return set;
  }, [debouncedQuery, graphData]);

  // foco por hover OU seleção → realça o subgrafo conectado
  const activeId = hoverId ?? selected?.id ?? null;
  const highlightNodes = useMemo(() => {
    if (searchMatches) {
      const matches = new Set(searchMatches);
      for (const id of searchMatches) adjacency.get(id)?.forEach((neighbor) => matches.add(neighbor));
      return matches;
    }
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    adjacency.get(activeId)?.forEach((n) => set.add(n));
    return set;
  }, [searchMatches, activeId, adjacency]);

  const linkActive = (l: GraphLink) => {
    if (searchMatches) return searchMatches.has(endId(l.source)) || searchMatches.has(endId(l.target));
    if (!activeId) return false;
    return endId(l.source) === activeId || endId(l.target) === activeId;
  };

  const fitKey = `${graphData.nodes.length}:${graphData.links.length}`;
  const fittedRef = useRef<string>("");
  useEffect(() => {
    fittedRef.current = "";
  }, [fitKey]);

  const modeProcessos = showFolders && showDepartments && !showSystems;
  const modeOcpm = showSystems && !showDepartments;

  // ao digitar Enter, centraliza no 1º resultado (zoom); realce já é reativo
  function focusSearch() {
    const q = norm(query.trim());
    if (!q) return;
    const hit = graphData.nodes.find((n) => norm(`${n.name} ${n.code ?? ""}`).includes(q)) as Positioned | undefined;
    if (hit && typeof hit.x === "number" && typeof hit.y === "number") {
      fgRef.current?.centerAt(hit.x, hit.y, 600);
      fgRef.current?.zoom(4, 600);
      setSelected(hit);
    }
  }

  const memberProcesses = (ids?: string[]) =>
    (ids ?? []).map((id) => processes.find((p) => p.id === id)).filter((p): p is ProcessListItem => Boolean(p));

  // hand-offs do processo selecionado (saída/entrada)
  const selHandoffs = useMemo(() => {
    if (!selected || selected.type !== "process" || !selected.processId) return { out: [], in: [] as Handoff[] };
    const pid = selected.processId;
    return {
      out: handoffs.filter((h) => h.source === pid),
      in: handoffs.filter((h) => h.target === pid),
    };
  }, [selected, handoffs]);

  async function confirmHandoff(h: Handoff) {
    if (busy) return;
    setBusy(true);
    setRelationshipError("");
    try {
      const res = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromProcess: h.source, toProcess: h.target, label: h.label ?? null }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setRelationshipError(j.error || "Não foi possível salvar a conexão.");
        return;
      }
      setShowHandoffs(true);
      router.refresh();
    } catch {
      setRelationshipError("Falha de rede. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function removeHandoff(h: Handoff) {
    if (busy) return;
    setBusy(true);
    setRelationshipError("");
    try {
      const qs = h.relationshipId ? `id=${h.relationshipId}` : `from=${h.source}&to=${h.target}`;
      const res = await fetch(`/api/relationships?${qs}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Falha ao remover conexão."); }
      router.refresh();
    } catch (error) {
      setRelationshipError(error instanceof Error ? error.message : "Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  const empty = graphData.nodes.length === 0;

  return (
    <div className="relative flex h-full min-h-0">
      {/* ÁREA DO GRAFO */}
      <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-page">
        {ForceGraph && size.w > 0 && size.h > 0 && !empty ? (
          <ForceGraph
            ref={fgRef}
            graphData={graphData}
            width={size.w}
            height={size.h}
            backgroundColor="#eef2f7"
            nodeRelSize={1}
            nodeVal={(n: GraphNode) => n.val}
            nodeLabel={(n: GraphNode) => escapeHtml(`${TYPE_LABEL[n.type]}: ${n.name}`)}
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

              const showLabel = graphData.nodes.length <= 50 || scale > 1.4 || (highlightNodes ? highlightNodes.has(n.id) : n.type !== "process" && r > 7);
              if (showLabel) {
                const fs = Math.max(11 / scale, 1.4);
                ctx.font = `${n.type === "process" ? 600 : 700} ${fs}px Segoe UI, system-ui, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.globalAlpha = dim ? 0.1 : 0.95;
                ctx.fillStyle = "#1e293b";
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
              const handoff = l.kind === "handoff";
              const on = linkActive(l);
              if (highlightNodes && !on) return handoff ? "rgba(124,58,237,0.10)" : "rgba(148,163,184,0.07)";
              if (handoff) return l.confirmed ? "rgba(124,58,237,0.95)" : "rgba(124,58,237,0.55)";
              // arestas de hierarquia: contraste maior que antes (CON-04)
              return on ? "rgba(51,65,85,0.9)" : "rgba(100,116,139,0.5)";
            }}
            linkWidth={(l: GraphLink) => {
              const on = linkActive(l);
              if (l.kind === "handoff") return on ? 3 : l.confirmed ? 2.2 : 1.6;
              return on ? 2.4 : 1.4;
            }}
            linkLineDash={(l: GraphLink) => (l.kind === "handoff" && !l.confirmed ? [4, 3] : null)}
            linkDirectionalArrowLength={(l: GraphLink) => (l.kind === "handoff" ? 4 : 0)}
            linkDirectionalArrowRelPos={0.85}
            linkCurvature={(l: GraphLink) => l.kind === "handoff" ? 0.15 : 0}
            linkDirectionalArrowColor={() => HANDOFF_COLOR}
            linkDirectionalParticles={(l: GraphLink) => (linkActive(l) ? 2 : 0)}
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
        ) : empty && ForceGraph ? (
          <GraphEmptyState />
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
            <button className="rounded-lg border border-border px-2 py-1.5 text-xs" onClick={() => fgRef.current?.zoomToFit(400, 60)}>Enquadrar</button>
            <button className="rounded-lg border border-border px-2 py-1.5 text-xs" onClick={() => { setShowFolders(false); setShowDepartments(false); setShowSystems(false); setShowHandoffs(true); }}>Conexões diretas</button>
            <input
              aria-label="Buscar no grafo"
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
              <Toggle
                label={`Hand-offs${handoffs.length ? ` (${handoffs.length})` : ""}`}
                checked={showHandoffs}
                disabled={handoffs.length === 0}
                onChange={setShowHandoffs}
                dot={HANDOFF_COLOR}
              />
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

        {searchMatches && <div className="absolute left-4 top-32 z-10 max-h-56 w-72 overflow-auto rounded-xl border border-border bg-surface p-2 shadow-lg" aria-label="Resultados da busca">
          <p className="px-2 py-1 text-xs text-muted">{searchMatches.size} resultados</p>
          {graphData.nodes.filter((n) => searchMatches.has(n.id)).map((n) => <button key={n.id} className="block w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-page" onClick={() => {
            setSelected(n); setQuery(""); const position = n as Positioned;
            if (position.x !== undefined && position.y !== undefined) { fgRef.current?.centerAt(position.x, position.y, 400); fgRef.current?.zoom(3, 400); }
          }}>{n.code ? `${n.code} · ` : ""}{n.name}</button>)}
        </div>}
        {/* LEGENDA */}
        {!empty && (
          <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1 rounded-[10px] border border-border bg-surface/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur-sm">
            <LegendItem color="#94a3b8" label="Processo" />
            {showFolders && <LegendItem color="#6366f1" label="Pasta" ring />}
            {showDepartments && <LegendItem color="#6366f1" label="Departamento" ring />}
            {showSystems && <LegendItem color="#0891b2" label="Sistema" ring />}
            {showHandoffs && <LegendItem color={HANDOFF_COLOR} label="Hand-off (— tracejado = sugerido)" line />}
          </div>
        )}
      </div>

      {/* PAINEL LATERAL */}
      {selected && (
        <aside className="absolute inset-y-0 right-0 z-20 flex w-[320px] max-w-full shadow-xl xl:static flex-none flex-col gap-3 overflow-auto border-l border-border bg-surface px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[.08em] text-muted uppercase">{TYPE_LABEL[selected.type]}</div>
              <h2 className="m-0 text-[16px] font-bold tracking-tight text-ink">{selected.name}</h2>
            </div>
            <button onClick={() => setSelected(null)} className="flex-none rounded-md px-1.5 text-[16px] leading-none text-slate-400 hover:text-slate-600">
              ×
            </button>
          </div>

          {relationshipError && <p role="alert" className="text-xs text-red-600">{relationshipError}</p>}
          {selected.type === "process" && <form key={selected.id} className="flex flex-col gap-2 rounded-xl border border-border bg-page p-3" onSubmit={(event) => {
            event.preventDefault();
            if (selected.processId && targetProcess && targetProcess !== selected.processId) void confirmHandoff({ source: selected.processId, target: targetProcess, label: relationshipLabel.trim(), confirmed: false });
          }}>
            <strong className="text-xs">Conectar a outro processo</strong>
            <p className="text-xs text-muted">Este processo entrega informações ou resultados para:</p>
            <select aria-label="Processo de destino" required value={targetProcess === selected.processId ? "" : targetProcess} onChange={(e) => setTargetProcess(e.target.value)} className="w-full rounded-lg border border-border bg-surface p-2 text-xs">
              <option value="">Selecione o destino</option>
              {processes.filter((p) => p.id !== selected.processId).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
            <input aria-label="Entrega entre processos" maxLength={240} value={relationshipLabel} onChange={(e) => setRelationshipLabel(e.target.value)} placeholder="O que é entregue? Ex.: pedido aprovado" className="rounded-lg border border-border bg-surface p-2 text-xs" />
            <button disabled={busy || !targetProcess || targetProcess === selected.processId} className="rounded-lg bg-accent p-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? "Salvando…" : "Salvar conexão"}</button>
          </form>}
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

              {/* HAND-OFFS (CON-03) */}
              {(selHandoffs.out.length > 0 || selHandoffs.in.length > 0) && (
                <div className="mt-1 rounded-[10px] border border-border-soft bg-page/50 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.05em] text-muted">
                    <span className="h-2 w-4 rounded-full" style={{ background: HANDOFF_COLOR }} /> Hand-offs
                  </div>
                  {selHandoffs.out.map((h) => (
                    <HandoffRow key={`o-${h.target}`} dir="out" name={processName.get(h.target) ?? "—"} h={h} busy={busy} onConfirm={confirmHandoff} onRemove={removeHandoff} />
                  ))}
                  {selHandoffs.in.map((h) => (
                    <HandoffRow key={`i-${h.source}`} dir="in" name={processName.get(h.source) ?? "—"} h={h} busy={busy} onConfirm={confirmHandoff} onRemove={removeHandoff} />
                  ))}
                  <p className="mt-1 text-[10.5px] leading-snug text-slate-400">
                    Tracejado = sugerido pela IA (saída ≈ gatilho). Confirme para virar uma relação salva.
                  </p>
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

function HandoffRow({
  dir,
  name,
  h,
  busy,
  onConfirm,
  onRemove,
}: {
  dir: "out" | "in";
  name: string;
  h: Handoff;
  busy: boolean;
  onConfirm: (h: Handoff) => void;
  onRemove: (h: Handoff) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border-soft py-1.5 last:border-b-0">
      <span className="flex-none text-[11px] font-bold text-slate-400" title={dir === "out" ? "alimenta" : "é alimentado por"}>
        {dir === "out" ? "→" : "←"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-slate-700">{name}</div>
        {h.label && <div className="truncate text-[10.5px] text-slate-400">via {h.label}</div>}
      </div>
      {h.confirmed ? (
        <button
          onClick={() => onRemove(h)}
          disabled={busy}
          className="flex-none rounded-[7px] px-2 py-0.5 text-[10.5px] font-bold text-slate-400 hover:bg-page hover:text-danger-strong disabled:opacity-40"
          title="Remover hand-off"
        >
          Remover
        </button>
      ) : (
        <button
          onClick={() => onConfirm(h)}
          disabled={busy}
          className="flex-none rounded-[7px] bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold text-accent-hover hover:bg-indigo-100 disabled:opacity-40"
          title="Confirmar hand-off sugerido"
        >
          Confirmar
        </button>
      )}
    </div>
  );
}

function GraphEmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-sm rounded-2xl border border-dashed border-border bg-surface/80 px-6 py-10 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="6" r="2.5" /><circle cx="18" cy="5" r="2.5" /><circle cx="12" cy="18" r="2.5" />
            <path d="m7.1 7.2 3.6 8.5M15.7 6.9 13.1 15.7M7.3 5.6l8.2-.9" />
          </svg>
        </div>
        <h2 className="m-0 text-[15px] font-bold text-ink">Grafo ainda vazio</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Mapeie processos com áreas e sistemas para vê-los se conectar aqui. As conexões nascem dos atributos que a IA já captura.
        </p>
        <Link href="/mapeamento" className="mt-4 inline-block rounded-[10px] bg-accent px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-accent-hover">
          Mapear um processo →
        </Link>
      </div>
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
      aria-pressed={checked}
      className={`flex items-center gap-1.5 rounded-[8px] px-2 py-1 ${
        checked ? "bg-accent-soft text-accent-hover" : "text-slate-500 hover:bg-page"
      } disabled:opacity-40`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: checked ? dot : "#cbd5e1" }} />
      {label}
    </button>
  );
}

function LegendItem({ color, label, ring, line }: { color: string; label: string; ring?: boolean; line?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      {line ? (
        <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} />
      ) : (
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: color, boxShadow: ring ? `0 0 0 1.5px #fff, 0 0 0 2.5px ${color}` : undefined }}
        />
      )}
      {label}
    </div>
  );
}
