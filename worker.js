// CÓPIA PARA CONSULTA do Cloudflare Worker "marmita-api" (o site não carrega este arquivo).
// O Worker de verdade é publicado no painel do Cloudflare, com a chave guardada como
// segredo GROQ_API_KEY em Settings > Variables and Secrets. A chave NUNCA vai para o GitHub.

// Ponte entre o site (GitHub Pages) e o Groq. A chave fica guardada aqui como segredo (env.GROQ_API_KEY).
const ORIGEM = "https://beatrizpereiras.github.io";
const MODELO = "openai/gpt-oss-120b";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ORIGEM,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "retry-after",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("Use POST", { status: 405, headers: cors });

    let b;
    try { b = await request.json(); } catch { return new Response('{"error":{"message":"JSON invalido"}}', { status: 400, headers: cors }); }
    if (!Array.isArray(b.messages)) return new Response('{"error":{"message":"Faltou messages"}}', { status: 400, headers: cors });

    // Só repassa os campos que o site usa; modelo e teto de tokens ficam fixos aqui
    const corpo = {
      model: MODELO,
      messages: b.messages,
      temperature: typeof b.temperature === "number" ? b.temperature : 1,
      max_tokens: Math.min(Number(b.max_tokens) || 1024, 1200),
    };
    if (Array.isArray(b.tools) && b.tools.length) { corpo.tools = b.tools; corpo.tool_choice = b.tool_choice || "auto"; }
    if (["low", "medium", "high"].includes(b.reasoning_effort)) corpo.reasoning_effort = b.reasoning_effort;

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.GROQ_API_KEY },
      body: JSON.stringify(corpo),
    });
    const h = { ...cors, "Content-Type": "application/json" };
    const ra = resp.headers.get("retry-after");
    if (ra) h["retry-after"] = ra;
    return new Response(await resp.text(), { status: resp.status, headers: h });
  },
};
