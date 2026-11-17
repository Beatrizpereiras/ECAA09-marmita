// Interface: liga a conversa e a comanda ao agente.
import { RESTAURANTE, DIAS, ITENS, brl, itensDoDia } from "./cardapio.js";
import { Pedido, descreverPersonalizacoes } from "./carrinho.js";
import { Agente } from "./agente.js";
import { chaveConfigurada } from "./llm.js";
import { extrairCodigo, vincular, registrarCompra, mensagemCompra, cartaoAtual, META } from "./fidelidade.js";

const $ = (id) => document.getElementById(id);
const ITENS_MARMITA = new Set(ITENS.filter((i) => i.categoria === "marmita").map((i) => i.id));

// Dia da semana: hoje, ou ?dia=0..6 na URL para testar outros cardápios
const param = new URLSearchParams(location.search).get("dia");
const DIA = /^[0-6]$/.test(param ?? "") ? Number(param) : new Date().getDay();
const dataTexto = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

// ---------- estado ----------
const pedido = new Pedido(DIA);
const agente = new Agente({ pedido, dia: DIA, dataTexto });

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
  let t = `Oi! Eu sou a ${RESTAURANTE.atendente}, chef aqui da ${RESTAURANTE.nome}. Hoje (${DIAS[DIA]}) saem da panela:\n${lista}\n\nToque em **Quero esta** no cardápio ou me diga do seu jeito, por exemplo: "2 de frango, uma sem feijão". Eu tiro ingrediente, ajusto o tempero e o ponto da carne.`;
  if (!chaveConfigurada()) t += "\n\n**Atenção:** a chave da IA ainda não foi colocada no arquivo config.js, então ainda não consigo responder.";
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
    const b = document.createElement("button"); b.type = "button";
    if (ocupado) { b.className = "btn btn-espera"; b.disabled = true; b.textContent = "Aguarde a Bia terminar…"; }
    else { b.className = "btn btn-confirmar"; b.textContent = `Confirmar pedido de ${brl(pedido.total())}`; b.addEventListener("click", confirmarPedido); }
    acoes.append(b);
  } else {
    estado.textContent = `Pedido nº ${pedido.numero}`;
    const c = document.createElement("div"); c.className = "carimbo";
    c.textContent = pedido.entrega.modo === "retirada" ? `Confirmado, pronto em ${RESTAURANTE.previsao}` : `Confirmado, chega em ${RESTAURANTE.previsao}`;
    const b = document.createElement("button"); b.className = "btn btn-linha"; b.type = "button"; b.textContent = "Novo pedido";
    b.addEventListener("click", novoPedido);
    acoes.append(c, b);
  }
  renderAcaoChat();
}

// Botão grande dentro do chat, logo acima de "Ver comanda": o cliente confirma sem precisar abrir a comanda
function renderAcaoChat() {
  const area = $("acaoChat"); area.replaceChildren();
  const cartao = cartaoAtual();
  if (cartao) area.append(Object.assign(document.createElement("span"), { className: "chip-cartao", textContent: `Cartão ${cartao.codigo} · ${Math.min(cartao.selos, META)}/${META} selos` }));
  if (ocupado) return; // enquanto a Bia escreve, nada de confirmar (evita resposta atrasada depois da confirmação)
  if (pedido.status === "aguardando_confirmacao") {
    const b = document.createElement("button"); b.className = "btn btn-confirmar"; b.type = "button";
    b.textContent = `Confirmar pedido de ${brl(pedido.total())}`;
    b.addEventListener("click", confirmarPedido);
    area.append(b);
  } else if (pedido.status === "confirmado") {
    const b = document.createElement("button"); b.className = "btn btn-linha"; b.type = "button"; b.textContent = "Fazer novo pedido";
    b.addEventListener("click", novoPedido);
    area.append(b);
  }
}

function confirmarPedido() {
  if (ocupado) return;
  const r = pedido.confirmar();
  if (!r.ok) return;
  const msg = `Pedido nº ${r.numero} confirmado! Total de ${brl(pedido.total())}. ${pedido.entrega.modo === "retirada" ? "Fica pronto para retirada" : "Chega"} em ${RESTAURANTE.previsao}. Bom apetite!`;
  // Cartão fidelidade (fidelidade.js): 1 selo por marmita confirmada; cria o cartão na primeira compra
  const marmitas = pedido.linhas.filter((l) => l.itemId && ITENS_MARMITA.has(l.itemId)).reduce((t, l) => t + l.qtd, 0);
  const fid = mensagemCompra(registrarCompra(marmitas));
  const texto = fid ? `${msg}\n\n${fid}` : msg;
  agente.registrarEvento(`[O cliente confirmou o pedido nº ${r.numero} clicando no botão da comanda.] ${texto.replace(/\*\*/g, "")}`);
  adicionarMensagem("bot", texto);
  renderAcaoChat();
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
  ocupado = true; $("enviar").disabled = true;
  adicionarMensagem("cliente", texto);
  $("entrada").value = ""; ajustarAltura();
  const dig = mostrarDigitando();
  renderComanda(); // esconde o botão de confirmar enquanto a Bia responde
  // Código do cartão fidelidade na mensagem: o site confere e avisa a IA por uma nota do sistema
  let nota = "";
  const codigo = extrairCodigo(texto);
  if (codigo) {
    const v = vincular(codigo);
    nota = v.ok
      ? `cartão fidelidade ${v.codigo} encontrado e vinculado a este pedido, com ${Math.min(v.selos, META)} de ${META} selos${v.completo ? " (cartão completo: a próxima marmita deste pedido sai grátis, com desconto dado na entrega)" : ""}. Os novos selos são carimbados quando o cliente confirmar.`
      : cartaoAtual()
        ? `o código ${codigo} não foi encontrado. Peça para o cliente conferir; o cartão ${cartaoAtual().codigo}, já vinculado, continua valendo.`
        : `o código ${codigo} não foi encontrado. Peça para o cliente conferir; se não tiver o código certo, um cartão novo é criado quando ele confirmar o pedido.`;
  }
  try {
    const r = await agente.responder(texto, nota);
    dig.remove();
    adicionarMensagem("bot", r.texto, { tipo: r.tipo === "conferir" ? "normal" : r.tipo, nota: r.nota });
  } catch (e) {
    dig.remove();
    adicionarMensagem("bot", e?.message || "Algo deu errado ao falar com a IA. Tente de novo.", { tipo: "erro" });
  } finally {
    ocupado = false; $("enviar").disabled = false; $("entrada").focus();
    renderComanda(); // agora sim mostra o botão de confirmar, se o pedido estiver fechado
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
// Atalhos do chat e botões "Quero esta" do cardápio: qualquer botão com data-texto vira mensagem
document.addEventListener("click", (e) => { const b = e.target.closest("button[data-texto]"); if (b && !b.disabled) enviar(b.dataset.texto); });

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

// ---------- início ----------
$("hoje").textContent = `Hoje é ${DIAS[DIA]}`;
renderComanda();
saudacao();
