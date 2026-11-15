// Fotos dos pratos (Unsplash, licença gratuita: https://unsplash.com/license).
// Só o código da foto fica aqui; a URL é montada em foto().
export const FOTOS = {
  hero: "1626379907504-327b925f4b79",
  "bife-acebolado": "1759418661781-2b37f26c4573",
  "frango-grelhado": "1762631934518-f75e233413ca",
  "strogonoff-frango": "1721162720198-a6d031314df7",
  "bife-parmegiana": "1632778149955-e80f8ceca2e8",
  feijoada: "1692263579137-31c58dd2b4a3",
  "carne-de-panela": "1628521061262-19b5cdb7eee5",
  "tilapia-grelhada": "1792460238685-f56f0d451fca",
  "frango-assado": "1599161146640-8d60bd2888e3",
  "lasanha-bolonhesa": "1709429790175-b02bb1b19207",
  vegetariana: "1516714435131-44d6b64dc6a2",
  "ovo-frito-avulso": "1610328466269-1f36faad83c1",
  "batata-frita": "1518013431117-eb1465fa5752",
  "salada-extra": "1622790176973-2c27952176fe",
  farofa: "1594397108792-a44907416b83",
  "refrigerante-lata": "1629186235045-80d4147d90dc",
  "suco-natural": "1689066117649-0ca9762fc92c",
  agua: "1788542026849-685dd8e93be2",
  pudim: "1702728109878-c61a98d80491",
  "mousse-maracuja": "1604495772376-9657f0035eb5",
};

export function foto(chave, largura = 640) {
  const id = FOTOS[chave];
  return id ? `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${largura}&q=70` : "";
}
