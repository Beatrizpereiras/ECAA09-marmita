// Bia: atendente da Panela de Ferro SEM LLM.
// Motor de regras no estilo da ELIZA (Weizenbaum, 1966): o texto do cliente é normalizado,
// comparado com padrões (palavras-chave, expressões regulares e sinônimos) e cada padrão
// dispara uma ação no pedido ou uma resposta pronta. Tudo roda no navegador, sem internet.
//
// Etapas de cada mensagem:
//  1. Guardrails: filtro de entrada (injeção/jailbreak) e limite de mensagens.
//  2. Normalização: minúsculas, sem acento, números por extenso viram dígitos, erros de digitação
//     são corrigidos pela palavra conhecida mais parecida (distância de Levenshtein).
//  3. Extração: itens do cardápio (com quantidade), personalizações, entrega/bairro, endereço,
//     nome, pagamento, perguntas e intenções (cardápio, taxas, total, conversa).
//  4. Ação: o pedido (carrinho.js) valida e calcula tudo; a Bia só monta o texto com o resultado.
//  5. Próximo passo: a Bia pergunta o que falta (entrega, endereço, nome, pagamento, cartão).
import { RESTAURANTE, DIAS, BAIRROS, ITENS, brl, itensDoDia, normalizar, buscarItem } from "./cardapio.js";
import { PAGAMENTOS } from "./carrinho.js";
import { verificarEntrada, LimitadorTaxa } from "./guardrails.js";
import { META, cartaoAtual } from "./fidelidade.js";

const BLOQUEIO_MS = 60_000;

// ---------- vocabulário ----------
const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };

// Sinônimos de cada item. Os mais longos são testados primeiro; "frango" e "bife" são genéricos (ambíguos).
const APELIDOS = {
  "bife-acebolado": ["bife acebolado", "bife com cebola", "acebolado", "bife"],
  "frango-grelhado": ["frango grelhado", "file de frango", "grelhado", "frango"],
  "strogonoff-frango": ["strogonoff de frango", "strogonoff", "estrogonofe", "estrogonoff", "strogonofe", "stroganoff", "frango"],
  "bife-parmegiana": ["bife a parmegiana", "bife parmegiana", "parmegiana", "parmigiana", "bife"],
  feijoada: ["feijoada"],
  "carne-de-panela": ["carne de panela", "carne"],
  "tilapia-grelhada": ["tilapia grelhada", "tilapia", "peixe"],
  "frango-assado": ["frango assado", "assado", "coxa e sobrecoxa", "frango"],
  "lasanha-bolonhesa": ["lasanha a bolonhesa", "lasanha bolonhesa", "lasanha", "bolonhesa"],
  vegetariana: ["marmita vegetariana", "vegetariana", "vegetariano", "vegana", "vegano", "grao de bico"],
  "ovo-frito-avulso": ["ovo frito avulso", "ovo avulso", "ovo frito", "ovos fritos", "ovo", "ovos"],
  "batata-frita": ["porcao de batata frita", "batata frita", "batatas fritas", "fritas", "batata"],
  "salada-extra": ["salada extra", "salada"],
  farofa: ["porcao de farofa", "farofa"],
  "refrigerante-lata": ["refrigerante lata", "refrigerante", "refrigerantes", "refri", "refris", "coca cola", "coca", "guarana", "guaranas"],
  "suco-natural": ["suco natural", "suco", "sucos"],
  agua: ["agua mineral", "agua", "aguas"],
  pudim: ["pudim de leite", "pudim", "pudins"],
  "mousse-maracuja": ["mousse de maracuja", "mousse", "musse"],
};
const SABOR_DO_APELIDO = { "coca cola": "cola", coca: "cola", guarana: "guaraná", guaranas: "guaraná" };

// Personalizações (padrão normalizado -> campo e valor aceito pelo carrinho)
const PERSONALIZACOES = [
  { re: /\bmal passad\w*/, campo: "ponto", valor: "mal passado" },
  { re: /\bao ponto\b/, campo: "ponto", valor: "ao ponto" },
  { re: /\bbem passad\w*/, campo: "ponto", valor: "bem passado" },
  { re: /\bgema mole\b/, campo: "ponto", valor: "gema mole" },
  { re: /\bgema dura\b/, campo: "ponto", valor: "gema dura" },
  { re: /\bpouco sal\b/, campo: "tempero", valor: "pouco sal" },
  { re: /\bsem pimenta\b/, campo: "tempero", valor: "sem pimenta" },
  { re: /\b(apimentad\w*|com pimenta|picante)\b/, campo: "tempero", valor: "apimentado" },
  { re: /\btempero normal\b/, campo: "tempero", valor: "normal" },
  { re: /\bsem sal\b/, campo: "tempero", valor: "sem sal" },
  { re: /\bcom paprica\b/, campo: "tempero", valor: "com páprica" },
  { re: /\bsem acucar\b/, campo: "acucar", valor: "sem açúcar" },
  { re: /\bcom adocante\b/, campo: "acucar", valor: "com adoçante" },
  { re: /\bcom acucar\b/, campo: "acucar", valor: "com açúcar" },
  { re: /\bsem gas\b/, campo: "sabor", valor: "sem gás" },
  { re: /\bcom gas\b/, campo: "sabor", valor: "com gás" },
  { re: /\b(com|mais|adicional de|extra de)\s+(um |uma )?(ovo frito|ovo)\b/, campo: "adicionais", valor: "ovo frito" },
  { re: /\b(com|mais|adicional de|extra de)\s+(bacon em cubos|bacon)\b/, campo: "adicionais", valor: "bacon em cubos" },
  { re: /\b(com|mais|adicional de|extra de)\s+(queijo coalho|queijo extra|queijo)\b/, campo: "adicionais", valor: "queijo" },
  { re: /\b(troca\w*|trocando)\s+(o arroz\s+)?(por|pelo)\s+arroz integral|\b(com|de)\s+arroz integral\b/, campo: "adicionais", valor: "trocar por arroz integral" },
];
// Sabores (só valem se o item aceitar)
const SABORES = [
  { re: /\b(cola|coca\w*)\b/, valor: "cola" }, { re: /\bguarana\w*/, valor: "guaraná" },
  { re: /\blaranja\b/, valor: "laranja" }, { re: /\blimao\b/, valor: "limão" }, { re: /\bmaracuja\b/, valor: "maracujá" },
];
// Tudo que pode ser tirado de algum prato (para reconhecer "sem X" e "tira o X")
const NOME_REMOVIVEL = new Map(ITENS.flatMap((i) => i.opcoes.remover || []).map((r) => [normalizar(r), r])); // "feijao" -> "feijão"
const REMOVIVEIS = [...NOME_REMOVIVEL.keys()].sort((a, b) => b.length - a.length);

const DIA_NOMES = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const CATEGORIA_PALAVRAS = [
  { re: /\b(sobremesas?|doces?|docinho)\b/, cat: "sobremesa" },
  { re: /\b(bebidas?|beber|bebe)\b/, cat: "bebida" },
  { re: /\b(acompanhamentos?|porcoes|porcao|petiscos?)\b/, cat: "acompanhamento" },
  { re: /\b(marmitas|pratos)\b/, cat: "marmita" },
];
const ROTULO_CAT = { marmita: "Marmitas", acompanhamento: "Acompanhamentos", bebida: "Bebidas", sobremesa: "Sobremesas" };

// Palavras conhecidas (para corrigir erro de digitação)
const VOCAB = new Set([
  ...Object.values(APELIDOS).flat().flatMap((a) => a.split(" ")),
  ...REMOVIVEIS.flatMap((r) => r.split(" ")),
  ...BAIRROS.flatMap((b) => normalizar(b.nome).split(" ")),
  ...DIA_NOMES, "passado", "passada", "pimenta", "apimentado", "acucar", "adocante", "bacon", "queijo", "coalho", "integral",
  "cardapio", "retirada", "retirar", "entrega", "entregar", "dinheiro", "cartao", "credito", "debito", "troco", "endereco",
  "quero", "queria", "gostaria", "obrigada", "obrigado", "maracuja", "laranja", "limao", "sobremesa", "sobremesas", "bebida", "bebidas",
  "acompanhamento", "acompanhamentos", "fidelidade", "pedido", "marmita", "marmitas", "balcao",
].filter((w) => w.length >= 4));

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
function corrigirPalavra(w) {
  if (w.length < 5 || VOCAB.has(w) || /\d/.test(w)) return w;
  const limite = w.length >= 8 ? 2 : 1;
  let melhor = w, menor = limite + 1;
  for (const v of VOCAB) {
    const dd = distancia(w, v);
    if (dd < menor) { menor = dd; melhor = v; }
  }
  return melhor;
}

// Texto -> forma comparável: "Quero 2x Strogonofe, uma sem cebola!" -> "quero 2 strogonoff , 1 sem cebola"
export function preparar(texto) {
  let s = normalizar(texto).replace(/\+/g, " com ").replace(/(\d+)\s*x\b/g, "$1 ");
  s = s.replace(/,/g, " , ").replace(/[^a-z0-9,\s]/g, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").map((w) => (NUMEROS[w] && !/^(um|uma)$/.test(w) ? String(NUMEROS[w]) : w)).map(corrigirPalavra).join(" ")
    .replace(/\b(um|uma)\b(?=\s+(\w+\s+)?(marmita|porcao|lata|copo|fatia|suco|refri|refrigerante|agua|pudim|mousse|sem|com|bem|mal|ao)\b)/g, "1");
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const APELIDOS_LISTA = Object.entries(APELIDOS).flatMap(([id, lista]) => lista.map((a) => ({ id, a })))
  .sort((x, y) => y.a.length - x.a.length);
// Um mesmo apelido pode servir a vários itens (ex.: "frango")
const APELIDO_ITENS = new Map();
for (const { id, a } of APELIDOS_LISTA) {
  if (!APELIDO_ITENS.has(a)) APELIDO_ITENS.set(a, new Set());
  APELIDO_ITENS.get(a).add(id);
}
const APELIDOS_UNICOS = [...APELIDO_ITENS.keys()].sort((x, y) => y.length - x.length);

const sobrepoe = (a, b) => a.ini < b.fim && b.ini < a.fim;

// ---------- leitura dos itens e personalizações ----------
function lerQuantidade(antes) {
  const m = /(?:^|\s|,)(\d{1,2})\s+(?:x\s+)?(?:(?:marmitas?|porcao|porcoes|latas?|copos?|fatias?|garrafas?|pratos?|unidades?|potes?)\s+)?(?:(?:de|da|do|das|dos)\s+)?$/.exec(antes);
  return m ? Number(m[1]) : null;
}

export function lerItens(s) {
  // 1) trechos de personalização (não são itens: "sem batata", "com ovo")
  const pers = [];
  for (const p of PERSONALIZACOES) {
    const re = new RegExp(p.re.source, "g");
    let m;
    while ((m = re.exec(s))) pers.push({ ini: m.index, fim: m.index + m[0].length, campo: p.campo, valor: p.valor });
  }
  // "sem X", "tira o X", "tirando X" (e "sem X e Y")
  const reSem = /\b(sem|tira|tirar|tirando|retira|retirar)\s+(o |a |os |as )?/g;
  let m;
  while ((m = reSem.exec(s))) {
    if (pers.some((p) => p.ini <= m.index && m.index < p.fim)) continue; // "sem pimenta", "sem gas"...
    let pos = m.index + m[0].length;
    const achados = [];
    for (;;) {
      const resto = s.slice(pos);
      const op = REMOVIVEIS.find((r) => resto === r || resto.startsWith(r + " ") || resto.startsWith(r + ","));
      if (!op) break;
      achados.push(op);
      pos += op.length;
      const e = /^\s*(,\s*|e\s+)(o |a |os |as )?(sem\s+)?/.exec(s.slice(pos));
      const prox = e ? s.slice(pos + e[0].length) : "";
      if (e && REMOVIVEIS.some((r) => prox === r || prox.startsWith(r + " ") || prox.startsWith(r + ","))) pos += e[0].length;
      else break;
    }
    if (achados.length) pers.push({ ini: m.index, fim: pos, campo: "remover", valor: achados.map((x) => NOME_REMOVIVEL.get(x)), verbo: m[1] });
  }

  // 2) itens (apelido mais longo primeiro, sem cair dentro de personalização ou de outro item)
  const spans = [];
  for (const a of APELIDOS_UNICOS) {
    const re = new RegExp(`\\b${escapar(a)}\\b`, "g");
    while ((m = re.exec(s))) {
      const sp = { ini: m.index, fim: m.index + a.length, apelido: a, ids: [...APELIDO_ITENS.get(a)] };
      if (pers.some((p) => sobrepoe(p, sp)) || spans.some((x) => sobrepoe(x, sp))) continue;
      spans.push(sp);
    }
  }
  spans.sort((x, y) => x.ini - y.ini);
  // "lasanha ... bolonhesa" do mesmo item colados viram um só
  for (let i = spans.length - 1; i > 0; i--) {
    const entre = s.slice(spans[i - 1].fim, spans[i].ini);
    if (spans[i - 1].ids.join() === spans[i].ids.join() && /^\s*(a|de|com|e)?\s*$/.test(entre)) spans.splice(i, 1);
  }

  // 3) monta as entradas com quantidade
  const entradas = spans.map((sp, i) => {
    const limite = i > 0 ? spans[i - 1].fim : 0;
    const antes = s.slice(Math.max(limite, sp.ini - 40), sp.ini);
    const qtd = lerQuantidade(antes.split(",").pop());
    const e = { ...sp, qtd: qtd ?? 1, qtdDita: qtd !== null, pers: {}, subs: [] };
    if (SABOR_DO_APELIDO[sp.apelido]) e.pers.sabor = SABOR_DO_APELIDO[sp.apelido];
    return e;
  });

  // sabores (fora dos nomes de itens)
  for (const sab of SABORES) {
    const re = new RegExp(sab.re.source, "g");
    while ((m = re.exec(s))) {
      const sp = { ini: m.index, fim: m.index + m[0].length };
      if (spans.some((x) => sobrepoe(x, sp))) continue;
      pers.push({ ...sp, campo: "sabor", valor: sab.valor });
    }
  }
  pers.sort((a, b) => a.ini - b.ini);

  // 4) cada personalização vai para o item anterior mais próximo (ou o seguinte, se não houver)
  //    "2 de frango, uma sem feijão": número antes da personalização sem item no meio = divide a quantidade
  for (const p of pers) {
    const anteriores = entradas.filter((e) => e.fim <= p.ini);
    const dono = anteriores.at(-1) || entradas.find((e) => e.ini >= p.fim);
    if (!dono) continue;
    if (anteriores.at(-1) === dono) {
      const trecho = s.slice(dono.fim, p.ini);
      const mq = /(?:^|\s|,)(\d{1,2})\s+(?:(?:delas|deles|das|dos|sendo)\s+)?(?:(?:com|bem|mal|ao)\s+)?$/.exec(trecho);
      const subAberta = dono.subs.at(-1);
      if (mq && dono.qtdDita) {
        dono.subs.push({ qtd: Number(mq[1]), pers: { ...(dono.pers.sabor ? { sabor: dono.pers.sabor } : {}) }, ini: p.ini });
      }
      const alvo = mq && dono.qtdDita ? dono.subs.at(-1) : (subAberta && subAberta.ini < p.ini && !/,\s*\d/.test(s.slice(subAberta.ini, p.ini)) ? subAberta : dono);
      aplicarPers(alvo.pers, p);
    } else aplicarPers(dono.pers, p);
  }
  return { entradas, pers };
}

function aplicarPers(alvo, p) {
  if (p.campo === "remover") alvo.remover = [...new Set([...(alvo.remover || []), ...p.valor])];
  else if (p.campo === "adicionais") alvo.adicionais = [...new Set([...(alvo.adicionais || []), p.valor])];
  else alvo[p.campo] = p.valor;
}

// Personalização do texto -> argumentos do carrinho para um item específico
function argsDoItem(item, qtd, pers) {
  const args = { item_id: item.id, quantidade: qtd };
  for (const c of ["ponto", "tempero", "acucar"]) if (pers[c]) args[c] = pers[c];
  if (pers.sabor && item.opcoes.sabor) args.sabor = pers.sabor;
  if (pers.remover) args.remover = pers.remover;
  if (pers.adicionais) {
    args.adicionais = pers.adicionais.map((a) => {
      if (a !== "queijo") return a;
      const q = (item.opcoes.adicionais || []).find((x) => /queijo/.test(normalizar(x.nome)));
      return q ? q.nome : "queijo coalho";
    });
  }
  return args;
}

// ---------- outros dados da mensagem ----------
function capitalizar(n) { return n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()); }
const NAO_NOME = /^(pix|retirada|retirar|entrega|rua|dinheiro|cartao|cartão|e|de|da|do|para|pra|quero|no|na|o|a|bps|centro)$/i;

export function lerNome(original) {
  const m = /(?:meu nome (?:é|e|eh)|me chamo|em nome de|nome(?:\s*(?:é|e|:))?|sou (?:o|a))\s+([A-Za-zÀ-ÿ]{2,})(?:\s+([A-Za-zÀ-ÿ]{2,}))?/i.exec(original);
  if (!m || NAO_NOME.test(m[1]) || /^(dono|gerente|desenvolvedor|admin)/i.test(m[1])) return null;
  const partes = [m[1]];
  if (m[2] && !NAO_NOME.test(m[2]) && !/^(pix|quero|vou|pago)$/i.test(m[2])) partes.push(m[2]);
  return capitalizar(partes.join(" "));
}

export function lerEndereco(original) {
  const m = /\b((?:rua|r\.|av\.?|avenida|travessa|tv\.?|alameda|pra[cç]a|estrada|rodovia)\s+[^,\n]*?)(?:,\s*)?((?:n[º°o.]?\s*|n[uú]mero\s*)?\d+[a-z]?)([^,\n]{0,25}?(?:ap(?:to|artamento)?\.?|casa|bloco|bl\.?)\s*\w+)?(?=,|\n|$|\s+(?:e\s+)?(?:pix|dinheiro|cart|nome|meu|retir|entreg|troco))/i.exec(original);
  if (m) {
    const depois = original.slice(m.index + m[0].length);
    const comp = /^\s*,?\s*((?:ap(?:to|artamento)?\.?|casa|bloco|bl\.?|fundos|sala)\s*[\w-]*)/i.exec(depois);
    return [m[1].trim(), m[2].trim(), (m[3] || "").trim(), comp ? comp[1].trim() : ""].filter(Boolean).join(", ").replace(/\s+/g, " ");
  }
  const e = /endere[cç]o\s*(?:é|e|:)?\s*([^,\n]*\d[^,\n]*)/i.exec(original);
  return e ? e[1].trim() : null;
}

function lerBairro(s) {
  return BAIRROS.find((b) => new RegExp(`\\b${escapar(normalizar(b.nome))}\\b`).test(s)) || null;
}

function lerPagamento(s) {
  if (/\bpix\b/.test(s)) return "pix";
  if (/\b(dinheiro|especie|em especie)\b/.test(s)) return "dinheiro";
  if (/\b(credito|debito|maquininha|maquina)\b/.test(s) || /\b(no|com o|com|pago no|pagar no|pelo) cartao\b/.test(s) || /\bcartao (na entrega|de credito|de debito)\b/.test(s) || /^cartao$/.test(s)) {
    if (!/\bcartao fidelidade\b/.test(s)) return "cartão na entrega";
  }
  return null;
}

function lerTroco(s) {
  const m = /\btroco\s*(?:pra|para|de)?\s*(?:r\s*)?(\d+(?:[.,]\d{1,2})?)/.exec(s);
  return m ? m[1] : null;
}

// ---------- textos ----------
const nomeCurto = (i) => i.nome.replace(/^Marmita (de )?/, "").replace(/^./, (c) => c.toUpperCase());
function descreverOpcoes(item) {
  const o = item.opcoes, p = [];
  if (o.ponto) p.push(`ponto ${o.ponto.join(", ")}`);
  if (o.tempero) p.push(`tempero ${o.tempero.join(", ")}`);
  if (o.remover) p.push(`dá para tirar ${o.remover.join(", ")}`);
  if (o.adicionais) p.push(`adicionais: ${o.adicionais.map((a) => `${a.nome} (+${brl(a.preco)})`).join(", ")}`);
  if (o.sabor) p.push(`sabores: ${o.sabor.join(", ")}`);
  if (o.acucar) p.push(o.acucar.join(", "));
  return p.join("; ");
}

function listaCardapio(dia, cats = ["marmita", "acompanhamento", "bebida", "sobremesa"]) {
  const partes = [];
  for (const c of cats) {
    const itens = itensDoDia(dia).filter((i) => i.categoria === c);
    if (!itens.length) continue;
    partes.push(`**${ROTULO_CAT[c]}**\n${itens.map((i) => `- ${c === "marmita" ? nomeCurto(i) : i.nome}: ${brl(i.preco)}`).join("\n")}`);
  }
  return partes.join("\n");
}

const RESPOSTAS_CONVERSA = [
  { re: /\b(estou|to|esto|tou|eu estou)?\s*com (muita |uma )?fome\b|\bfome\b/, r: (b) => `Fome é com a gente mesmo! Hoje a panela tem:\n${listaCardapio(b.dia, ["marmita"])}\nQual vai ser?` },
  { re: /\b(quem (e|eh) voce|voce (e|eh) (um |uma )?(robo|ia|bot|humana|pessoa|real|inteligencia)|e um robo|voce e de verdade)\b/, r: () => "Sou a Bia, a chef virtual da Panela de Ferro. Funciono por regras e padrões de texto, no estilo da ELIZA (um dos primeiros chatbots da história), sem inteligência artificial generativa: tudo roda aqui no seu navegador." },
  { re: /\b(tudo bem|tudo bom|como (voce )?(esta|vai)|beleza)\b/, r: () => "Tudo ótimo por aqui, com a panela no fogo! E com você? Já sabe o que vai pedir?" },
  { re: /\b(obrigad\w*|valeu|brigad\w*|agradeco)\b/, r: () => "Imagina! Precisando, é só chamar." },
  { re: /\b(tchau|ate mais|ate logo|falou|boa noite e ate)\b/, r: () => "Até mais! Volta sempre que bater a fome." },
  { re: /\b(estou|to|ando|me sinto) (triste|cansad\w*|estressad\w*|chatead\w*|desanimad\w*)\b/, r: (b, m) => `Poxa, sinto muito que você esteja ${m[2]}. Uma comida caseira quentinha costuma ajudar. Quer ver o que tem hoje?` },
  { re: /\beu (gosto|adoro|amo) (de |do |da )?(.+)/, orig: /\beu (?:gosto|adoro|amo) (de |do |da )?(.+)/i, r: (b, m) => `Que bom que você gosta ${m[1] ? m[1].trim() + " " : "de "}${refletir(m[2])}! Quer ver se tem algo assim no cardápio de hoje?` },
  { re: /\beu (nao gosto|odeio|detesto) (de |do |da )?(.+)/, orig: /\beu (?:n[ãa]o gosto|odeio|detesto) (de |do |da )?(.+)/i, r: (b, m) => `Entendi, nada de ${refletir(m[2])} então. Se algum prato vier com isso, é só me pedir "sem ${refletir(m[2])}".` },
  { re: /\b(o que voce faz|como funciona|ajuda|me ajuda|socorro)\b/, r: () => "Eu monto seu pedido conversando. Dá para dizer, por exemplo:\n- \"2 de frango grelhado, uma sem feijão\"\n- \"tem pudim?\"\n- \"entrega no BPS, Rua X, 10\"\n- \"quanto deu?\"\nA comanda ao lado atualiza na hora." },
];
// ELIZA: troca "eu/meu" por "você/seu" ao repetir a frase do cliente
function refletir(t) {
  const troca = { eu: "você", meu: "seu", minha: "sua", meus: "seus", minhas: "suas", comigo: "com você", mim: "você" };
  return t.replace(/[.!?]+$/, "").trim().split(/\s+/).map((w) => troca[w.toLowerCase()] || w).join(" ").slice(0, 60);
}
const NAO_ENTENDI = [
  (t) => `Hmm, não entendi "${t}". Posso te mostrar o **cardápio de hoje**, as **taxas de entrega** ou o **seu pedido**.`,
  () => "Me conta de outro jeito? Por exemplo: \"2 de frango grelhado, uma sem feijão, entrega no Centro\".",
  (t) => `"${t}"... essa eu não sei responder. Mas de marmita eu entendo! Quer ver o que tem hoje?`,
];

const RE_PERGUNTA = /\?|^(tem|teria|voces tem|vcs tem|quanto|qual|quais|como (e|vem)|o que vem|o que tem|que tem|vem com|e bom)\b/;
const RE_PEDIDO = /\b(quero|queria|vou querer|vou de|me ve|me da|manda|mande|coloca|coloque|adiciona|adicione|bota|bote|inclui|inclua|pode ser|gostaria|pedir|traz|traga|desce|mais \d|pede)\b/;
const RE_SIM = /^(sim|s|quero|pode|pode sim|claro|isso|ok|okay|beleza|bora|manda|fechado|coloca|pode colocar|com certeza|quero sim|sim quero|uhum|aham|isso mesmo)\b/;
const RE_NAO = /^(nao|n|nao quero|nao obrigad\w*|agora nao|depois|deixa|dispenso)\b/;

// ---------- a atendente ----------
export class Atendente {
  constructor({ pedido, dia, atrasoMs = 450 }) {
    this.pedido = pedido;
    this.dia = dia;
    this.atrasoMs = atrasoMs;
    this.limitador = new LimitadorTaxa({ intervaloMinMs: 400 });
    this.tentativas = 0;
    this.bloqueadoAte = 0;
    this.historico = [];
    this.vezesNaoEntendi = 0;
    this.dados = { nome: null, endereco: null, pagamento: null, troco: null };
    this.reiniciarConversa();
  }

  reiniciarConversa() {
    this.oferta = null;         // itens oferecidos ("Quer que eu coloque?")
    this.pendente = null;       // item ambíguo esperando escolha ("qual frango?")
    this.aguardando = null;     // o que a Bia acabou de perguntar
    this.querEntrega = false;
    this.cartaoRespondido = !!cartaoAtual();
    this.dados.pagamento = null; this.dados.troco = null; // nome e endereço ficam para o próximo pedido
  }

  registrarEvento(texto) { this.historico.push({ role: "sistema", content: texto }); }

  async responder(textoCliente, { cartao = null } = {}) {
    const agora = Date.now();
    if (agora < this.bloqueadoAte) {
      const s = Math.ceil((this.bloqueadoAte - agora) / 1000);
      return { tipo: "bloqueado", texto: `Atendimento pausado por segurança. Tente de novo em ${s} s.` };
    }
    const ent = verificarEntrada(textoCliente);
    if (!ent.ok) {
      if (ent.motivo !== "vazio" && ent.motivo !== "longo") {
        this.tentativas++;
        if (this.tentativas >= 3) { this.bloqueadoAte = agora + BLOQUEIO_MS; this.tentativas = 0; }
        return { tipo: "bloqueado", texto: ent.resposta, motivo: ent.motivo };
      }
      return { tipo: "aviso", texto: ent.resposta };
    }
    const lim = this.limitador.permitir(agora);
    if (!lim.ok) return { tipo: "aviso", texto: lim.motivo };

    this.historico.push({ role: "cliente", content: ent.texto });
    if (this.atrasoMs) await new Promise((r) => setTimeout(r, this.atrasoMs)); // "digitando…"
    const texto = this.processar(ent.texto, cartao);
    this.historico.push({ role: "bia", content: texto });
    return { tipo: "normal", texto };
  }

  // Coração do motor: devolve o texto da resposta
  processar(original, cartao) {
    const s = preparar(original);
    const p = this.pedido;
    const partes = [];
    let agiu = false;       // mexeu no pedido ou em dados do pedido
    let respondeu = false;  // já respondeu algo útil
    const pergunta = (original.includes("?") || RE_PERGUNTA.test(s)) && !RE_PEDIDO.test(s);
    this.ultimaPergunta = s;
    const { entradas } = lerItens(s);
    if (!entradas.length && /\bespecial\b/.test(s)) {
      const hoje = itensDoDia(this.dia).filter((i) => i.categoria === "marmita");
      const esp = hoje.filter((i) => i.dias.length < 7).sort((a, b) => a.dias.length - b.dias.length)[0] || hoje[0];
      if (esp) entradas.push({ ids: [esp.id], qtd: lerQuantidade(s.slice(0, s.indexOf("especial"))) ?? 1, qtdDita: false, pers: {}, subs: [], apelido: "especial" });
    }

    // Pedido já confirmado: só um novo pedido pode mudar algo
    if (p.status === "confirmado" && (entradas.length || RE_PEDIDO.test(s)) && !pergunta) {
      return "Esse pedido já foi confirmado e está na cozinha! Para pedir mais, clique em **Fazer novo pedido**.";
    }

    // --- cartão fidelidade (conferido pelo site em fidelidade.js) ---
    if (cartao) {
      if (cartao.ok) {
        agiu = true;
        partes.push(`Achei seu cartão **${cartao.codigo}**: você tem ${Math.min(cartao.selos, META)} de ${META} selos.${cartao.completo ? " Ele está completo: uma marmita deste pedido sai por nossa conta (desconto na entrega)!" : " Os selos novos entram quando você confirmar."}`);
        this.cartaoRespondido = true;
      } else {
        partes.push(cartaoAtual()
          ? `Não encontrei o código ${cartao.codigo}. Confere pra mim? O cartão ${cartaoAtual().codigo} continua valendo.`
          : `Não encontrei o código ${cartao.codigo}. Confere pra mim? Se não tiver o código, tudo bem: você ganha um cartão novo ao confirmar.`);
      }
      respondeu = true;
    } else if (this.aguardando === "cartao" && (RE_NAO.test(s) || /\b(nao tenho|ainda nao|primeira vez|nunca pedi|sem cartao)\b/.test(s))) {
      partes.push("Sem problema! Você ganha o seu cartão fidelidade quando confirmar este pedido.");
      this.cartaoRespondido = true; respondeu = true; agiu = true;
    } else if (/\b(nao tenho|sem) cartao( fidelidade)?\b/.test(s)) {
      this.cartaoRespondido = true;
    }

    // --- cancelar tudo ---
    if (/\b(cancela|cancelar|zera|zerar|limpa|limpar|apaga|apagar)\s+(tudo|o pedido|pedido|a comanda|comanda)\b|\bcomecar de novo\b/.test(s)) {
      for (const l of [...p.linhas]) p.remover({ linha: l.linha });
      this.pendente = null; this.oferta = null;
      return "Pronto, limpei a comanda. O que vai ser agora?";
    }

    // --- tirar item do pedido ("tira a batata", "cancela o suco") ---
    const reTirar = /\b(tira|tirar|remove|remover|cancela|cancelar|exclui|excluir|retira|nao quero mais)\b/;
    const mTirar = reTirar.exec(s);
    const depoisTirar = mTirar ? s.slice(mTirar.index) : "";
    // itens do pedido citados depois do verbo ("tira a batata" = tira a porção de batata, se ela está no pedido)
    const citadosNoPedido = mTirar ? [...new Set(p.linhas.map((l) => l.itemId))].filter((id) =>
      APELIDOS[id].some((a) => new RegExp(`\\b${escapar(a)}\\b`).test(depoisTirar))) : [];
    if (mTirar && citadosNoPedido.length && !/\bretirada\b/.test(s)) {
      // se o termo é genérico (ex.: "frango") e há mais de um no pedido, tira só os citados de forma mais específica
      const especificos = citadosNoPedido.filter((id) => APELIDOS[id].some((a) => a.includes(" ") && depoisTirar.includes(a)));
      const alvo = especificos.length ? especificos : citadosNoPedido;
      for (const id of alvo) {
        const linhas = p.linhas.filter((l) => l.itemId === id);
        for (const l of linhas) p.remover({ linha: l.linha });
        partes.push(`Tirei ${linhas.map((l) => `${l.qtd}× ${l.nome}`).join(" e ")} do pedido.`);
      }
      agiu = true; respondeu = true;
    } else if (mTirar && entradas.length && !p.linhas.some((l) => entradas.some((e) => e.ids.includes(l.itemId)))) {
      partes.push(`Não tem ${entradas[0].apelido} no seu pedido.`); respondeu = true;
    }
    // "tira a cebola" depois de pedir: muda a última linha
    else if (reTirar.test(s) && !entradas.length && p.linhas.length) {
      const { pers } = lerItens(s);
      const rem = pers.find((x) => x.campo === "remover");
      if (rem) {
        const l = p.linhas.at(-1);
        const r = p.alterar({ linha: l.linha, remover: [...new Set([...(l.personalizacoes.remover || []), ...rem.valor])] });
        partes.push(r.ok ? `Feito: ${r.alterado.item} agora vai ${r.alterado.personalizacoes}.` : r.erro);
        agiu = true; respondeu = true;
      }
    }

    // --- resposta a uma pergunta "qual frango?" ---
    if (!respondeu && this.pendente) {
      const escolhido = this.resolverPendente(s, entradas);
      if (escolhido) {
        partes.push(this.adicionar([{ ...this.pendente, ids: [escolhido] }]));
        this.pendente = null; agiu = true; respondeu = true;
      }
    }

    // --- itens citados ---
    if (!respondeu && entradas.length) {
      if (pergunta) { partes.push(this.informarItens(entradas)); respondeu = true; }
      else { partes.push(this.adicionar(entradas)); agiu = true; respondeu = true; }
    }

    // --- "sim" para uma oferta ---
    if (!respondeu && this.oferta && RE_SIM.test(s)) {
      partes.push(this.adicionar(this.oferta.map((id) => ({ ids: [id], qtd: 1, pers: {}, subs: [], apelido: id }))));
      this.oferta = null; agiu = true; respondeu = true;
    } else if (!respondeu && this.oferta && RE_NAO.test(s)) {
      this.oferta = null; partes.push("Tudo bem!"); respondeu = true;
    }

    // --- dados de entrega e pagamento ---
    const dadosTxt = this.lerDados(original, s, pergunta);
    if (dadosTxt.length) { partes.push(...dadosTxt); agiu = true; respondeu = true; }

    // --- perguntas de informação ---
    const info = this.informacoes(s, pergunta, respondeu);
    if (info) { partes.push(info); respondeu = true; }

    // --- confirmar ---
    if (!respondeu && /\b(confirma|confirmar|confirmo|finaliza|finalizar|fecha|fechar|pode mandar|so isso|e so isso|mais nada|nada mais|pode fechar)\b/.test(s)) {
      if (p.status === "aguardando_confirmacao") { partes.push("É só clicar no botão verde **Confirmar pedido**, logo acima da caixa de mensagem. A confirmação é sempre sua!"); respondeu = true; }
      else if (p.linhas.length) { agiu = true; respondeu = true; }
    }

    // --- conversa (ELIZA) ---
    if (!respondeu) {
      if (/^(oi|ola|oie|eai|e ai|bom dia|boa tarde|boa noite|hey|opa|salve)\b/.test(s)) {
        partes.push(`Oi! Que bom te ver por aqui. Hoje saem da panela:\n${listaCardapio(this.dia, ["marmita"])}\nO que vai ser?`);
        respondeu = true;
      } else {
        for (const c of RESPOSTAS_CONVERSA) {
          const m = c.re.exec(s);
          if (!m) continue;
          const mo = c.orig ? c.orig.exec(original) : null;
          partes.push(c.r(this, mo || m)); respondeu = true; break;
        }
      }
    }
    if (!respondeu && /\b(nao|sim)\b/.test(s) && this.aguardando) respondeu = false;

    if (!respondeu) {
      const curto = original.trim().slice(0, 40);
      partes.push(NAO_ENTENDI[this.vezesNaoEntendi++ % NAO_ENTENDI.length](curto));
      if (this.aguardando) partes.push(this.perguntaDe(this.aguardando));
      return partes.join("\n\n");
    }
    this.vezesNaoEntendi = 0;

    // --- próximo passo do pedido ---
    if (agiu && !this.pendente && p.linhas.length && p.status !== "confirmado") {
      const passo = this.proximoPasso();
      if (passo) partes.push(passo);
    }
    return partes.filter(Boolean).join("\n\n");
  }

  // Adiciona entradas ao pedido; devolve o texto (ou pergunta, se ambíguo)
  adicionar(entradas) {
    const p = this.pedido;
    const ok = [], erros = [];
    for (const e of entradas) {
      const hoje = e.ids.filter((id) => buscarItem(id).dias.includes(this.dia));
      if (!hoje.length) {
        const it = buscarItem(e.ids[0]);
        erros.push(`${nomeCurto(it)} não sai hoje (${DIAS[this.dia]}). Tem ${it.dias.map((d) => DIAS[d]).join(", ")}.`);
        continue;
      }
      if (hoje.length > 1) {
        this.pendente = { ...e, ids: hoje };
        erros.push(`Qual ${e.apelido} você quer: ${hoje.map((id) => `**${nomeCurto(buscarItem(id))}** (${brl(buscarItem(id).preco)})`).join(" ou ")}?`);
        continue;
      }
      const item = buscarItem(hoje[0]);
      const somaSubs = e.subs.reduce((t, x) => t + x.qtd, 0);
      const grupos = [];
      if (e.qtd - somaSubs > 0) grupos.push({ qtd: e.qtd - somaSubs, pers: e.pers });
      for (const sub of e.subs) grupos.push({ qtd: sub.qtd, pers: { ...e.pers, ...sub.pers } });
      if (!grupos.length) grupos.push({ qtd: e.qtd, pers: e.pers });
      for (const g of grupos) {
        const r = p.adicionar(argsDoItem(item, g.qtd, g.pers));
        if (r.ok) ok.push(`- ${r.adicionado.quantidade}× ${r.adicionado.item}${r.adicionado.personalizacoes !== "padrão da casa" ? ` (${r.adicionado.personalizacoes})` : ""}: ${r.adicionado.total_linha}`);
        else erros.push(r.erro);
      }
    }
    const t = [];
    if (ok.length) t.push(`Anotado!\n${ok.join("\n")}`);
    if (erros.length) t.push(erros.join("\n"));
    if (ok.length) this.oferta = null;
    return t.join("\n");
  }

  resolverPendente(s, entradas) {
    const ids = this.pendente.ids;
    for (const e of entradas) {
      const comum = e.ids.filter((id) => ids.includes(id));
      if (comum.length === 1) return comum[0];
    }
    const m = /\b(primeir|segund|terceir)/.exec(s);
    if (m) return ids[{ primeir: 0, segund: 1, terceir: 2 }[m[1]]] ?? null;
    return null;
  }

  informarItens(entradas) {
    const linhas = [], oferta = [];
    for (const e of entradas) {
      for (const id of e.ids) {
        const it = buscarItem(id);
        if (it.dias.includes(this.dia)) {
          linhas.push(`**${it.nome}**: ${brl(it.preco)}. ${it.descricao.replace(/^./, (c) => c.toUpperCase())}.${descreverOpcoes(it) ? ` (${descreverOpcoes(it)})` : ""}`);
          oferta.push(id);
        } else if (e.ids.length === 1) {
          linhas.push(`${nomeCurto(it)} não sai hoje. Tem ${it.dias.map((d) => DIAS[d]).join(", ")}.`);
        }
      }
    }
    if (!linhas.length) return `Hoje não tem. As marmitas de hoje são:\n${listaCardapio(this.dia, ["marmita"])}`;
    this.oferta = oferta.length ? [...new Set(oferta)] : null;
    return `${oferta.length && /^(tem|teria|voces tem|vcs tem|ainda tem)\b/.test(this.ultimaPergunta || "") ? "Tem sim! " : ""}${linhas.join("\n")}${oferta.length ? `\nQuer que eu coloque no pedido?` : ""}`;
  }

  // Entrega, bairro, endereço, nome, pagamento, troco
  lerDados(original, s, pergunta = false) {
    const p = this.pedido, d = this.dados, out = [];
    const bairro = lerBairro(s);
    const retirada = /\b(retirada|retirar|retiro|vou buscar|busco|buscar ai|pego ai|vou pegar|balcao)\b/.test(s);
    if (retirada && !bairro) {
      const r = p.definirEntrega({ modo: "retirada" });
      if (r.ok) out.push("Anotado: **retirada no balcão**, sem taxa.");
    } else if (bairro && pergunta) {
      out.push(`Entregamos sim no **${bairro.nome}**: taxa de ${brl(bairro.taxa)} (grátis a partir de ${brl(RESTAURANTE.freteGratisAPartirDe)}).`);
    } else if (bairro) {
      const r = p.definirEntrega({ modo: "entrega", bairro: bairro.nome });
      if (r.ok) {
        const taxa = p.taxaEntrega();
        out.push(`Entrega no **${bairro.nome}**: ${taxa === 0 ? "frete grátis neste pedido" : `taxa de ${brl(taxa)}`}.`);
      }
    } else if (/\b(entrega|entregar|delivery|manda pra casa|mandar pra casa)\b/.test(s) && !/\b(taxa|quanto|quais|qual|onde|tempo|demora|horario)\b/.test(s)) {
      this.querEntrega = true;
      const fora = /\b(entrega|entregar)\s+(no|na|em|pro|pra|para o|para a)\s+([a-z]+(?: [a-z]+)?)/.exec(s);
      if (fora && !["casa", "minha", "meu"].includes(fora[3].split(" ")[0])) out.push(`Ainda não entregamos em ${capitalizar(fora[3])}. Atendemos: ${BAIRROS.map((b) => b.nome).join(", ")}. Ou você pode retirar no balcão.`);
    }
    if (this.aguardando === "bairro" && !bairro && !retirada && !out.length && s.split(" ").length <= 3 && !/\d/.test(s)) {
      out.push(`Ainda não entregamos em ${capitalizar(original.trim())}. Atendemos: ${BAIRROS.map((b) => b.nome).join(", ")}. Ou você pode retirar no balcão.`);
    }

    let endereco = lerEndereco(original);
    if (!endereco && this.aguardando === "endereco" && /\d/.test(original) && original.trim().length >= 5) endereco = original.trim();
    if (endereco) { d.endereco = endereco; out.push(`Endereço: ${endereco}.`); }

    let nome = lerNome(original);
    if (!nome && this.aguardando === "nome") {
      const so = original.trim().replace(/[.!]+$/, "");
      if (/^[A-Za-zÀ-ÿ]{2,}(\s+[A-Za-zÀ-ÿ]{2,}){0,2}$/.test(so) && !NAO_NOME.test(so) && !RE_SIM.test(s) && !RE_NAO.test(s)) nome = capitalizar(so);
    }
    if (nome) { d.nome = nome; out.push(`Prazer, ${nome}!`); }

    const pag = lerPagamento(s) || (this.aguardando === "pagamento" && /\bcartao\b/.test(s) && !/fidelidade/.test(s) ? "cartão na entrega" : null);
    if (pag) { d.pagamento = pag; out.push(`Pagamento: **${pag}**.`); }
    const troco = lerTroco(s);
    if (troco) { d.troco = troco; if (!d.pagamento) d.pagamento = "dinheiro"; out.push(`Troco para R$ ${troco}.`); }
    if (out.length && p.status === "aguardando_confirmacao") p.status = "aberto"; // dado mudou: fecha de novo
    return out;
  }

  // Cardápio, taxas, total, horários...
  informacoes(s, pergunta, jaRespondeu) {
    const p = this.pedido;
    const diaCitado = DIA_NOMES.findIndex((n) => new RegExp(`\\b${n}`).test(s));
    const cat = CATEGORIA_PALAVRAS.find((c) => c.re.test(s));
    if (/\b(cardapio|menu)\b|\b(o que|oque|que) (tem|temos|voces tem|vcs tem|sai|saiu)\b|\bquais (as )?(opcoes|marmitas|pratos)\b|\bopcoes\b/.test(s) || (cat && !jaRespondeu) || (diaCitado >= 0 && /\b(tem|cardapio|sai|marmita)\b/.test(s))) {
      if (diaCitado >= 0 && diaCitado !== this.dia) {
        return `Na ${DIAS[diaCitado]} sai:\n${listaCardapio(diaCitado, ["marmita"])}\nPedidos são só para hoje (${DIAS[this.dia]}), tá?`;
      }
      if (cat) return `${ROTULO_CAT[cat.cat]} de hoje:\n${listaCardapio(this.dia, [cat.cat]).split("\n").slice(1).join("\n")}\nQual vai ser?`;
      return `Hoje (${DIAS[this.dia]}) tem:\n${listaCardapio(this.dia)}\nO que vai ser?`;
    }
    if (/\b(taxa|taxas|frete|bairros?|onde (voces )?entregam|quais lugares|valor da entrega|quanto (e|custa|fica) a entrega)\b/.test(s) && (pergunta || /\b(taxa|frete|bairros)\b/.test(s)) && !jaRespondeu) {
      return `Entregamos em:\n${BAIRROS.map((b) => `- ${b.nome}: ${brl(b.taxa)}`).join("\n")}\nFrete grátis a partir de ${brl(RESTAURANTE.freteGratisAPartirDe)}. Retirada no balcão não paga taxa.`;
    }
    if (/\b(total|quanto (ta|esta|fica|ficou|deu|da|vai dar)|meu pedido|comanda|resumo|o que eu pedi)\b/.test(s)) {
      return this.resumoTexto();
    }
    if (/\b(horario|que horas|ate que horas|abre|fecha)\b/.test(s) && pergunta) return `Entregamos das ${RESTAURANTE.horario}.`;
    if (/\b(quanto tempo|demora|previsao|chega em quanto)\b/.test(s)) return `Fica pronto em ${RESTAURANTE.previsao}.`;
    if (/\b(formas? de pagamento|aceita|aceitam|como (eu )?pago|como pagar)\b/.test(s) && pergunta) return `Aceitamos ${PAGAMENTOS.join(", ")}.`;
    if (/\bcartao fidelidade|fidelidade\b/.test(s) && !jaRespondeu) return `A cada marmita confirmada você ganha 1 selo; com ${META} selos, a próxima é por nossa conta. Já tem cartão? Me passa o código (ex.: CF-1234).`;
    return null;
  }

  resumoTexto() {
    const p = this.pedido;
    if (!p.linhas.length) return "Seu pedido ainda está vazio. Quer ver o cardápio de hoje?";
    const r = p.resumo();
    const linhas = r.itens.map((i) => `- ${i.quantidade}× ${i.item}${i.personalizacoes !== "padrão da casa" ? ` (${i.personalizacoes})` : ""}: ${i.total_linha}`);
    const taxa = p.taxaEntrega();
    return `Seu pedido:\n${linhas.join("\n")}\nSubtotal: ${r.subtotal}\n${p.entrega.modo === "retirada" ? "Retirada no balcão: sem taxa" : p.entrega.modo === "entrega" ? `Entrega (${p.entrega.bairro}): ${taxa === 0 ? "grátis" : brl(taxa)}` : "Entrega: a definir"}\n**Total: ${r.total}**`;
  }

  perguntaDe(o) {
    return {
      entrega: "Vai ser **entrega** (me diz o bairro) ou **retirada no balcão**?",
      bairro: "Qual o bairro da entrega?",
      endereco: "Qual o endereço de entrega? (rua, número e complemento)",
      nome: "Qual o seu nome?",
      pagamento: `Como vai pagar: ${PAGAMENTOS.join(", ")}?`,
      cartao: "Última coisa: você já tem nosso **Cartão Fidelidade**? Se tiver, me passa o código (ex.: CF-1234). Se não, é só dizer \"não\".",
    }[o] || "";
  }

  // Pergunta o que falta; quando está tudo certo, fecha o pedido para o cliente confirmar
  proximoPasso() {
    const p = this.pedido, d = this.dados;
    if (p.status === "aguardando_confirmacao") { this.aguardando = null; return null; }
    let falta = null;
    if (!p.entrega.modo) falta = this.querEntrega ? "bairro" : "entrega";
    else if (p.entrega.modo === "entrega" && !d.endereco) falta = "endereco";
    else if (!d.nome) falta = "nome";
    else if (!d.pagamento) falta = "pagamento";
    else if (!this.cartaoRespondido && !cartaoAtual()) falta = "cartao";
    if (falta) { this.aguardando = falta; return this.perguntaDe(falta); }

    const r = p.fechar({ nome_cliente: d.nome, endereco: d.endereco, forma_pagamento: d.pagamento, troco_para: d.pagamento === "dinheiro" ? d.troco : null });
    if (!r.ok) {
      if (/troco/.test(r.erro)) d.troco = null;
      this.aguardando = /troco/.test(r.erro) ? "pagamento" : null;
      return r.erro;
    }
    this.aguardando = null;
    return `Prontinho, ${d.nome}! ${this.resumoTexto().replace(/^Seu pedido:/, "Seu pedido ficou assim:")}\n${p.entrega.modo === "entrega" ? `Entrega em: ${d.endereco}.\n` : ""}Pagamento: ${d.pagamento}${p.cliente?.troco ? ` (troco para ${brl(p.cliente.troco)})` : ""}.\nConfira e clique no botão verde **Confirmar pedido**, logo acima da caixa de mensagem.`;
  }
}
