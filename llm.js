// Cliente LLM 100% no navegador. A chave de API é digitada pelo usuário e fica só no navegador dele.
// Formato interno das mensagens: estilo OpenAI (user / assistant com tool_calls / tool).

export const PROVEDORES = {
  groq: {
    nome: "Groq (tem plano gratuito)", tipo: "openai",
    url: "https://api.groq.com/openai/v1/chat/completions",
    modelo: "llama-3.3-70b-versatile", chave: "https://console.groq.com/keys",
  },
  gemini: {
    nome: "Google Gemini (tem plano gratuito)", tipo: "openai",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelo: "gemini-2.5-flash", chave: "https://aistudio.google.com/apikey",
  },
  openai: {
    nome: "OpenAI", tipo: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    modelo: "gpt-4.1-mini", chave: "https://platform.openai.com/api-keys",
  },
  openrouter: {
    nome: "OpenRouter", tipo: "openai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelo: "meta-llama/llama-3.3-70b-instruct", chave: "https://openrouter.ai/keys",
  },
  anthropic: {
    nome: "Anthropic (Claude)", tipo: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    modelo: "claude-haiku-5-5", chave: "https://console.anthropic.com/settings/keys",
  },
};

export class ErroLLM extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

function lerArgs(s) {
  if (s && typeof s === "object") return s;
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; }
  catch { return { __erro_argumentos: true }; }
}

async function postar(url, headers, body) {
  let resp;
  try {
    resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  } catch {
    throw new ErroLLM("Não consegui falar com o provedor de IA. Verifique a internet ou troque de provedor.", 0);
  }
  if (!resp.ok) {
    let det = "";
    try { const j = await resp.json(); det = j?.error?.message || j?.message || ""; } catch { /* sem corpo */ }
    const msg = resp.status === 401 || resp.status === 403
      ? "A chave de API foi recusada. Confira em Configurar IA."
      : resp.status === 429 ? "O provedor de IA limitou as requisições. Espere um pouco e tente de novo."
      : resp.status === 404 ? "Modelo não encontrado. Confira o nome do modelo em Configurar IA."
      : `Erro do provedor de IA (${resp.status}).`;
    throw new ErroLLM(det ? `${msg} Detalhe: ${det.slice(0, 160)}` : msg, resp.status);
  }
  return resp.json();
}

async function chamarOpenAI(cfg, prov, system, mensagens, ferramentas) {
  const body = {
    model: cfg.modelo || prov.modelo,
    temperature: 0.2,
    max_tokens: 700,
    messages: [{ role: "system", content: system }, ...mensagens],
    tools: ferramentas.map((f) => ({ type: "function", function: f })),
    tool_choice: "auto",
  };
  const j = await postar(prov.url, { Authorization: `Bearer ${cfg.chave}` }, body);
  const m = j?.choices?.[0]?.message;
  if (!m) throw new ErroLLM("Resposta vazia do provedor de IA.", 200);
  const chamadas = (m.tool_calls || []).map((tc, i) => ({
    id: tc.id || `call_${Date.now()}_${i}`, nome: tc.function?.name, args: lerArgs(tc.function?.arguments),
  }));
  const mensagem = { role: "assistant", content: m.content || (chamadas.length ? null : "") };
  if (chamadas.length) {
    mensagem.tool_calls = chamadas.map((c) => ({ id: c.id, type: "function", function: { name: c.nome, arguments: JSON.stringify(c.args) } }));
  }
  return { texto: m.content || "", chamadas, mensagem };
}

export function paraAnthropic(mensagens) {
  const out = [];
  const empurrar = (role, blocos) => {
    const ult = out[out.length - 1];
    if (ult && ult.role === role) ult.content.push(...blocos);
    else out.push({ role, content: [...blocos] });
  };
  for (const m of mensagens) {
    if (m.role === "user") empurrar("user", [{ type: "text", text: m.content }]);
    else if (m.role === "tool") empurrar("user", [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content }]);
    else if (m.role === "assistant") {
      const b = [];
      if (m.content) b.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls || []) b.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: lerArgs(tc.function.arguments) });
      if (!b.length) b.push({ type: "text", text: "ok" });
      empurrar("assistant", b);
    }
  }
  return out;
}

async function chamarAnthropic(cfg, prov, system, mensagens, ferramentas) {
  const body = {
    model: cfg.modelo || prov.modelo,
    max_tokens: 700,
    temperature: 0.2,
    system,
    messages: paraAnthropic(mensagens),
    tools: ferramentas.map((f) => ({ name: f.name, description: f.description, input_schema: f.parameters })),
  };
  const j = await postar(prov.url, {
    "x-api-key": cfg.chave,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  }, body);
  const blocos = j?.content || [];
  const texto = blocos.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const chamadas = blocos.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, nome: b.name, args: b.input || {} }));
  const mensagem = { role: "assistant", content: texto || null };
  if (chamadas.length) {
    mensagem.tool_calls = chamadas.map((c) => ({ id: c.id, type: "function", function: { name: c.nome, arguments: JSON.stringify(c.args) } }));
  }
  return { texto, chamadas, mensagem };
}

export async function chamarLLM(cfg, system, mensagens, ferramentas) {
  const prov = PROVEDORES[cfg?.provedor];
  if (!prov) throw new ErroLLM("Escolha um provedor de IA em Configurar IA.", 0);
  if (!cfg.chave) throw new ErroLLM("Falta a chave de API. Abra Configurar IA.", 0);
  return prov.tipo === "anthropic"
    ? chamarAnthropic(cfg, prov, system, mensagens, ferramentas)
    : chamarOpenAI(cfg, prov, system, mensagens, ferramentas);
}
