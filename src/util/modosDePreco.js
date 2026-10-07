/**
 * Modos de aluguer no browser: à hora e ao dia, no mesmo anúncio.
 *
 * ESTE FICHEIRO TEM UM GÉMEO NO SERVIDOR
 *
 * `server/api-util/modosDePreco.js` sabe as mesmas regras, e é ele que manda:
 * o preço cobrado sai sempre de lá, nunca daqui. Isto serve para mostrar os
 * preços certos e para saber que modos oferecer a quem reserva.
 *
 * Os dois têm testes que prendem as mesmas regras — ler os preços de
 * `publicData.precos`, cair em `attributes.price` quando não houver, e ignorar
 * valores que não sejam inteiros positivos. Se um dia divergirem, é um dos dois
 * conjuntos de testes que o diz.
 *
 * Não se partilha o ficheiro porque o servidor corre CommonJS em Node puro e
 * isto é um módulo ESM compilado para o browser.
 */

export const MODOS = ['hour', 'day'];

/** O outro modo: o que o anúncio pode vender além do seu `unitType`. */
export const outroModo = unitType =>
  unitType === 'hour' ? 'day' : unitType === 'day' ? 'hour' : null;

const valido = v => Number.isInteger(v) && v > 0;

/**
 * Os preços de cada modo, em cêntimos.
 *
 * Um anúncio sem `precos` — todos os anteriores a esta funcionalidade — tem o
 * preço do seu modo principal em `attributes.price`, e é de lá que se lê.
 */
export const precosDoAnuncio = listing => {
  const publicData = listing?.attributes?.publicData || {};
  const { unitType, precos } = publicData;
  const principal = listing?.attributes?.price?.amount;

  const resultado = {};
  for (const modo of MODOS) {
    const guardado = precos?.[modo];
    if (valido(guardado)) {
      resultado[modo] = guardado;
    } else if (modo === unitType && valido(principal)) {
      resultado[modo] = principal;
    }
  }
  return resultado;
};

/** O anúncio aceita reservas nos dois modos? */
export const temDoisModos = listing => {
  const precos = precosDoAnuncio(listing);
  return MODOS.every(m => Number.isInteger(precos[m]));
};

/**
 * Os modos que este anúncio vende, do principal para o outro.
 *
 * A ordem importa: é a ordem dos botões, e o primeiro é o que abre. Começar
 * pelo modo que o anúncio sempre vendeu evita mudar o comportamento de um
 * anúncio que já existe só porque ganhou um segundo preço.
 */
export const modosDisponiveis = listing => {
  const unitType = listing?.attributes?.publicData?.unitType;
  const precos = precosDoAnuncio(listing);
  const ordem = [unitType, outroModo(unitType)].filter(Boolean);
  return ordem.filter(m => Number.isInteger(precos[m]));
};

/**
 * Este tipo de anúncio pode ter dois preços?
 *
 * Só faz sentido com reservas e com uma unidade que tenha outra do outro lado.
 * As variantes de preço nativas ficam de fora: são outra maneira de dizer o
 * mesmo, e ter as duas ligadas dava um preço que ninguém explica (o servidor
 * resolve o empate a favor das variantes, mas mais vale não chegar lá).
 */
export const aceitaDoisModos = ({ unitType, isBooking, isPriceVariationsInUse }) =>
  !!isBooking && !isPriceVariationsInUse && !!outroModo(unitType);

/**
 * O modo que vale, dado o que o cliente escolheu no painel de reserva.
 *
 * Sem escolha feita, ou com uma escolha que este anúncio não vende, vale o
 * primeiro modo disponível — que é o principal do anúncio. Nunca devolve um
 * modo sem preço: era isso que punha o painel a mostrar "€ undefined" ou a
 * pedir ao servidor uma linha de fatura que ele não sabe calcular.
 */
export const resolverModo = (listing, escolhido) => {
  const disponiveis = modosDisponiveis(listing);
  if (escolhido && disponiveis.includes(escolhido)) {
    return escolhido;
  }
  return disponiveis[0] || listing?.attributes?.publicData?.unitType || null;
};
