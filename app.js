// Interface: liga a conversa, a comanda e a configuração da IA.
import { RESTAURANTE, DIAS, brl, itensDoDia } from "./cardapio.js";
import { Pedido, descreverPersonalizacoes } from "./carrinho.js";
import { Agente } from "./agente.js";
import { PROVEDORES } from "./llm.js";

const $ = (id) => document.getElementById(id);

// Dia da semana: hoje, ou ?dia=0..6 na URL para testar outros cardápios
const param = new URLSearchParams(location.search).get("dia");
const DIA = /^[0-6]$/.test(param ?? "") ? Number(param) : new Date().getDay();
const dataTexto = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

// ---------- configuração da IA (só no navegador) ----------
const CHAVE_STORAGE = "panela-de-ferro.ia";
function lerConfig() {
  for (const st of [sessionStorage, localStorage]) {
    try { const v = JSON.parse(st.getItem(CHAVE_STORAGE) || "null"); if (v) return v; } catch { /* storage indisponível */ }
  }
  return { provedor: "groq", modelo: PROVEDORES.groq.modelo, chave: "" };
}
let config = lerConfig();
function salvarConfig(cfg, lembrar) {
  config = cfg;
  try {
    localStorage.removeItem(CHAVE_STORAGE); sessionStorage.removeItem(CHAVE_STORAGE);
    (lembrar ? localStorage : sessionStorage).setItem(CHAVE_STORAGE, JSON.stringify(cfg));
  } catch { /* segue só em memória */ }
}

// ---------- estado ----------
const pedido = new Pedido(DIA);
const agente = new Agente({ pedido, obterConfig: () => config, dia: DIA, dataTexto });

// ---------- mensagens (sempre via textContent: nada do modelo vira HTML) ----------
function linhaComNegrito(texto, el) {
  texto.split(/(\*\*[^*]+\*\*)/g).forEach((parte) => {
    if (/^\*\*[^*]+\*\*$/.test(parte)) { const b = document.createElement("strong"); b.textContent = parte.slice(2, -2); el.append(b); }
    else if (parte) el.append(document.createTextNode(parte));
  });
}
function montarTexto(texto, alvo) {
  let lista = null;
  for (const bruta of String(texto).split("\n")) {
    const l = bruta.trim();
    if (!l) { lista = null; continue; }
    const m = l.match(/^([-•*]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!lista) { lista = document.createElement("ul"); alvo.append(lista); }
      const li = document.createElement("li"); linhaComNegrito(m[2], li); lista.append(li);
    } else {
      lista = null;
      const p = document.createElement("p"); linhaComNegrito(l.replace(/^#+\s*/, ""), p); alvo.append(p);
    }
  }
}

function adicionarMensagem(autor, texto, { tipo = "normal", nota = null } = {}) {
  const li = document.createElement("li");
  li.className = `msg msg--${autor}` + (tipo === "bloqueado" ? " msg--bloqueado" : "") + (tipo === "erro" ? " msg--erro" : "");
  const quem = document.createElement("span"); quem.className = "quem";
  quem.textContent = autor === "cliente" ? "Você" : RESTAURANTE.atendente;
  const balao = document.createElement("div"); balao.className = "balao";
  montarTexto(texto, balao);
  li.append(quem, balao);
  if (tipo === "bloqueado") {
    const s = document.createElement("span"); s.className = "selo"; s.textContent = "Mensagem barrada pela proteção do atendimento"; li.append(s);
  }
  if (nota) { const n = document.createElement("p"); n.className = "conferir"; n.textContent = nota; li.append(n); }
  $("mensagens").append(li);
  li.scrollIntoView({ block: "end", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return li;
}

function mostrarDigitando() {
  const li = document.createElement("li");
  li.className = "msg msg--bot digitando";
  li.setAttribute("aria-label", `${RESTAURANTE.atendente} está escrevendo`);
  const b = document.createElement("div"); b.className = "balao"; b.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  li.append(b); $("mensagens").append(li); li.scrollIntoView({ block: "end" });
  return li;
}

function saudacao() {
  const marmitas = itensDoDia(DIA).filter((i) => i.categoria === "marmita");
  const lista = marmitas.map((i) => `- ${i.nome.replace("Marmita de ", "").replace("Marmita ", "")}: ${brl(i.preco)}`).join("\n");
  let t = `Oi! Eu sou a ${RESTAURANTE.atendente}, da ${RESTAURANTE.nome}. As marmitas de hoje (${DIAS[DIA]}) são:\n${lista}\n\nMe diga o que você quer do seu jeito. Dá para tirar ingredientes, mudar o tempero e escolher o ponto da carne. Também temos acompanhamentos, bebidas e sobremesas.`;
  if (!config.chave) t += "\n\nAntes da primeira mensagem, toque em **Configurar IA** e cole uma chave de API (leva um minuto).";
  adicionarMensagem("bot", t);
}

// ---------- comanda ----------
function renderComanda() {
  const ul = $("linhas"); ul.replaceChildren();
  if (!pedido.linhas.length) {
    const li = document.createElement("li"); li.className = "vazio"; li.textContent = "Nada por aqui ainda. Os itens aparecem assim que você pedir na conversa."; ul.append(li);
  }
  for (const l of pedido.linhas) {
    const li = document.createElement("li");
    const l1 = document.createElement("div"); l1.className = "l1";
    const nome = document.createElement("span");
    const num = document.createElement("span"); num.className = "num"; num.textContent = `#${l.linha}`;
    nome.append(num, `${l.qtd}× ${l.nome}`);
    const val = document.createElement("span"); val.textContent = brl(pedido.precoUnitario(l) * l.qtd);
    l1.append(nome, val); li.append(l1);
    const det = descreverPersonalizacoes(l.personalizacoes);
    const d = document.createElement("div"); d.className = "det";
    d.textContent = (l.qtd > 1 ? `${brl(pedido.precoUnitario(l))} cada` : "") + (det ? (l.qtd > 1 ? "; " : "") + det : "");
    if (d.textContent) li.append(d);
    ul.append(li);
  }

  const taxa = pedido.taxaEntrega();
  $("vSub").textContent = brl(pedido.subtotal());
  $("rEntrega").textContent = pedido.entrega.modo === "retirada" ? "Retirada no balcão" : pedido.entrega.bairro ? `Entrega (${pedido.entrega.bairro})` : "Entrega";
  $("vEntrega").textContent = taxa === null ? "a definir" : taxa === 0 && pedido.entrega.modo === "entrega" ? "grátis" : brl(taxa);
  $("vTotal").textContent = brl(pedido.total());
  $("vTotalMini").textContent = brl(pedido.total());
  const falta = RESTAURANTE.freteGratisAPartirDe - pedido.subtotal();
  $("freteNota").textContent = pedido.entrega.modo === "retirada" ? "" :
    falta > 0 ? `Frete grátis a partir de ${brl(RESTAURANTE.freteGratisAPartirDe)}.` : "Frete grátis neste pedido.";

  const cli = $("cliente"); cli.replaceChildren();
  if (pedido.cliente) {
    const linhas = [`Cliente: ${pedido.cliente.nome}`];
    if (pedido.cliente.endereco) linhas.push(`Endereço: ${pedido.cliente.endereco}`);
    linhas.push(`Pagamento: ${pedido.cliente.pagamento}` + (pedido.cliente.troco ? ` (troco para ${brl(pedido.cliente.troco)})` : ""));
    for (const t of linhas) { const p = document.createElement("p"); p.textContent = t; cli.append(p); }
  }

  const acoes = $("acoesComanda"); acoes.replaceChildren();
  const estado = $("comandaStatus");
  if (pedido.status === "aberto") {
    estado.textContent = `${DIAS[DIA]}, em aberto`;
  } else if (pedido.status === "aguardando_confirmacao") {
    estado.textContent = "Confira tudo antes de confirmar";
    const b = document.createElement("button"); b.className = "btn btn-confirmar"; b.type = "button"; b.textContent = `Confirmar pedido de ${brl(pedido.total())}`;
    b.addEventListener("click", confirmarPedido);
    acoes.append(b);
  } else {
    estado.textContent = `Pedido nº ${pedido.numero}`;
    const c = document.createElement("div"); c.className = "carimbo";
    c.textContent = pedido.entrega.modo === "retirada" ? `Confirmado, pronto em ${RESTAURANTE.previsao}` : `Confirmado, chega em ${RESTAURANTE.previsao}`;
    const b = document.createElement("button"); b.className = "btn btn-linha"; b.type = "button"; b.textContent = "Novo pedido";
    b.addEventListener("click", novoPedido);
    acoes.append(c, b);
  }
}

function confirmarPedido() {
  const r = pedido.confirmar();
  if (!r.ok) return;
  const msg = `Pedido nº ${r.numero} confirmado! Total de ${brl(pedido.total())}. ${pedido.entrega.modo === "retirada" ? "Fica pronto para retirada" : "Chega"} em ${RESTAURANTE.previsao}. Bom apetite!`;
  agente.registrarEvento(`[O cliente confirmou o pedido nº ${r.numero} clicando no botão da comanda.] ${msg}`);
  adicionarMensagem("bot", msg);
}

function novoPedido() {
  pedido.reiniciar();
  agente.reiniciarConversa();
  adicionarMensagem("bot", "Comanda nova aberta. O que vai ser agora?");
}

pedido.addEventListener("mudou", renderComanda);

// ---------- envio ----------
let ocupado = false;
async function enviar(texto) {
  texto = texto.trim();
  if (!texto || ocupado) return;
  if (!config.chave) { abrirConfig(); return; }
  ocupado = true; $("enviar").disabled = true;
  adicionarMensagem("cliente", texto);
  $("entrada").value = ""; ajustarAltura();
  const dig = mostrarDigitando();
  try {
    const r = await agente.responder(texto);
    dig.remove();
    adicionarMensagem("bot", r.texto, { tipo: r.tipo === "conferir" ? "normal" : r.tipo, nota: r.nota });
  } catch (e) {
    dig.remove();
    adicionarMensagem("bot", e?.message || "Algo deu errado ao falar com a IA. Tente de novo.", { tipo: "erro" });
    if (e?.status === 401 || e?.status === 403) abrirConfig();
  } finally {
    ocupado = false; $("enviar").disabled = false; $("entrada").focus();
  }
}

function ajustarAltura() {
  const t = $("entrada"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 144) + "px";
}

$("form").addEventListener("submit", (e) => { e.preventDefault(); enviar($("entrada").value); });
$("entrada").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar($("entrada").value); }
});
$("entrada").addEventListener("input", ajustarAltura);
$("atalhos").addEventListener("click", (e) => { const b = e.target.closest("button[data-texto]"); if (b) enviar(b.dataset.texto); });

// ---------- comanda no celular ----------
function alternarComanda(abrir) {
  $("comanda").classList.toggle("aberta", abrir);
  $("verComanda").setAttribute("aria-expanded", String(abrir));
  if (abrir) $("fecharComanda").focus(); else $("verComanda").focus();
}
$("verComanda").addEventListener("click", () => alternarComanda(true));
$("fecharComanda").addEventListener("click", () => alternarComanda(false));
$("comanda").addEventListener("click", (e) => { if (e.target === $("comanda")) alternarComanda(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("comanda").classList.contains("aberta")) alternarComanda(false); });

// ---------- diálogo de configuração ----------
const sel = $("cfgProvedor");
for (const [id, p] of Object.entries(PROVEDORES)) { const o = document.createElement("option"); o.value = id; o.textContent = p.nome; sel.append(o); }
function atualizarLink() { $("cfgLink").href = PROVEDORES[sel.value].chave; }
sel.addEventListener("change", () => { $("cfgModelo").value = PROVEDORES[sel.value].modelo; atualizarLink(); });

function abrirConfig() {
  sel.value = PROVEDORES[config.provedor] ? config.provedor : "groq";
  $("cfgModelo").value = config.modelo || PROVEDORES[sel.value].modelo;
  $("cfgChave").value = config.chave || "";
  let lembrado = false; try { lembrado = !!localStorage.getItem(CHAVE_STORAGE); } catch { /* */ }
  $("cfgLembrar").checked = lembrado;
  atualizarLink();
  $("config").showModal();
}
$("abrirConfig").addEventListener("click", abrirConfig);
$("formConfig").addEventListener("submit", () => {
  salvarConfig({ provedor: sel.value, modelo: $("cfgModelo").value.trim() || PROVEDORES[sel.value].modelo, chave: $("cfgChave").value.trim() }, $("cfgLembrar").checked);
});
$("cfgApagar").addEventListener("click", () => {
  salvarConfig({ provedor: sel.value, modelo: $("cfgModelo").value.trim(), chave: "" }, false);
  try { sessionStorage.removeItem(CHAVE_STORAGE); } catch { /* */ }
  $("cfgChave").value = "";
});

// ---------- início ----------
$("hoje").textContent = `Hoje é ${DIAS[DIA]}`;
renderComanda();
saudacao();
