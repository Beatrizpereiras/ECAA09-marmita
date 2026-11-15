// Cliente da IA (Groq), chamado direto do navegador. Sem servidor.
import { GROQ_API_KEY, GROQ_MODELO } from "./config.js";

const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";
let chave = GROQ_API_KEY;

// Só os testes automáticos usam isto, para simular uma chave
export function usarChaveDeTeste(k) { chave = k; }

export class ErroLLM extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export function chaveConfigurada() {
  return typeof chave === "string" && chave.startsWith("gsk_");
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
    resp = await fetch(URL_GROQ, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
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
      ? "A chave da IA foi recusada ou desativada. A dona do site precisa atualizar o arquivo config.js."
      : resp.status === 429 ? "A IA atingiu o limite por minuto do plano gratuito. Espere um minuto e mande de novo, um pedido por vez."
      : `Erro da IA (${resp.status}).`;
    throw new ErroLLM(det ? `${msg} Detalhe: ${det.slice(0, 160)}` : msg, resp.status);
  }
  return resp.json();
}

export async function chamarLLM(system, mensagens, ferramentas) {
  if (!chaveConfigurada()) throw new ErroLLM("A chave da IA ainda não foi colocada no arquivo config.js.", 0);
  const j = await postar({
    model: GROQ_MODELO,
    temperature: 0.2,
    max_tokens: 450,
    reasoning_effort: "low", // gpt-oss pensa menos e gasta menos tokens do plano gratuito
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
  return { texto: m.content || "", chamadas, mensagem };
}
