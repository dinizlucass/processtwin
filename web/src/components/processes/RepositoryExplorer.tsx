"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildFolderTree, flattenFolders, subtreeIds, type FolderNode, type FolderRow } from "@/lib/folders";
import { NewProcessForm } from "@/components/processes/NewProcessForm";
import { toneBadge } from "@/lib/tone";
import type { Tone } from "@/lib/mock-data";
import type { ProcessListItem } from "@/lib/queries/processes";

const criticalityTone: Record<string, Tone> = { alta: "danger", media: "warning", baixa: "success" };
const criticalityLabel: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const statusTone: Record<string, Tone> = { rascunho: "accent", em_revisao: "warning", publicado: "success", obsoleto: "danger" };
const statusLabel: Record<string, string> = { rascunho: "Rascunho", em_revisao: "Em revisão", publicado: "Publicado", obsoleto: "Obsoleto" };

const FOLDER_COLORS = ["#6366f1", "#0d9488", "#d97706", "#db2777", "#2563eb", "#475569"];

type Selection = "all" | "unfiled" | string; // string = folderId

export function RepositoryExplorer({ folders, processes }: { folders: FolderRow[]; processes: ProcessListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Selection>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tree = buildFolderTree(folders, processes.map((p) => p.folderId));
  const flat = flattenFolders(tree.roots);

  const selectedNode = selected !== "all" && selected !== "unfiled" ? tree.byId.get(selected) ?? null : null;
  const visibleProcesses =
    selected === "all"
      ? processes
      : selected === "unfiled"
        ? processes.filter((p) => p.folderId == null)
        : selectedNode
          ? (() => {
              const ids = subtreeIds(selectedNode);
              return processes.filter((p) => p.folderId && ids.has(p.folderId));
            })()
          : [];

  const currentParentForNew = selectedNode ? selectedNode.id : null; // "+ Nova pasta" cria aqui
  const headerLabel = selected === "all" ? "Todos os processos" : selected === "unfiled" ? "Sem pasta" : selectedNode?.name ?? "";

  async function api(url: string, method: string, body?: unknown): Promise<Response | null> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Falha na operação.");
        return null;
      }
      router.refresh();
      return res;
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  }

  async function createFolder(parentId: string | null) {
    const res = await api("/api/folders", "POST", { name: "Nova pasta", parentId });
    if (!res) return;
    const { folder } = (await res.json()) as { folder: { id: string } };
    if (parentId) setExpanded((s) => new Set(s).add(parentId));
    setEditingId(folder.id); // entra em modo de renomear
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex h-full min-h-0">
      {/* ÁRVORE */}
      <aside className="flex w-[266px] flex-none flex-col border-r border-border bg-surface">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-[11px] font-bold tracking-[.08em] text-slate-400 uppercase">Pastas</span>
          <button
            onClick={() => createFolder(currentParentForNew)}
            disabled={busy}
            className="rounded-[8px] border border-accent-soft-border bg-accent-soft px-2 py-1 text-[11px] font-bold text-accent-hover hover:bg-indigo-100 disabled:opacity-50"
            title={currentParentForNew ? "Nova subpasta na pasta selecionada" : "Nova pasta na raiz"}
          >
            + Pasta
          </button>
        </div>

        <div className="flex-1 overflow-auto px-2 pb-4">
          <RootRow label="Todos os processos" icon="🗂️" count={tree.total} active={selected === "all"} onClick={() => setSelected("all")} />
          <RootRow label="Sem pasta" icon="📄" count={tree.unfiled} active={selected === "unfiled"} onClick={() => setSelected("unfiled")} />
          <div className="my-2 border-t border-border-soft" />
          {tree.roots.map((n) => (
            <FolderRowView
              key={n.id}
              node={n}
              depth={0}
              expanded={expanded}
              selected={selected}
              editingId={editingId}
              menuId={menuId}
              busy={busy}
              flat={flat}
              onToggle={toggle}
              onSelect={setSelected}
              onStartRename={setEditingId}
              onRename={(id, name) => {
                setEditingId(null);
                if (name.trim()) api(`/api/folders/${id}`, "PATCH", { name });
              }}
              onCancelRename={() => setEditingId(null)}
              onMenu={setMenuId}
              onNewSub={createFolder}
              onMove={(id, parentId) => api(`/api/folders/${id}`, "PATCH", { parentId })}
              onColor={(id, color) => api(`/api/folders/${id}`, "PATCH", { color })}
              onDelete={(id, name) => {
                if (confirm(`Excluir a pasta "${name}"? As subpastas e processos dela sobem para a pasta acima.`))
                  api(`/api/folders/${id}`, "DELETE");
              }}
            />
          ))}
          {tree.roots.length === 0 && (
            <div className="px-3 py-4 text-[11.5px] leading-snug text-slate-400">
              Nenhuma pasta ainda. Crie a primeira em <b>+ Pasta</b> para organizar por área ou macroprocesso.
            </div>
          )}
        </div>
      </aside>

      {/* PROCESSOS DA PASTA SELECIONADA */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-7 py-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 flex items-center gap-2 text-[19px] font-bold tracking-tight">
              {selectedNode && <span className="h-3 w-3 rounded-[4px]" style={{ background: selectedNode.color || FOLDER_COLORS[0] }} />}
              {headerLabel}
            </h1>
            <p className="mt-1 text-[12.5px] text-muted">
              {visibleProcesses.length} {visibleProcesses.length === 1 ? "processo" : "processos"}
              {selectedNode && selectedNode.children.length > 0 ? " · inclui subpastas" : ""}
            </p>
          </div>
          <NewProcessForm folderId={currentParentForNew} folderName={selectedNode?.name} />
        </div>

        <div className="mt-5 overflow-hidden rounded-[14px] border border-border bg-surface shadow-sm">
          <div className="grid grid-cols-[2fr_1fr_0.9fr_1fr_0.8fr_1.3fr] gap-3 border-b border-border bg-page px-5 py-3 text-[10.5px] font-bold tracking-[.07em] text-muted uppercase">
            <span>Processo</span>
            <span>Departamento</span>
            <span>Criticidade</span>
            <span>Status</span>
            <span>Mapeado</span>
            <span>Ações</span>
          </div>
          {visibleProcesses.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[2fr_1fr_0.9fr_1fr_0.8fr_1.3fr] items-center gap-3 border-b border-border-soft px-5 py-3.5 text-[12.5px] last:border-b-0"
            >
              <div>
                <div className="font-bold text-slate-800">{p.name}</div>
                <div className="text-[11px] text-muted">
                  {p.code}
                  {p.ownerName ? ` · ${p.ownerName}` : ""}
                </div>
              </div>
              <span className="text-slate-600">{p.department ?? "—"}</span>
              <span>
                {p.criticality ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[criticalityTone[p.criticality]]}`}>
                    {criticalityLabel[p.criticality]}
                  </span>
                ) : (
                  "—"
                )}
              </span>
              <span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneBadge[statusTone[p.status] ?? "accent"]}`}>
                  {statusLabel[p.status] ?? p.status}
                </span>
              </span>
              <span className={`text-[11px] font-bold ${p.mapped ? "text-success-strong" : "text-slate-300"}`}>
                {p.mapped ? "Sim" : "Não"}
              </span>
              <div className="flex items-center gap-3">
                <Link href={`/modelagem/${p.id}`} className="text-[12px] font-bold text-accent hover:text-accent-hover">
                  {p.mapped ? "Abrir →" : "Mapear →"}
                </Link>
                <MoveMenu
                  current={p.folderId}
                  flat={flat}
                  disabled={busy}
                  onMove={(folderId) => api(`/api/processes/${p.id}`, "PATCH", { folderId })}
                />
              </div>
            </div>
          ))}
          {visibleProcesses.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-muted">
              Nenhum processo aqui. Crie um acima, mapeie pelo Copilot de IA, ou mova um processo existente para esta pasta.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RootRow({ label, icon, count, active, onClick }: { label: string; icon: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] font-semibold ${
        active ? "bg-accent-soft text-accent-hover" : "text-slate-600 hover:bg-page"
      }`}
    >
      <span className="text-[13px]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="rounded-full bg-page px-1.5 text-[10px] font-bold text-slate-400">{count}</span>
    </button>
  );
}

function FolderRowView({
  node,
  depth,
  expanded,
  selected,
  editingId,
  menuId,
  busy,
  flat,
  onToggle,
  onSelect,
  onStartRename,
  onRename,
  onCancelRename,
  onMenu,
  onNewSub,
  onMove,
  onColor,
  onDelete,
}: {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  selected: Selection;
  editingId: string | null;
  menuId: string | null;
  busy: boolean;
  flat: { node: FolderNode; depth: number }[];
  onToggle: (id: string) => void;
  onSelect: (s: Selection) => void;
  onStartRename: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onMenu: (id: string | null) => void;
  onNewSub: (parentId: string) => void;
  onMove: (id: string, parentId: string | null) => void;
  onColor: (id: string, color: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const isActive = selected === node.id;
  const color = node.color || FOLDER_COLORS[0];

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-[9px] py-1.5 pr-1 ${isActive ? "bg-accent-soft" : "hover:bg-page"}`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          onClick={() => onToggle(node.id)}
          className={`flex h-4 w-4 flex-none items-center justify-center text-[10px] text-slate-400 ${node.children.length ? "" : "invisible"}`}
        >
          {isOpen ? "▾" : "▸"}
        </button>
        <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: color }} />

        {editingId === node.id ? (
          <input
            autoFocus
            defaultValue={node.name}
            onBlur={(e) => onRename(node.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") onCancelRename();
            }}
            className="min-w-0 flex-1 rounded border border-indigo-400 px-1.5 py-0.5 text-[12.5px] outline-none"
          />
        ) : (
          <button
            onClick={() => onSelect(node.id)}
            className={`min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold ${isActive ? "text-accent-hover" : "text-slate-600"}`}
          >
            {node.name}
          </button>
        )}

        <span className="flex-none rounded-full bg-page px-1.5 text-[10px] font-bold text-slate-400">{node.totalCount}</span>
        <div className="relative">
          <button
            onClick={() => onMenu(menuId === node.id ? null : node.id)}
            disabled={busy}
            className="flex h-5 w-5 flex-none items-center justify-center rounded text-[13px] text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 disabled:opacity-30"
          >
            ⋯
          </button>
          {menuId === node.id && (
            <FolderMenu
              node={node}
              flat={flat}
              onClose={() => onMenu(null)}
              onRename={() => {
                onMenu(null);
                onStartRename(node.id);
              }}
              onNewSub={() => onNewSub(node.id)}
              onMove={(pid) => onMove(node.id, pid)}
              onColor={(c) => onColor(node.id, c)}
              onDelete={() => onDelete(node.id, node.name)}
            />
          )}
        </div>
      </div>

      {isOpen &&
        node.children.map((c) => (
          <FolderRowView
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            selected={selected}
            editingId={editingId}
            menuId={menuId}
            busy={busy}
            flat={flat}
            onToggle={onToggle}
            onSelect={onSelect}
            onStartRename={onStartRename}
            onRename={onRename}
            onCancelRename={onCancelRename}
            onMenu={onMenu}
            onNewSub={onNewSub}
            onMove={onMove}
            onColor={onColor}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

function FolderMenu({
  node,
  flat,
  onClose,
  onRename,
  onNewSub,
  onMove,
  onColor,
  onDelete,
}: {
  node: FolderNode;
  flat: { node: FolderNode; depth: number }[];
  onClose: () => void;
  onRename: () => void;
  onNewSub: () => void;
  onMove: (parentId: string | null) => void;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [subMenu, setSubMenu] = useState<"move" | "color" | null>(null);
  // pastas válidas como destino: exclui a própria e suas descendentes
  const banned = subtreeIds(node);
  const moveTargets = flat.filter((f) => !banned.has(f.node.id));

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute right-0 z-30 mt-1 w-48 rounded-[10px] border border-border bg-surface py-1 shadow-lg">
        <MenuItem label="Renomear" onClick={onRename} />
        <MenuItem label="Nova subpasta" onClick={onNewSub} />
        <MenuItem label="Mover para…" onClick={() => setSubMenu(subMenu === "move" ? null : "move")} chevron />
        {subMenu === "move" && (
          <div className="max-h-52 overflow-auto border-y border-border-soft bg-page/60 py-1">
            <button onClick={() => onMove(null)} className="block w-full px-4 py-1.5 text-left text-[12px] font-semibold text-slate-600 hover:bg-accent-soft">
              ⤴ Raiz (sem pasta-pai)
            </button>
            {moveTargets.map(({ node: t, depth }) => (
              <button
                key={t.id}
                onClick={() => onMove(t.id)}
                className="block w-full truncate px-4 py-1.5 text-left text-[12px] text-slate-600 hover:bg-accent-soft"
                style={{ paddingLeft: 16 + depth * 12 }}
              >
                📁 {t.name}
              </button>
            ))}
          </div>
        )}
        <MenuItem label="Cor" onClick={() => setSubMenu(subMenu === "color" ? null : "color")} chevron />
        {subMenu === "color" && (
          <div className="flex gap-1.5 px-4 py-2">
            {FOLDER_COLORS.map((c) => (
              <button key={c} onClick={() => onColor(c)} className="h-5 w-5 rounded-full border border-white shadow" style={{ background: c }} />
            ))}
          </div>
        )}
        <div className="my-1 border-t border-border-soft" />
        <MenuItem label="Excluir" danger onClick={onDelete} />
      </div>
    </>
  );
}

function MenuItem({ label, onClick, danger, chevron }: { label: string; onClick: () => void; danger?: boolean; chevron?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-[12.5px] font-semibold hover:bg-page ${danger ? "text-danger-strong" : "text-slate-700"}`}
    >
      {label}
      {chevron && <span className="text-[10px] text-slate-400">▸</span>}
    </button>
  );
}

function MoveMenu({
  current,
  flat,
  disabled,
  onMove,
}: {
  current: string | null;
  flat: { node: FolderNode; depth: number }[];
  disabled: boolean;
  onMove: (folderId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="rounded-[8px] border border-border px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-page disabled:opacity-40"
      >
        Mover ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 max-h-60 w-52 overflow-auto rounded-[10px] border border-border bg-surface py-1 shadow-lg">
            <button
              onClick={() => {
                setOpen(false);
                onMove(null);
              }}
              className={`block w-full px-4 py-1.5 text-left text-[12px] font-semibold hover:bg-accent-soft ${current == null ? "text-accent-hover" : "text-slate-600"}`}
            >
              📄 Sem pasta
            </button>
            {flat.map(({ node, depth }) => (
              <button
                key={node.id}
                onClick={() => {
                  setOpen(false);
                  onMove(node.id);
                }}
                className={`block w-full truncate px-4 py-1.5 text-left text-[12px] hover:bg-accent-soft ${current === node.id ? "font-bold text-accent-hover" : "text-slate-600"}`}
                style={{ paddingLeft: 16 + depth * 12 }}
              >
                📁 {node.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
