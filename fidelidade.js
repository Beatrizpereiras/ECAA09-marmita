// Cartão fidelidade com código (ex.: CF-4821).
// - O cartão é criado na primeira compra confirmada e o código é mostrado ao cliente.
// - No próximo pedido o cliente informa o código na conversa e os selos continuam somando.
// - 1 selo por marmita confirmada; com 10 selos, a próxima marmita sai por conta da casa (resgate na entrega).
// Sem servidor, os cartões ficam guardados no navegador (localStorage). O código é gerado pelo
// sistema da loja, nunca pela IA, e o formato CF- é diferente do canário secreto (PF-...).
export const META = 10;
const CHAVE = "pf_cartoes";
const REGEX_CODIGO = /\bCF[\s-]?(\d{4})\b/i;

let atual = null; // código vinculado nesta visita

function ler() {
  try { const d = JSON.parse(globalThis.localStorage?.getItem(CHAVE) || "{}"); return d && typeof d === "object" ? d : {}; }
  catch { return {}; }
}
function gravar(d) {
  try { globalThis.localStorage?.setItem(CHAVE, JSON.stringify(d)); } catch { /* sem armazenamento: vale só nesta visita */ }
}
function avisar() {
  if (typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new CustomEvent("pf:cartao", { detail: cartaoAtual() }));
}
function novoCodigo(d) {
  let c;
  do { c = "CF-" + String(1000 + Math.floor(Math.random() * 9000)); } while (d[c]);
  return c;
}

export function extrairCodigo(texto) {
  const m = REGEX_CODIGO.exec(String(texto || ""));
  return m ? `CF-${m[1]}` : null;
}

export function cartaoAtual() {
  if (!atual) return null;
  const c = ler()[atual];
  return c ? { codigo: atual, selos: c.selos } : null;
}

// Cliente informou um código na conversa
export function vincular(codigo) {
  const d = ler();
  if (!d[codigo]) return { ok: false, codigo };
  atual = codigo;
  avisar();
  return { ok: true, ...cartaoAtual(), completo: d[codigo].selos >= META };
}

// Chamado quando o cliente clica em Confirmar pedido
export function registrarCompra(marmitas) {
  const d = ler();
  if (!atual && marmitas <= 0) return null; // sem marmita e sem cartão: nada a carimbar
  let criado = false;
  if (!atual || !d[atual]) {
    atual = novoCodigo(d);
    d[atual] = { selos: 0, criado: new Date().toISOString().slice(0, 10) };
    criado = true;
  }
  const c = d[atual];
  let resgatou = false;
  if (c.selos >= META && marmitas > 0) { c.selos -= META; resgatou = true; } // usou a marmita grátis neste pedido
  c.selos += Math.max(0, marmitas);
  gravar(d);
  avisar();
  return { codigo: atual, selos: c.selos, ganhou: marmitas, criado, resgatou, completo: c.selos >= META };
}

// Texto que a Bia mostra depois da confirmação
export function mensagemCompra(r) {
  if (!r) return "";
  const conta = `${Math.min(r.selos, META)} de ${META} selos`;
  const partes = [];
  if (r.resgatou) partes.push("Sua marmita grátis do cartão fidelidade foi usada neste pedido: o desconto é dado na entrega.");
  if (r.criado) {
    partes.push(`Você ganhou o **Cartão Fidelidade Panela de Ferro**! Seu código é **${r.codigo}**. Guarde ele: no próximo pedido é só me passar o código.`);
    partes.push(`Este pedido já carimbou ${r.ganhou} ${r.ganhou === 1 ? "selo" : "selos"}: agora são ${conta}.`);
  } else if (r.ganhou > 0) {
    partes.push(`Carimbei ${r.ganhou} ${r.ganhou === 1 ? "selo" : "selos"} no seu cartão **${r.codigo}**: agora são ${conta}.`);
  }
  if (r.completo) partes.push(`Cartão completo! No próximo pedido, me passe o código ${r.codigo}: uma marmita sai por nossa conta.`);
  return partes.join("\n");
}

// Para os testes automáticos
export function _reiniciarParaTeste() { atual = null; }
