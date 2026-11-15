// Dados do restaurante. Preços em CENTAVOS (inteiros) para evitar erro de ponto flutuante.
// O LLM nunca define preço: tudo que é valor sai daqui.

export const RESTAURANTE = {
  nome: "Panela de Ferro",
  atendente: "Bia",
  cidade: "Itajubá – MG",
  horario: "11h às 14h30",
  freteGratisAPartirDe: 10000, // R$ 100,00
  previsao: "40 a 50 minutos",
};

export const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const TODOS = [0, 1, 2, 3, 4, 5, 6];

const TEMPERO = ["normal", "pouco sal", "sem pimenta", "apimentado"];
const PONTO_CARNE = ["mal passado", "ao ponto", "bem passado"];
const ADICIONAIS_MARMITA = [
  { id: "ovo-frito", nome: "ovo frito", preco: 300 },
  { id: "bacon", nome: "bacon em cubos", preco: 400 },
  { id: "queijo-coalho", nome: "queijo coalho", preco: 450 },
  { id: "arroz-integral", nome: "trocar por arroz integral", preco: 200 },
];

// Rótulos das personalizações aceitas (as chaves são as mesmas usadas nas ferramentas do agente)
export const ROTULOS = {
  ponto: "ponto",
  tempero: "tempero",
  sabor: "sabor",
  acucar: "açúcar",
  remover: "remover ingredientes",
  adicionais: "adicionais",
};
export const CAMPOS_UNICOS = ["ponto", "tempero", "sabor", "acucar"];

export const ITENS = [
  // Marmitas
  { id: "bife-acebolado", categoria: "marmita", nome: "Marmita de bife acebolado", preco: 2490, dias: [1, 3, 5],
    descricao: "bife de alcatra acebolado, arroz, feijão, farofa e salada",
    opcoes: { ponto: PONTO_CARNE, tempero: TEMPERO, remover: ["cebola", "alho", "farofa", "feijão", "salada"], adicionais: ADICIONAIS_MARMITA } },
  { id: "frango-grelhado", categoria: "marmita", nome: "Marmita de frango grelhado", preco: 2190, dias: TODOS,
    descricao: "filé de frango grelhado, arroz, feijão, legumes e salada",
    opcoes: { tempero: TEMPERO, remover: ["alho", "feijão", "legumes", "salada"], adicionais: ADICIONAIS_MARMITA } },
  { id: "strogonoff-frango", categoria: "marmita", nome: "Marmita de strogonoff de frango", preco: 2290, dias: [2, 4],
    descricao: "strogonoff de frango, arroz branco e batata palha",
    opcoes: { tempero: TEMPERO, remover: ["cebola", "champignon", "batata palha"], adicionais: ADICIONAIS_MARMITA } },
  { id: "bife-parmegiana", categoria: "marmita", nome: "Marmita de bife à parmegiana", preco: 2790, dias: [2, 6],
    descricao: "bife empanado com molho de tomate e queijo, arroz, feijão e fritas",
    opcoes: { ponto: PONTO_CARNE, tempero: TEMPERO, remover: ["queijo", "molho de tomate", "feijão", "fritas"], adicionais: ADICIONAIS_MARMITA } },
  { id: "feijoada", categoria: "marmita", nome: "Marmita de feijoada", preco: 2990, dias: [3, 6],
    descricao: "feijoada completa com arroz, couve, farofa, torresmo e laranja",
    opcoes: { tempero: TEMPERO, remover: ["couve", "farofa", "torresmo", "laranja", "linguiça calabresa"], adicionais: ADICIONAIS_MARMITA } },
  { id: "carne-de-panela", categoria: "marmita", nome: "Marmita de carne de panela", preco: 2590, dias: [0, 4],
    descricao: "carne de panela com batata, arroz, feijão e salada",
    opcoes: { tempero: TEMPERO, remover: ["batata", "cebola", "feijão", "salada"], adicionais: ADICIONAIS_MARMITA } },
  { id: "tilapia-grelhada", categoria: "marmita", nome: "Marmita de tilápia grelhada", preco: 2690, dias: [4, 5],
    descricao: "filé de tilápia grelhado, arroz, purê de batata e legumes",
    opcoes: { tempero: TEMPERO, remover: ["alho", "purê de batata", "legumes"], adicionais: ADICIONAIS_MARMITA } },
  { id: "frango-assado", categoria: "marmita", nome: "Marmita de frango assado", preco: 2490, dias: [0],
    descricao: "coxa e sobrecoxa assadas, arroz, farofa e maionese de batata",
    opcoes: { tempero: TEMPERO, remover: ["farofa", "maionese de batata", "alho"], adicionais: ADICIONAIS_MARMITA } },
  { id: "lasanha-bolonhesa", categoria: "marmita", nome: "Marmita de lasanha à bolonhesa", preco: 2690, dias: [0, 1],
    descricao: "lasanha à bolonhesa com salada verde",
    opcoes: { tempero: TEMPERO, remover: ["cebola", "salada"], adicionais: [{ id: "queijo-extra", nome: "queijo extra", preco: 350 }] } },
  { id: "vegetariana", categoria: "marmita", nome: "Marmita vegetariana", preco: 2090, dias: TODOS,
    descricao: "grão-de-bico ao curry, arroz integral, legumes e salada",
    opcoes: { tempero: TEMPERO, remover: ["cebola", "coentro", "legumes", "salada"], adicionais: [{ id: "ovo-frito", nome: "ovo frito", preco: 300 }] } },

  // Acompanhamentos
  { id: "ovo-frito-avulso", categoria: "acompanhamento", nome: "Ovo frito avulso", preco: 300, dias: TODOS,
    descricao: "um ovo frito", opcoes: { ponto: ["gema mole", "gema dura"] } },
  { id: "batata-frita", categoria: "acompanhamento", nome: "Porção de batata frita (200 g)", preco: 900, dias: TODOS,
    descricao: "batata frita crocante", opcoes: { tempero: ["normal", "sem sal", "com páprica"] } },
  { id: "salada-extra", categoria: "acompanhamento", nome: "Salada extra", preco: 500, dias: TODOS,
    descricao: "alface, tomate, cenoura e cebola roxa", opcoes: { remover: ["cebola roxa", "tomate", "cenoura"] } },
  { id: "farofa", categoria: "acompanhamento", nome: "Porção de farofa", preco: 400, dias: TODOS,
    descricao: "farofa de bacon", opcoes: {} },

  // Bebidas
  { id: "refrigerante-lata", categoria: "bebida", nome: "Refrigerante lata 350 ml", preco: 600, dias: TODOS,
    descricao: "cola, guaraná ou laranja", opcoes: { sabor: ["cola", "guaraná", "laranja"] } },
  { id: "suco-natural", categoria: "bebida", nome: "Suco natural 500 ml", preco: 800, dias: TODOS,
    descricao: "feito na hora", opcoes: { sabor: ["laranja", "limão", "maracujá"], acucar: ["com açúcar", "sem açúcar", "com adoçante"] } },
  { id: "agua", categoria: "bebida", nome: "Água mineral 500 ml", preco: 350, dias: TODOS,
    descricao: "garrafa", opcoes: { sabor: ["sem gás", "com gás"] } },

  // Sobremesas
  { id: "pudim", categoria: "sobremesa", nome: "Pudim de leite (fatia)", preco: 700, dias: TODOS, descricao: "pudim de leite condensado", opcoes: {} },
  { id: "mousse-maracuja", categoria: "sobremesa", nome: "Mousse de maracujá", preco: 650, dias: [2, 4, 6], descricao: "pote de 150 ml", opcoes: {} },
];

// Bairros atendidos em Itajubá (taxas fictícias, para o trabalho)
export const BAIRROS = [
  { nome: "Centro", taxa: 400 },
  { nome: "BPS", taxa: 500 },
  { nome: "Pinheirinho", taxa: 500 },
  { nome: "Morro Chic", taxa: 500 },
  { nome: "Varginha", taxa: 600 },
  { nome: "Medicina", taxa: 600 },
  { nome: "Vila Rubens", taxa: 600 },
  { nome: "Santo Antônio", taxa: 700 },
  { nome: "Boa Vista", taxa: 700 },
  { nome: "São Vicente", taxa: 800 },
  { nome: "Estiva", taxa: 900 },
];

export const CATEGORIAS = { marmita: "Marmitas", acompanhamento: "Acompanhamentos", bebida: "Bebidas", sobremesa: "Sobremesas" };

// ---------- utilitários ----------
export function normalizar(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function brl(centavos) {
  const v = (centavos / 100).toFixed(2).split(".");
  const inteiro = v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiro},${v[1]}`;
}

export function buscarItem(ref) {
  const n = normalizar(ref);
  if (!n) return null;
  return ITENS.find((i) => normalizar(i.id) === n || normalizar(i.nome) === n) || null;
}

export function buscarBairro(ref) {
  const n = normalizar(ref);
  return BAIRROS.find((b) => normalizar(b.nome) === n) || null;
}

export function itensDoDia(dia) {
  return ITENS.filter((i) => i.dias.includes(dia));
}

// Formato compacto que o agente recebe ao consultar o cardápio
export function itemParaAgente(item) {
  const pers = {};
  for (const [k, v] of Object.entries(item.opcoes)) {
    if (k === "adicionais") pers[k] = v.map((a) => `${a.nome} (+${brl(a.preco)})`);
    else pers[k] = v;
  }
  return { id: item.id, nome: item.nome, preco_unitario: brl(item.preco), descricao: item.descricao, personalizacoes: pers };
}

// Valores "legítimos" que podem aparecer numa resposta (usado na checagem de saída)
export function valoresDeReferencia() {
  const s = new Set([RESTAURANTE.freteGratisAPartirDe]);
  for (const i of ITENS) {
    for (let k = 1; k <= 10; k++) s.add(i.preco * k);
    for (const a of i.opcoes.adicionais || []) { s.add(a.preco); s.add(i.preco + a.preco); }
  }
  for (const b of BAIRROS) s.add(b.taxa);
  return s;
}
