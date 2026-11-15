// Vitrine do site: cardápio com fotos, abas por dia, cartão fidelidade e abrir/fechar o chat.
// Só monta a tela; quem vende continua sendo o agente (app.js + agente.js).
import { ITENS, DIAS, RESTAURANTE, brl, itensDoDia } from "./cardapio.js";
import { foto } from "./fotos.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

const param = new URLSearchParams(location.search).get("dia");
const HOJE = /^[0-6]$/.test(param ?? "") ? Number(param) : new Date().getDay();
const CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ---------- cartões de prato ----------
function nomeCurto(item) {
  return item.nome.replace(/^Marmita (de )?/, "").replace(/^./, (c) => c.toUpperCase());
}

function etiquetas(item) {
  const t = [];
  if (item.opcoes.ponto && item.categoria === "marmita") t.push("Ponto da carne");
  if (item.opcoes.remover) t.push("Tire o que não gosta");
  if (item.opcoes.adicionais) t.push("Adicionais");
  if (item.opcoes.sabor) t.push(item.opcoes.sabor.join(" · "));
  return t.slice(0, 2);
}

function selo(item, dia) {
  if (item.categoria !== "marmita") return null;
  if (item.dias.length === 7) return "Todo dia";
  if (item.dias.length <= 2) return `Só ${item.dias.map((d) => CURTO[d].toLowerCase()).join(" e ")}`;
  return null;
}

function cartao(item, dia, grande) {
  const art = el("article", grande ? "prato" : "prato prato--mini");
  const fig = el("div", "prato-foto");
  const src = foto(item.id, grande ? 720 : 420);
  if (src) {
    const img = el("img");
    img.src = src; img.alt = item.nome; img.loading = "lazy"; img.decoding = "async";
    img.addEventListener("error", () => fig.classList.add("sem-foto"));
    fig.append(img);
  } else fig.classList.add("sem-foto");
  const s = selo(item, dia);
  if (s) fig.append(el("span", "selo-prato", s));
  art.append(fig);

  const corpo = el("div", "prato-corpo");
  const topo = el("div", "prato-topo");
  topo.append(el("h3", null, grande ? nomeCurto(item) : item.nome), el("span", "preco", brl(item.preco)));
  corpo.append(topo, el("p", "prato-desc", item.descricao));
  if (grande) {
    const tags = el("ul", "tags");
    for (const t of etiquetas(item)) tags.append(el("li", null, t));
    if (tags.children.length) corpo.append(tags);
  }
  const btn = el("button", grande ? "btn btn-pedir" : "btn btn-pedir btn-pedir--mini");
  btn.type = "button";
  if (dia === HOJE) {
    btn.textContent = grande ? "Quero esta" : "Adicionar";
    btn.dataset.texto = `Quero 1 ${item.nome.toLowerCase()}`;
  } else {
    btn.textContent = `Disponível ${DIAS[dia].replace("-feira", "")}`;
    btn.disabled = true;
  }
  corpo.append(btn);
  art.append(corpo);
  return art;
}

function renderCardapio(dia) {
  const grade = $("gradeMarmitas"); grade.replaceChildren();
  for (const item of itensDoDia(dia).filter((i) => i.categoria === "marmita")) grade.append(cartao(item, dia, true));
  $("cardapioNota").textContent = dia === HOJE
    ? "Toque em “Quero esta” e a Bia monta o pedido com você."
    : `Você está vendo o cardápio de ${DIAS[dia]}. Pedidos só para hoje (${DIAS[HOJE]}).`;
  for (const b of $("abasDias").querySelectorAll("button")) b.setAttribute("aria-selected", String(Number(b.dataset.dia) === dia));
}

function renderAbas() {
  const abas = $("abasDias");
  for (let d = 0; d < 7; d++) {
    const b = el("button", "aba", d === HOJE ? "Hoje" : CURTO[d]);
    b.type = "button"; b.setAttribute("role", "tab"); b.dataset.dia = d;
    b.addEventListener("click", () => renderCardapio(d));
    abas.append(b);
  }
}

function renderExtras() {
  const grupos = [["acompanhamento", "gradeAcomp"], ["bebida", "gradeBebidas"], ["sobremesa", "gradeDoces"]];
  for (const [cat, id] of grupos) {
    const g = $(id); g.replaceChildren();
    for (const item of ITENS.filter((i) => i.categoria === cat)) {
      const hoje = item.dias.includes(HOJE);
      g.append(cartao(item, hoje ? HOJE : item.dias[0], false));
    }
  }
}

// Prato em destaque no topo: o especial do dia (item que só sai em poucos dias da semana)
function renderDestaque() {
  const marmitas = itensDoDia(HOJE).filter((i) => i.categoria === "marmita");
  const especial = marmitas.filter((i) => i.dias.length < 7).sort((a, b) => a.dias.length - b.dias.length)[0] || marmitas[0];
  if (!especial) return;
  $("destaqueNome").textContent = nomeCurto(especial);
  $("destaquePreco").textContent = brl(especial.preco);
  const b = $("destaqueBtn");
  b.dataset.texto = `Quero 1 ${especial.nome.toLowerCase()}`;
  // A foto grande do topo é a do especial do dia, para combinar com o cartão
  const fotoTopo = foto(especial.id, 1600);
  if (fotoTopo) { const h = $("heroFoto"); h.src = fotoTopo; h.alt = especial.nome; }
}

// ---------- cartão fidelidade (começa vazio a cada visita; carimba só depois de confirmar) ----------
const META = 10;
let selos = 0;
// Apaga selos que versões antigas do site deixaram salvos no navegador
try { localStorage.removeItem("pf_selos"); } catch { /* sem armazenamento: nada a apagar */ }
function lerSelos() { return selos; }
function salvarSelos(n) { selos = n; }

function renderSelos(animarAte = -1) {
  const n = lerSelos();
  const ciclo = n % META;
  const premio = n > 0 && ciclo === 0;
  const g = $("selos"); g.replaceChildren();
  for (let i = 0; i < META; i++) {
    const s = el("li", "selo-fid");
    const cheio = premio || i < ciclo;
    if (cheio) s.classList.add("selo-fid--cheio");
    if (i === META - 1) s.classList.add("selo-fid--premio");
    if (cheio && i >= animarAte && animarAte >= 0) s.classList.add("selo-fid--novo");
    s.setAttribute("aria-label", cheio ? `Selo ${i + 1} carimbado` : `Selo ${i + 1} vazio`);
    g.append(s);
  }
  $("selosTexto").textContent = premio
    ? "Cartão completo! Sua próxima marmita é por nossa conta. Mostre este cartão na entrega."
    : n === 0
      ? `Cada marmita confirmada vale 1 selo. Com ${META} selos, a próxima é por nossa conta.`
      : `Você tem ${ciclo} de ${META} selos. Faltam ${META - ciclo} para a marmita grátis.`;
}

window.addEventListener("pf:pedido-confirmado", (e) => {
  const antes = lerSelos() % META;
  const ganhou = Math.max(0, Number(e.detail?.marmitas) || 0);
  if (!ganhou) return;
  salvarSelos(lerSelos() + ganhou);
  renderSelos(antes);
});

// ---------- abrir e fechar o chat (celular e tablet) ----------
function abrirChat(abrir) {
  document.body.classList.toggle("chat-aberto", abrir);
  $("abrirChat").setAttribute("aria-expanded", String(abrir));
  if (abrir) setTimeout(() => $("entrada").focus({ preventScroll: true }), 250);
}
$("abrirChat").addEventListener("click", () => abrirChat(true));
$("fecharChat").addEventListener("click", () => abrirChat(false));
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-abrir-chat], .btn-pedir[data-texto], #destaqueBtn")) abrirChat(true);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("chat-aberto")) abrirChat(false); });

// ---------- início ----------
$("anoRodape").textContent = new Date().getFullYear();
$("horario").textContent = RESTAURANTE.horario;
$("previsao").textContent = RESTAURANTE.previsao;
$("freteGratis").textContent = brl(RESTAURANTE.freteGratisAPartirDe);
renderAbas();
renderCardapio(HOJE);
renderExtras();
renderDestaque();
renderSelos();
