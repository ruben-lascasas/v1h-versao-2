const moment = require('moment-timezone/builds/moment-timezone-with-data-10-year-range.min');

/**
 * Um anúncio, dois modos de aluguer: à hora e ao dia.
 *
 * O PEDIDO
 *
 * "Em vez dos anúncios serem strictly aluguer por hora ou aluguer por dia,
 * podia haver a opção de ter os dois num só anúncio." Um espaço que serve para
 * uma reunião de duas horas e para um casamento de fim-de-semana não devia ter
 * de ser dois anúncios.
 *
 * O QUE A SHARETRIBE DEIXA, E O QUE NÃO DEIXA
 *
 * Um anúncio tem um `unitType` só, que lhe vem do tipo de anúncio, e é ele que
 * decide o código da linha de fatura (`line-item/day`, `line-item/hour`). Isso
 * não se contorna: muda-se.
 *
 * O que ajuda é que o processo de reservas cria sempre reservas por tempo
 * (`:action/create-pending-booking {:type :time}`), tanto para o diário como
 * para o horário, e que os anúncios diários já têm plano de disponibilidade
 * `availability-plan/time`. Por baixo já era tudo horário — só a forma de
 * cobrar é que era fixa. Por isso isto não obriga a publicar uma versão nova
 * do processo nem mexe nas reservas em curso.
 *
 * ONDE FICAM OS PREÇOS
 *
 * `publicData.precos = { hour: <cêntimos>, day: <cêntimos> }`, na moeda do
 * anúncio. O preço do modo principal continua também em `attributes.price`,
 * que é o que a Sharetribe indexa para o filtro de preço e o que aparece no
 * cartão — mexer nisso mudava preços à vista em anúncios que já existem.
 *
 * Um anúncio sem `precos` (todos os de hoje) continua a funcionar: lê-se o
 * preço de `attributes.price` e o modo é o `unitType` dele. Nada a migrar.
 *
 * O PREÇO NUNCA VEM DO BROWSER
 *
 * Quem reserva escolhe um *nome de modo* — "hour" ou "day". O valor vem sempre
 * daqui, do anúncio. Se o nome não for um modo que o anúncio tenha, cai-se no
 * modo principal em vez de se aceitar o que veio de fora.
 */

const MODOS = ['hour', 'day'];

/**
 * Os preços de cada modo, em cêntimos. O modo principal (o `unitType` do
 * anúncio) vem de `attributes.price` quando `publicData.precos` ainda não
 * existe — é o caso de todos os anúncios anteriores a esta funcionalidade.
 */
const precosDoAnuncio = listing => {
  const publicData = listing?.attributes?.publicData || {};
  const { unitType, precos } = publicData;
  const principal = listing?.attributes?.price?.amount;

  const valido = v => Number.isInteger(v) && v > 0;

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
const temDoisModos = listing => {
  const precos = precosDoAnuncio(listing);
  return MODOS.every(m => Number.isInteger(precos[m]));
};

/**
 * Qual o modo a cobrar, dado o que o cliente escolheu.
 *
 * Um nome desconhecido, ou um modo que este anúncio não vende, não dá erro:
 * cai no modo principal. Uma reserva a meio do checkout não se deve perder por
 * causa de um parâmetro estranho — mas também não se cobra pelo que ele pedir.
 */
const modoACobrar = (listing, modoPedido) => {
  const unitType = listing?.attributes?.publicData?.unitType;
  const precos = precosDoAnuncio(listing);
  return MODOS.includes(modoPedido) && Number.isInteger(precos[modoPedido]) ? modoPedido : unitType;
};

/**
 * Quantos dias de calendário a reserva ocupa, no fuso do anúncio.
 *
 * PORQUE É QUE NÃO SE USA O `daysBetween` DE SEMPRE
 *
 * Ele conta a diferença entre as duas datas. Isso serve enquanto um dia for
 * meia-noite a meia-noite: 1 Jan 00:00 → 3 Jan 00:00 são 2 dias, e é o que se
 * cobra hoje.
 *
 * Mas aqui um "dia" é o horário de abertura do espaço. Uma reserva das 09:00
 * às 18:00 do mesmo dia dá diferença zero — e sairia de graça. De 09:00 de
 * segunda às 18:00 de quarta dá 2, quando são três dias de espaço ocupado.
 *
 * Por isso conta-se o número de dias de calendário tocados. O caso antigo
 * continua a dar o mesmo: de 1 Jan 00:00 a 3 Jan 00:00 toca 1, 2 e 3 Jan, mas
 * o fim cai exatamente na fronteira do dia 3 — esse não se cobra, e ficam 2.
 * É essa a razão do desconto da meia-noite, e é o que garante que nenhuma
 * reserva diária existente muda de preço com esta alteração.
 */
const diasCobertos = (inicio, fim, timeZone = 'Etc/UTC') => {
  const i = moment.tz(inicio, timeZone);
  const f = moment.tz(fim, timeZone);
  // Fim antes do início não é intervalo nenhum; fim igual ao início é uma
  // reserva de duração zero, que não ocupa dia nenhum nem se cobra.
  if (!i.isValid() || !f.isValid() || !f.isAfter(i)) {
    return null;
  }

  const primeiro = i.clone().startOf('day');
  const ultimo = f.clone().startOf('day');
  const tocados = ultimo.diff(primeiro, 'days') + 1;

  // O fim na fronteira do dia não ocupa esse dia.
  const terminaNaFronteira = f.isSame(ultimo);
  const dias = terminaNaFronteira ? tocados - 1 : tocados;

  return dias > 0 ? dias : null;
};

module.exports = { MODOS, precosDoAnuncio, temDoisModos, modoACobrar, diasCobertos };
