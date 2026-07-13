import { supabaseAdmin } from "@/lib/supabase/server";

interface Answers {
  name?: string;
  owner?: string;
  criticality?: string;
  ai?: string;
  esg?: string;
  systems?: string;
}

function parseOwner(text: string): { name: string; role?: string } {
  const parts = text
    .split(/—|-/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { name: parts[0] ?? text.trim(), role: parts[1] };
}

function parseCriticality(text: string): "alta" | "media" | "baixa" | null {
  const t = text.toLowerCase();
  if (t.includes("alta")) return "alta";
  if (t.includes("média") || t.includes("media")) return "media";
  if (t.includes("baixa")) return "baixa";
  return null;
}

function parseAI(text: string): { usesAI: boolean; detail?: string } {
  const t = text.trim();
  const usesAI = /^sim/i.test(t);
  const detail = t
    .replace(/^sim\s*[—-]?\s*/i, "")
    .replace(/^não\s*/i, "")
    .trim();
  return { usesAI, detail: detail || undefined };
}

const ACCENTS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

function slugify(name: string) {
  const folded = name
    .toLowerCase()
    .split("")
    .map((ch) => ACCENTS[ch] ?? ch)
    .join("");
  return folded
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toUpperCase()
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

export async function POST(req: Request) {
  const { answers, department } = (await req.json()) as { answers: Answers; department?: string };
  const supabase = supabaseAdmin();

  let ownerId: string | null = null;
  if (answers.owner) {
    const { name, role } = parseOwner(answers.owner);
    const { data: existing } = await supabase.from("process_owner").select("id").eq("name", name).maybeSingle();
    if (existing) {
      ownerId = existing.id as string;
    } else {
      const { data, error } = await supabase.from("process_owner").insert({ name, role }).select("id").single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      ownerId = data.id as string;
    }
  }

  const criticality = answers.criticality ? parseCriticality(answers.criticality) : null;
  const { usesAI, detail } = answers.ai ? parseAI(answers.ai) : { usesAI: false, detail: undefined };
  const esgTags = answers.esg
    ? answers.esg
        .split(/·|,/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const code = `${slugify(answers.name || "PROC")}-${Date.now().toString().slice(-5)}`;

  const { data: process, error } = await supabase
    .from("process")
    .insert({
      name: answers.name || "Novo Processo",
      code,
      department: department || null,
      criticality,
      status: "rascunho",
      version: 1,
      owner_id: ownerId,
      uses_ai: usesAI,
      ai_detail: detail ?? null,
      esg_tags: esgTags,
    })
    .select("id,code")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (answers.systems) {
    const systems = answers.systems
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (systems.length) {
      await supabase.from("system_dependency").insert(
        systems.map((s) => ({ process_id: process.id, system_name: s, is_primary: false })),
      );
    }
  }

  return Response.json({ processId: process.id as string, code: process.code as string });
}
