"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProcessForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [criticality, setCriticality] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { name, criticality }, department: department || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { processId } = (await res.json()) as { processId: string };
      router.push(`/modelagem/${processId}`);
    } catch (err) {
      console.error("[processos] falha ao criar processo", err);
      setErrorMsg("Não foi possível criar o processo. Tenta de novo.");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-accent-hover"
      >
        + Novo Processo
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-[14px] border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-muted">Nome do processo</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Conciliação Bancária"
          className="w-56 rounded-[9px] border border-border bg-page px-3 py-2 text-[13px] outline-none focus:border-indigo-400"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-muted">Departamento</label>
        <input
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="Ex.: Financeiro"
          className="w-40 rounded-[9px] border border-border bg-page px-3 py-2 text-[13px] outline-none focus:border-indigo-400"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-muted">Criticidade</label>
        <select
          value={criticality}
          onChange={(e) => setCriticality(e.target.value)}
          className="rounded-[9px] border border-border bg-page px-3 py-2 text-[13px]"
        >
          <option value="">—</option>
          <option value="Alta">Alta</option>
          <option value="Média">Média</option>
          <option value="Baixa">Baixa</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? "Criando…" : "Criar e abrir no modelador"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-[10px] px-3 py-2.5 text-[13px] font-semibold text-muted hover:bg-page"
      >
        Cancelar
      </button>
      {errorMsg && <div className="w-full text-[12px] font-semibold text-danger-strong">{errorMsg}</div>}
    </form>
  );
}
