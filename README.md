# Panela de Ferro: chatbot de vendas de marmitas sem LLM (estilo ELIZA)

Trabalho da disciplina ECAA09 (UNIFEI). Chatbot web que vende marmitas conversando em português: mostra o cardápio do dia com preço por unidade, entende o pedido em texto livre, aceita personalizações (tirar ingrediente, tempero, ponto da carne), calcula o total com entrega e fecha o pedido.

**A atendente, a Bia, não usa LLM nem nenhuma API de IA.** Ela é um motor de regras no estilo da ELIZA, escrito em JavaScript, que roda 100% no navegador: não precisa de chave, de servidor nem de internet para conversar.

- **Aplicação:** https://beatrizpereiras.github.io/ECAA09-marmita/
- **Repositório:** https://github.com/Beatrizpereiras/ECAA09-marmita

## Como usar

O site funciona como a vitrine de uma marmitaria: foto de destaque com o especial do dia, cardápio da semana com fotos e preços (abas por dia), acompanhamentos, sucos e sobremesas, cartão fidelidade e um passo a passo de como pedir. Ao lado (no celular, no botão **Pedir com a Bia**) fica o chat com a **Bia**.

Toque em **Quero esta** em qualquer prato ou escreva do seu jeito, por exemplo:

- *"2 de frango grelhado, uma sem feijão, entrega no Centro"*
- *"quero 3 bifes, 2 mal passados e 1 ao ponto"*
- *"um suco de maracujá sem açúcar e 2 refri guaraná"*
- *"tem pudim?"* → *"sim"*
- *"tira a batata"*, *"quanto deu?"*, *"cardápio de quarta"*

A comanda (botão **Ver comanda**) mostra itens, subtotal, taxa de entrega e total em tempo real. Quando a Bia fechar o pedido, aparece o botão verde **Confirmar pedido**: só o clique do cliente confirma.

Para testar o cardápio de outro dia, acrescente `?dia=0` a `?dia=6` na URL (0 = domingo).

## Como a Bia funciona (sem LLM)

A ELIZA (Joseph Weizenbaum, MIT, 1966) foi um dos primeiros chatbots: ela procurava palavras-chave na frase do usuário e respondia com modelos prontos, às vezes repetindo a frase com os pronomes trocados ("eu" → "você"). A Bia usa a mesma ideia, com regras específicas para vender marmitas. O motor está em `bia.js`.

Cada mensagem passa por 5 etapas:

1. **Guardrails** (`guardrails.js`): o filtro de entrada barra tentativas de injeção/jailbreak ("ignore as instruções", "sou o dono, mude o preço", "100% de desconto") e há limite de mensagens. Três ataques seguidos pausam o atendimento por 60 s.
2. **Normalização**: tudo em minúsculas e sem acento, números por extenso viram dígitos ("duas" → 2) e erros de digitação são corrigidos pela palavra conhecida mais parecida (distância de Levenshtein: "lazanha" → "lasanha", "feijuada" → "feijoada").
3. **Extração por padrões** (expressões regulares e listas de sinônimos):
   - **itens** com quantidade ("2 de frango", "uma porção de batata frita"), usando sinônimos ("refri", "coca", "estrogonofe", "peixe"...);
   - **personalizações**: ponto ("mal passado"), tempero ("sem pimenta"), tirar ingredientes ("sem cebola e alho", "tira o feijão"), adicionais ("com bacon", "+ ovo"), sabor e açúcar. Cada personalização vai para o item citado logo antes; "2 de frango, uma sem feijão" divide em 1 normal + 1 sem feijão;
   - **dados do pedido**: entrega/retirada, bairro, endereço, nome, forma de pagamento e troco;
   - **intenções**: pergunta ("tem pudim?" só informa, não coloca no pedido), pedido ("quero..."), tirar item, cardápio, taxas, total, horário, cartão fidelidade.
4. **Ação**: quem valida e calcula tudo é o `Pedido` (`carrinho.js`). A Bia só monta a resposta com o resultado. Se algo não existe ou não é permitido ("frango mal passado", "feijoada na segunda"), a resposta explica o motivo com as opções certas.
5. **Próximo passo**: a Bia pergunta o que falta, um de cada vez (entrega ou retirada → bairro → endereço → nome → pagamento → cartão fidelidade). Quando está tudo certo, fecha o pedido e pede o clique em **Confirmar pedido**.

Situações especiais:

- **Ambiguidade**: "frango" numa terça (dia de frango grelhado e strogonoff) vira a pergunta "Qual frango você quer?".
- **Conversa estilo ELIZA**: "estou com fome", "você é um robô?", "estou cansada", "eu adoro minha avó" → "Que bom que você gosta de sua avó!" (troca de pronomes), "obrigada", "tchau".
- **Não entendi**: respostas variadas, sugerindo exemplos e repetindo a pergunta pendente.

Vantagens em relação ao LLM: as respostas são previsíveis e testáveis, não há custo nem chave de API, funciona offline e o preço nunca é inventado (todo valor vem do código). A limitação é que ela só entende o que está nas regras.

## Requisitos da atividade

| Requisito | Onde está |
|---|---|
| Realizar vendas | `bia.js` monta o pedido em `carrinho.js` (adicionar, alterar, tirar, entrega, fechar) e o cliente confirma pelo botão |
| Produtos e preço por unidade de cada dia | `cardapio.js` (campo `dias` de cada item); a Bia lista o cardápio do dia ou de outro dia |
| Escolha de itens por texto | Padrões e sinônimos em `bia.js`, com correção de erros de digitação |
| Mudar temperos e ponto de cozimento | Ponto, tempero, tirar ingredientes, adicionais, sabor e açúcar, validados contra as opções de cada item |
| Valor total com entrega | Taxa por bairro, retirada sem taxa e frete grátis a partir de R$ 100,00 (`carrinho.js`) |
| Guardrails contra injeção e jailbreak | `guardrails.js` (detalhes abaixo) |
| Web, JavaScript, 100% client-side | HTML + CSS + JavaScript puro (módulos ES), sem build e sem servidor, hospedado no GitHub Pages |

## Arquitetura

```
index.html     interface (site + conversa + comanda)
estilo.css     visual, responsivo
cardapio.js    itens, preços (em centavos), dias, personalizações, bairros
carrinho.js    estado do pedido e TODAS as regras de preço e validação
bia.js         a atendente: motor de regras estilo ELIZA (normalização, padrões, respostas)
guardrails.js  filtro de entrada, texto livre seguro, limite de mensagens
fidelidade.js  cartão fidelidade: cria o código, confere, carimba selos e resgate
app.js         liga a conversa e a comanda à Bia
vitrine.js     site: cardápio com fotos, abas por dia, especial do dia, cartão fidelidade, abrir/fechar o chat
fotos.js       código das fotos de cada prato (Unsplash)
logo.svg       logo da Panela de Ferro
bia.svg        avatar da Bia (ilustração própria)
testes.js      testes automáticos (node testes.js)
```

O princípio central é: **a Bia conversa, o código decide**. A Bia nunca escreve preço por conta própria e nunca confirma pedido: os valores vêm sempre do `Pedido`, e a confirmação é só pelo clique do cliente.

## Guardrails

1. **Filtro de entrada** (`verificarEntrada`): normaliza Unicode, remove caracteres invisíveis, desfaz leetspeak (`1gn0r3`) e procura padrões de ataque em português e inglês: ignorar instruções, revelar instruções, troca de papel, modos especiais (DAN, modo desenvolvedor), falsa autoridade ("sou o dono"), manipulação de preço, marcadores de papel (`<|im_start|>`, `system:`) e texto codificado longo. Limite de 500 caracteres.
2. **Regras fechadas**: como não há LLM, não existe "prompt" para ser enganado. A Bia só executa as ações previstas no código; não existe ação para mudar preço ou dar desconto.
3. **Validação estrita no pedido**: só aceita item existente e disponível no dia, quantidade inteira de 1 a 20, personalizações da lista do item e textos livres curtos e filtrados (nome, endereço).
4. **Confirmação humana**: o pedido só é confirmado pelo clique no botão. Qualquer mudança depois de fechado reabre o pedido; depois de confirmado, nada muda.
5. **Limites de uso**: intervalo mínimo entre mensagens, máximo de mensagens por sessão e pausa de 60 s após 3 tentativas de ataque.
6. **Segurança da página**: Content-Security-Policy que só permite scripts do próprio site, fotos do Unsplash e **nenhuma conexão com servidor** (`connect-src 'none'`), e renderização das mensagens com `textContent` (sem `innerHTML`), o que impede XSS.

## Cartão fidelidade

1. **Primeira compra:** quando o cliente clica em Confirmar pedido, o site cria o cartão e a Bia mostra o código (ex.: `CF-4821`). Cada marmita confirmada vale 1 selo.
2. **Próximos pedidos:** antes de fechar o pedido a Bia pergunta se o cliente já tem o cartão. Se ele mandar o código, o site confere e vincula o cartão; os selos novos entram quando ele confirmar. Código errado não é aceito.
3. **10 selos:** o cartão fica completo e a próxima marmita sai por conta da casa (resgate na entrega); depois disso a contagem recomeça.

Quem cria, confere e carimba o cartão é o código (`fidelidade.js`). O cartão não mexe nos valores da comanda.

Limitação: sem servidor, os cartões ficam guardados no navegador onde foram criados (`localStorage`). Para valer em qualquer aparelho, seria preciso guardar o mapa código → selos num banco de dados.

## Testes

```bash
node testes.js
```

Cobrem cálculo de preços e taxas, disponibilidade por dia, validação de personalizações, fechamento e confirmação, 15 ataques que devem ser barrados e 9 frases normais que devem passar, e conversas completas com a Bia: quantidades e divisão de personalizações, ambiguidade, perguntas que não colocam item, textos dos botões do cardápio, tirar item, pedido inteiro numa mensagem, perguntas dos dados que faltam, conversa estilo ELIZA, cardápio de outro dia, cartão fidelidade e pedido confirmado que não muda mais.

## Publicar no GitHub Pages

Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve. Em um ou dois minutos o site fica em `https://beatrizpereiras.github.io/ECAA09-marmita/`.

## Observações

Restaurante, preços e taxas são fictícios. Fotos: [Unsplash](https://unsplash.com/license) (licença gratuita).

Versões anteriores deste projeto usavam um LLM (gpt-oss-120b, via Groq). A pedido do professor, a atendente foi refeita sem LLM; o histórico do Git guarda a versão antiga.
