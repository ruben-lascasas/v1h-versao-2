/**
 * Campanha de fundador — o que o site mostra ao público.
 *
 * Os valores vivem em `founderCampaign.json`, ao lado deste ficheiro, e são os
 * mesmos que o servidor lê para decidir quem fica com 5%. Um ficheiro só, lido
 * pelos dois lados.
 *
 * Já esteve dividido entre este ficheiro e a variável de ambiente
 * FOUNDER_COMMISSION_UNTIL, e divergiu: o site anunciava 15 de outubro
 * enquanto o servidor dava a condição a quem se registasse até 31 de dezembro.
 * Duas fontes para a mesma promessa comercial é uma discrepância à espera de
 * acontecer — e uma que só se descobre quando alguém reclama.
 */

import campanha from './founderCampaign.json';

/** Fim da campanha, hora de Lisboa. */
export const FOUNDER_DEADLINE = new Date(campanha.deadline);

/** Percentagem de comissão de quem entra na campanha. */
export const FOUNDER_RATE = campanha.founderRate;

/** Percentagem de quem chegar depois. */
export const STANDARD_RATE = campanha.standardRate;

/** Vagas anunciadas. */
export const FOUNDER_SLOTS = campanha.slots;

/** Tipos de conta que ganham a condição — os que recebem dinheiro. */
export const FOUNDER_USER_TYPES = campanha.userTypes;

/** Este tipo de conta ganha comissão, e portanto entra na campanha? */
export const ganhaComissao = userType => FOUNDER_USER_TYPES.includes(userType);

/**
 * A percentagem como se escreve em português: 12,5 e não 12.5.
 *
 * Feito à mão em vez de `toLocaleString('pt-PT')` de propósito. O servidor
 * pré-renderiza esta página, e se o Node e o browser formatarem o número de
 * maneira diferente — coisa que depende do ICU instalado — o React acusa
 * divergência na hidratação. Uma troca de ponto por vírgula dá sempre o mesmo
 * resultado nos dois lados.
 */
export const taxaEscrita = taxa => String(taxa).replace('.', ',');

/**
 * A campanha ainda está a decorrer?
 *
 * Verificado a cada montagem em vez de fixado na compilação: senão, um site que
 * ficasse semanas sem novo deploy continuaria a anunciar uma campanha
 * terminada.
 */
export const isFounderCampaignOpen = (agora = new Date()) => agora <= FOUNDER_DEADLINE;

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const MESES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "15 de outubro" / "15 October" — para escrever na frase sem repetir a data.
 *
 * Os meses estão escritos à mão, e não vêm de `toLocaleDateString`, pela mesma
 * razão que a percentagem leva vírgula à mão: esta frase aparece no HTML
 * pré-renderizado do registo, e o nome do mês que o Node produz depende do ICU
 * que estiver instalado. Se não for igual ao do browser, o React acusa
 * divergência na hidratação. Doze palavras numa lista não têm esse problema.
 */
export const founderDeadlineLabel = (locale = 'pt') => {
  const dia = FOUNDER_DEADLINE.getDate();
  const mes = FOUNDER_DEADLINE.getMonth();
  return locale === 'en' ? `${dia} ${MESES_EN[mes]}` : `${dia} de ${MESES_PT[mes]}`;
};
