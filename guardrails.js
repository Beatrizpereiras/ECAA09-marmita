// Guardrails contra injeção de prompt e jailbreak.
// Camadas: (1) filtro de entrada, (2) prompt de sistema blindado com delimitadores e canário,
// (3) ferramentas com validação estrita (em carrinho.js), (4) filtro de saída,
// (5) confirmação humana do pedido, (6) limite de taxa e bloqueio temporário por reincidência.

const INVISIVEIS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

function chave(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}
function semLeet(s) { return s.replace(/[013457@$]/g, (c) => LEET[c]); }

// Padrões de ataque mais comuns (pt-BR e inglês), testados no texto sem acentos.
export const PADROES = [
  { nome: "ignorar instruções", re: /\b(ignor\w*|desconsider\w*|esquec\w*|esqueca|disregard|forget|override|bypass|burl\w*)\b.{0,40}\b(instruc\w*|regras?|orienta\w*|diretrizes|ordens|comandos? anteriores|instructions?|rules|guidelines|prompts?|restri\w*)/ },
  { nome: "revelar prompt", re: /\b(revel\w*|mostr\w*|repit\w*|imprim\w*|exib\w*|cont\w* (qual|quais)|reveal|show|print|repeat|output|leak|dump)\b.{0,40}\b(instruc\w*|prompt|configurac\w*|mensagem (de|do) sistema|instructions|system message|(suas|tuas|your) (regras|rules|diretrizes))/ },
  { nome: "prompt de sistema", re: /(system ?prompt|prompt (do|de) sistema|mensagem (do|de) sistema|pre[ -]?prompt|initial prompt|prompt inicial)/ },
  { nome: "troca de papel", re: /\b(voce agora e|a partir de agora,? voce|finja (que|ser)|fing\w+ ser|aja como|atue como|faca de conta|simule ser|interprete (o|a|um|uma)|act as|pretend (to be|you are|that)|you are now|from now on,? you|roleplay|role[- ]play)\b/ },
  { nome: "modo especial", re: /\b(jailbreak|dan|dev(eloper)? mode|modo (desenvolvedor|dev|deus|admin\w*|debug|irrestrito|sem (filtro|restric\w*|censura))|god mode|unrestricted|sem restric\w*|no restrictions|unfiltered)\b/ },
  { nome: "falsa autoridade", re: /\b(sou|eu sou|i am|i'm|aqui e|this is)\s+(o |a |the |um |uma )?(dono|dona|gerente|administrador\w*|admin|desenvolvedor\w*|programador\w*|developer|owner|creator|criador\w*|engenheir\w* da (openai|anthropic|google))\b/ },
  { nome: "novas instruções", re: /\b(nova|novas) (instruc\w*|regras|diretrizes)|\bnew (instructions|rules)\b|\b(atualizacao|update) (de|das|of) (regras|instruc\w*|rules|instructions)/ },
  { nome: "manipular preço", re: /\b(mude|mudar|altere|alterar|defina|definir|coloque|zere|zerar|reduza|change|set|make)\b.{0,30}\b(preco|precos|valor(es)? (do|da|dos|das|de)|price|cost)\b|\b(me de|me da|quero|aplique|give me)\b.{0,15}\b(\d+ ?% de desconto|desconto de \d+|tudo de graca|tudo gratis|for free)\b/ },
  { nome: "marcadores de papel", re: /<\|?(im_start|im_end|system|endoftext|eot_id|start_header_id)\|?>|\[\/?(inst|sys)\]|<<\/?sys>>|^\s*(system|sistema|assistant|assistente|developer)\s*:|<\/?mensagem_cliente>/m },
  { nome: "conteúdo codificado", re: /[a-z0-9+/]{60,}={0,2}/i },
];

const RESPOSTA_BLOQUEIO = "Sou a atendente da Panela de Ferro e só consigo ajudar com pedidos do nosso cardápio. Quer que eu mostre as marmitas de hoje?";

export function limparInvisiveis(s) {
  return String(s ?? "").normalize("NFKC").replace(INVISIVEIS, "");
}

export function detectarAtaque(texto) {
  const k = chave(limparInvisiveis(texto));
  const k2 = semLeet(k);
  for (const p of PADROES) {
    if (p.re.test(k) || p.re.test(k2)) return p.nome;
  }
  return null;
}

// Camada 1: filtro de entrada (roda ANTES de qualquer chamada ao LLM)
export function verificarEntrada(texto, maxLen = 500) {
  const t = limparInvisiveis(texto).trim();
  if (!t) return { ok: false, motivo: "vazio", resposta: "Escreva sua mensagem para eu ajudar no pedido." };
  if (t.length > maxLen) return { ok: false, motivo: "longo", resposta: `Mensagem muito longa. Escreva em até ${maxLen} caracteres.` };
  const ataque = detectarAtaque(t);
  if (ataque) return { ok: false, motivo: ataque, resposta: RESPOSTA_BLOQUEIO };
  return { ok: true, texto: t };
}

// Texto livre que vai para dentro do pedido (observação, nome, endereço): curto e sem ataques.
export function textoLivreSeguro(valor, max) {
  const t = limparInvisiveis(valor).replace(/[<>{}\[\]`]/g, "").replace(/\s+/g, " ").trim();
  if (t.length > max) return { ok: false, erro: `Texto muito longo (máximo ${max} caracteres).` };
  if (detectarAtaque(t)) return { ok: false, erro: "Texto recusado pela verificação de segurança." };
  return { ok: true, texto: t };
}

export function gerarCanario() {
  const a = new Uint8Array(6);
  globalThis.crypto.getRandomValues(a);
  return "PF-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Extrai valores em reais ("R$ 24,90", "R$24", "R$ 1.234,50") como centavos
export function extrairValores(texto) {
  const out = [];
  const re = /R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g;
  let m;
  while ((m = re.exec(String(texto)))) {
    const inteiro = Number(m[1].replace(/\./g, ""));
    const cent = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
    out.push(inteiro * 100 + cent);
  }
  return out;
}

// Camada 4: filtro de saída
export function verificarSaida(texto, { canario, frasesProtegidas = [], valoresPermitidos = new Set() }) {
  const t = String(texto ?? "");
  const k = chave(t);
  const vazou =
    (canario && t.includes(canario)) ||
    /<\/?mensagem_cliente/i.test(t) ||
    frasesProtegidas.some((f) => f.length >= 40 && k.includes(chave(f)));
  if (vazou) return { bloqueado: true, texto: RESPOSTA_BLOQUEIO, divergencias: [] };
  const divergencias = extrairValores(t).filter((v) => !valoresPermitidos.has(v));
  return { bloqueado: false, texto: t, divergencias };
}

// Camada 6: limite de mensagens
export class LimitadorTaxa {
  constructor({ intervaloMinMs = 1500, maxPorSessao = 80 } = {}) {
    this.intervaloMinMs = intervaloMinMs; this.maxPorSessao = maxPorSessao;
    this.ultima = 0; this.total = 0;
  }
  permitir(agora = Date.now()) {
    if (this.total >= this.maxPorSessao) return { ok: false, motivo: "Limite de mensagens desta sessão atingido. Recarregue a página para começar de novo." };
    if (agora - this.ultima < this.intervaloMinMs) return { ok: false, motivo: "Calma, uma mensagem de cada vez." };
    this.ultima = agora; this.total++;
    return { ok: true };
  }
}
