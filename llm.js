// Cliente da IA. O site chama o Worker no Cloudflare, que guarda a chave do Groq em segredo
// e repassa o pedido. Assim a chave nunca aparece no navegador.
import { API_URL } from "./config.js";

// Mantido só para os testes automáticos (não existe mais chave no site)
export function usarChaveDeTeste() {}

export class ErroLLM extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export function chaveConfigurada() {
  return typeof API_URL === "string" && API_URL.startsWith("https://");
}

function lerArgs(s) {
  if (s && typeof s === "object") return s;
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; }
  catch { return { __erro_argumentos: true }; }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Quantos segundos o Groq pediu para esperar (cabeçalho retry-after ou texto "try again in 7.66s")
function segundosParaEsperar(resp, mensagem) {
  const h = Number(resp.headers.get("retry-after"));
  if (Number.isFinite(h) && h > 0) return h;
  const m = /try again in ([\d.]+)\s*(ms|s)/i.exec(mensagem || "");
  if (m) return m[2].toLowerCase() === "ms" ? Number(m[1]) / 1000 : Number(m[1]);
  return 10;
}

async function postar(body, tentativa = 0) {
  let resp;
  try {
    resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ErroLLM("Não consegui falar com a IA. Verifique a internet e tente de novo.", 0);
  }
  if (!resp.ok) {
    let det = "";
    try { const j = await resp.json(); det = j?.error?.message || ""; } catch { /* sem corpo */ }
    // Limite por minuto do plano gratuito: espera o tempo pedido e tenta de novo sozinho
    if (resp.status === 429 && tentativa < 2) {
      const s = segundosParaEsperar(resp, det);
      if (s <= 30) { await esperar(Math.ceil(s * 1000) + 300); return postar(body, tentativa + 1); }
    }
    const msg = resp.status === 401 || resp.status === 403
      ? "A chave da IA foi recusada ou desativada. A dona do site precisa atualizar o segredo GROQ_API_KEY no Cloudflare."
      : resp.status === 429 ? "A IA atingiu o limite por minuto do plano gratuito. Espere um minuto e mande de novo, um pedido por vez."
      : `Erro da IA (${resp.status}).`;
    throw new ErroLLM(det ? `${msg} Detalhe: ${det.slice(0, 160)}` : msg, resp.status);
  }
  return resp.json();
}

export async function chamarLLM(system, mensagens, ferramentas) {
  if (!chaveConfigurada()) throw new ErroLLM("O endereço da IA (API_URL) ainda não foi colocado no arquivo config.js.", 0);
  // O modelo é escolhido no Worker; aqui vai só o pedido
  const j = await postar({
    // gpt-oss foi treinado para temperatura 1: valores baixos fazem o modelo "travar" e soltar lixo ("… ? ? ?")
    temperature: 1,
    // O raciocínio do gpt-oss também conta neste limite; com pouco espaço a resposta saía cortada
    max_tokens: 1024,
    reasoning_effort: "medium", // pensa o suficiente para não adicionar item que o cliente não pediu
    messages: [{ role: "system", content: system }, ...mensagens],
    tools: ferramentas.map((f) => ({ type: "function", function: f })),
    tool_choice: "auto",
  });
  const m = j?.choices?.[0]?.message;
  if (!m) throw new ErroLLM("Resposta vazia da IA.", 200);
  const chamadas = (m.tool_calls || []).map((tc, i) => ({
    id: tc.id || `call_${Date.now()}_${i}`, nome: tc.function?.name, args: lerArgs(tc.function?.arguments),
  }));
  const mensagem = { role: "assistant", content: m.content || (chamadas.length ? null : "") };
  if (chamadas.length) {
    mensagem.tool_calls = chamadas.map((c) => ({ id: c.id, type: "function", function: { name: c.nome, arguments: JSON.stringify(c.args) } }));
  }
  // finish_reason "length" = o limite de tokens cortou a resposta no meio
  const cortada = j?.choices?.[0]?.finish_reason === "length";
  return { texto: m.content || "", chamadas, mensagem, cortada };
}
