import "server-only";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: ReturnType<typeof createClient<any>> | null = null;

// Sem `Database` gerado via `supabase gen types` ainda, então o client fica
// solto (any) — ver web/supabase/schema.sql como fonte da verdade do schema.
export function supabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local — veja web/.env.local.example",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached = createClient<any>(url, key, { auth: { persistSession: false } });
  return cached;
}
