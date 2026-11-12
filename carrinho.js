// Estado do pedido. É a ÚNICA fonte de verdade de itens e valores.
// O agente só mexe aqui através das ferramentas, e cada argumento é validado.
import { BAIRROS, RESTAURANTE, DIAS, ROTULOS, CAMPOS_UNICOS, normalizar, brl, buscarItem, buscarBairro } from "./cardapio.js";
import { textoLivreSeguro } from "./guardrails.js";

export const LIMITES = { qtdMax: 20, linhasMax: 25 };
export const PAGAMENTOS = ["pix", "cartão na entrega", "dinheiro"];

function erro(msg) { return { ok: false, erro: msg }; }

function casar(valor, lista) {
  const n = normalizar(valor);
  return lista.find((op) => normalizar(op) === n) ?? null;
}

// Valida as personalizações pedidas contra as opções permitidas do item.
// "base" mantém o que já estava na linha (usado em alterar_item).
export function validarPersonalizacoes(item, args, base = {}) {
  const out = { ...base, remover: [...(base.remover || [])], adicionais: [...(base.adicionais || [])] };
  const op = item.opcoes || {};

  for (const campo of CAMPOS_UNICOS) {
    const v = args[campo];
    if (v === undefined || v === null || v === "") continue;
    if (!op[campo]) return erro(`${item.nome} não permite escolher ${ROTULOS[campo]}.`);
    const ok = casar(v, op[campo]);
    if (!ok) return erro(`Opção de ${ROTULOS[campo]} inválida para ${item.nome}. Opções: ${op[campo].join(", ")}.`);
    out[campo] = ok;
  }

  if (args.remover !== undefined && args.remover !== null) {
    const lista = Array.isArray(args.remover) ? args.remover : [args.remover];
    const res = [];
    for (const r of lista) {
      if (!String(r ?? "").trim()) continue;
      const ok = casar(r, op.remover || []);
      if (!ok) {
        return erro(op.remover
          ? `Não dá para remover "${r}" de ${item.nome}. Pode remover: ${op.remover.join(", ")}.`
          : `${item.nome} não permite remover ingredientes.`);
      }
      if (!res.includes(ok)) res.push(ok);
    }
    out.remover = res;
  }

  if (args.adicionais !== undefined && args.adicionais !== null) {
    const lista = Array.isArray(args.adicionais) ? args.adicionais : [args.adicionais];
    const res = [];
    for (const a of lista) {
      if (!String(a ?? "").trim()) continue;
      const n = normalizar(a);
      const ok = (op.adicionais || []).find((x) => normalizar(x.id) === n || normalizar(x.nome) === n);
      if (!ok) {
        return erro(op.adicionais
          ? `Adicional "${a}" não existe para ${item.nome}. Opções: ${op.adicionais.map((x) => x.nome).join(", ")}.`
          : `${item.nome} não aceita adicionais.`);
      }
      if (!res.some((x) => x.id === ok.id)) res.push({ id: ok.id, nome: ok.nome, preco: ok.preco });
    }
    out.adicionais = res;
  }

  if (args.observacao !== undefined && args.observacao !== null) {
    const obs = textoLivreSeguro(args.observacao, 80);
    if (!obs.ok) return erro(obs.erro);
    out.observacao = obs.texto || undefined;
  }
  return { ok: true, valor: out };
}

export function descreverPersonalizacoes(p = {}) {
  const partes = [];
  if (p.ponto) partes.push(p.ponto);
  if (p.sabor) partes.push(p.sabor);
  if (p.acucar) partes.push(p.acucar);
  if (p.tempero && p.tempero !== "normal") partes.push(`tempero ${p.tempero}`);
  for (const r of p.remover || []) partes.push(`sem ${r}`);
  for (const a of p.adicionais || []) partes.push(`+ ${a.nome}`);
  if (p.observacao) partes.push(`obs.: ${p.observacao}`);
  return partes.join(", ");
}

export class Pedido extends EventTarget {
  constructor(dia) {
    super();
    this.dia = dia;
    this.reiniciar();
  }

  reiniciar() {
    this.linhas = [];
    this.proximaLinha = 1;
    this.entrega = { modo: null, bairro: null };
    this.cliente = null;
    this.status = "aberto"; // aberto | aguardando_confirmacao | confirmado
    this.numero = null;
    this._avisar();
  }

  _avisar() { this.dispatchEvent(new Event("mudou")); }

  _podeEditar() {
    if (this.status === "confirmado") return "Este pedido já foi confirmado. Para outro pedido, o cliente deve usar o botão Novo pedido na comanda.";
    if (this.status === "aguardando_confirmacao") this.status = "aberto"; // qualquer mudança reabre o pedido
    return null;
  }

  precoUnitario(l) { return l.precoBase + (l.personalizacoes.adicionais || []).reduce((s, a) => s + a.preco, 0); }

  subtotal() { return this.linhas.reduce((s, l) => s + this.precoUnitario(l) * l.qtd, 0); }

  taxaEntrega() {
    if (this.entrega.modo === "retirada") return 0;
    if (this.entrega.modo !== "entrega" || !this.entrega.bairro) return null;
    if (this.subtotal() >= RESTAURANTE.freteGratisAPartirDe) return 0;
    return buscarBairro(this.entrega.bairro).taxa;
  }

  total() { return this.subtotal() + (this.taxaEntrega() ?? 0); }

  adicionar(args = {}) {
    const bloqueio = this._podeEditar(); if (bloqueio) return erro(bloqueio);
    const item = buscarItem(args.item_id);
    if (!item) return erro(`Item "${args.item_id}" não existe. Consulte ver_cardapio e use o id exato.`);
    if (!item.dias.includes(this.dia)) {
      return erro(`${item.nome} não está disponível hoje (${DIAS[this.dia]}). Dias em que tem: ${item.dias.map((d) => DIAS[d]).join(", ")}.`);
    }
    const qtd = Number(args.quantidade ?? 1);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > LIMITES.qtdMax) return erro(`Quantidade deve ser um número inteiro de 1 a ${LIMITES.qtdMax}.`);
    if (this.linhas.length >= LIMITES.linhasMax) return erro("O pedido atingiu o limite de itens diferentes.");
    const p = validarPersonalizacoes(item, args);
    if (!p.ok) return p;
    const linha = { linha: this.proximaLinha++, itemId: item.id, nome: item.nome, qtd, precoBase: item.preco, personalizacoes: p.valor };
    this.linhas.push(linha);
    this._avisar();
    return { ok: true, adicionado: this.resumoLinha(linha), pedido: this.resumo() };
  }

  alterar(args = {}) {
    const bloqueio = this._podeEditar(); if (bloqueio) return erro(bloqueio);
    const l = this.linhas.find((x) => x.linha === Number(args.linha));
    if (!l) return erro(`Não existe a linha ${args.linha} no pedido. Consulte ver_pedido.`);
    const item = buscarItem(l.itemId);
    let novaQtd = l.qtd;
    if (args.quantidade !== undefined && args.quantidade !== null) {
      novaQtd = Number(args.quantidade);
      if (!Number.isInteger(novaQtd) || novaQtd < 1 || novaQtd > LIMITES.qtdMax) {
        return erro(`Quantidade deve ser de 1 a ${LIMITES.qtdMax}. Para tirar o item use remover_item.`);
      }
    }
    const p = validarPersonalizacoes(item, args, l.personalizacoes);
    if (!p.ok) return p;
    l.qtd = novaQtd;
    l.personalizacoes = p.valor;
    this._avisar();
    return { ok: true, alterado: this.resumoLinha(l), pedido: this.resumo() };
  }

  remover(args = {}) {
    const bloqueio = this._podeEditar(); if (bloqueio) return erro(bloqueio);
    const i = this.linhas.findIndex((x) => x.linha === Number(args.linha));
    if (i < 0) return erro(`Não existe a linha ${args.linha} no pedido.`);
    const [l] = this.linhas.splice(i, 1);
    this._avisar();
    return { ok: true, removido: l.nome, pedido: this.resumo() };
  }

  definirEntrega(args = {}) {
    const bloqueio = this._podeEditar(); if (bloqueio) return erro(bloqueio);
    const modo = normalizar(args.modo);
    if (modo === "retirada") {
      this.entrega = { modo: "retirada", bairro: null };
    } else if (modo === "entrega") {
      const b = buscarBairro(args.bairro);
      if (!b) return erro(`Não entregamos em "${args.bairro ?? ""}". Bairros atendidos: ${BAIRROS.map((x) => x.nome).join(", ")}. Também dá para retirar no balcão.`);
      this.entrega = { modo: "entrega", bairro: b.nome };
    } else {
      return erro('Modo deve ser "entrega" ou "retirada".');
    }
    this._avisar();
    return { ok: true, pedido: this.resumo() };
  }

  fechar(args = {}) {
    if (this.status === "confirmado") return erro("Este pedido já foi confirmado.");
    if (!this.linhas.length) return erro("O pedido está vazio.");
    if (!this.entrega.modo) return erro("Defina antes se é entrega (com bairro) ou retirada.");
    const nome = textoLivreSeguro(args.nome_cliente, 60);
    if (!nome.ok || nome.texto.length < 2) return erro("Preciso do nome do cliente (2 a 60 caracteres).");
    let endereco = null;
    if (this.entrega.modo === "entrega") {
      const e = textoLivreSeguro(args.endereco, 120);
      if (!e.ok || e.texto.length < 5) return erro("Preciso do endereço de entrega (rua, número e complemento).");
      endereco = e.texto;
    }
    const pag = PAGAMENTOS.find((p) => normalizar(p) === normalizar(args.forma_pagamento));
    if (!pag) return erro(`Forma de pagamento inválida. Opções: ${PAGAMENTOS.join(", ")}.`);
    let troco = null;
    if (pag === "dinheiro" && args.troco_para !== undefined && args.troco_para !== null && args.troco_para !== "") {
      const t = Math.round(Number(String(args.troco_para).replace(/[^\d,.]/g, "").replace(",", ".")) * 100);
      if (!Number.isFinite(t) || t < this.total()) return erro("O valor para troco precisa ser maior ou igual ao total.");
      troco = t;
    }
    this.cliente = { nome: nome.texto, endereco, pagamento: pag, troco };
    this.status = "aguardando_confirmacao";
    this._avisar();
    return {
      ok: true,
      pedido: this.resumo(),
      instrucao: "Pedido pronto. O cliente precisa conferir a comanda e clicar no botão Confirmar pedido. Você não consegue confirmar por ele.",
    };
  }

  // Só a interface chama isto (clique humano no botão). Não existe ferramenta do agente para isso.
  confirmar() {
    if (this.status !== "aguardando_confirmacao") return erro("Não há pedido aguardando confirmação.");
    this.status = "confirmado";
    this.numero = String(1000 + Math.floor(Math.random() * 9000));
    this._avisar();
    return { ok: true, numero: this.numero };
  }

  resumoLinha(l) {
    const unit = this.precoUnitario(l);
    return {
      linha: l.linha, item: l.nome, quantidade: l.qtd,
      personalizacoes: descreverPersonalizacoes(l.personalizacoes) || "padrão da casa",
      preco_unitario: brl(unit), total_linha: brl(unit * l.qtd),
    };
  }

  resumo() {
    const taxa = this.taxaEntrega();
    const sub = this.subtotal();
    const r = {
      itens: this.linhas.map((l) => this.resumoLinha(l)),
      subtotal: brl(sub),
      entrega: this.entrega.modo === "retirada" ? "retirada no balcão (sem taxa)"
        : this.entrega.modo === "entrega" ? `entrega no bairro ${this.entrega.bairro}` : "ainda não definida",
      taxa_entrega: taxa === null ? "a definir" : brl(taxa),
      total: brl(this.total()),
      status: this.status,
    };
    if (this.entrega.modo === "entrega" && sub < RESTAURANTE.freteGratisAPartirDe) {
      r.falta_para_frete_gratis = brl(RESTAURANTE.freteGratisAPartirDe - sub);
    }
    if (this.cliente) r.cliente = { ...this.cliente, troco: this.cliente.troco ? brl(this.cliente.troco) : null };
    return r;
  }

  // Valores numéricos atuais (usados na checagem de saída do agente)
  valoresAtuais() {
    const s = new Set([this.subtotal(), this.total()]);
    const t = this.taxaEntrega(); if (t !== null) s.add(t);
    if (this.subtotal() < RESTAURANTE.freteGratisAPartirDe) s.add(RESTAURANTE.freteGratisAPartirDe - this.subtotal());
    for (const l of this.linhas) { s.add(this.precoUnitario(l)); s.add(this.precoUnitario(l) * l.qtd); }
    if (this.cliente?.troco) { s.add(this.cliente.troco); s.add(this.cliente.troco - this.total()); }
    return s;
  }
}
