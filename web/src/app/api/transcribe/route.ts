import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY não configurada." }, { status: 400 });
  }

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Áudio ausente ou vazio." }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });
  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    const file = await toFile(buffer, "fala.webm", { type: audio.type || "audio/webm" });
    const result = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1",
      language: "pt",
    });
    return Response.json({ text: result.text ?? "" });
  } catch (err) {
    console.error("[transcribe] falha na transcrição", err);
    return Response.json({ error: "Falha ao transcrever o áudio." }, { status: 500 });
  }
}
