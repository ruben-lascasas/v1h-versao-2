/**
 * Campanha de fundador — o que o site mostra ao público.
 *
 * ATENÇÃO: esta data tem de ser a mesma que está em FOUNDER_COMMISSION_UNTIL no
 * servidor. É essa variável que decide de facto quem fica com 5%; esta só
 * decide o que o popup anuncia.
 *
 * Se divergirem, uma das duas coisas acontece, e ambas são más: ou o site
 * promete uma condição que o servidor já não dá, ou continua a dar-se 5% a quem
 * se registou depois de a campanha ter sido anunciada como terminada.
 *
 * Não dá para ler a variável do servidor a partir daqui — as variáveis do
 * cliente têm de começar por REACT_APP_ e ser fixadas na compilação, e não vale
 * a pena expor a configuração comercial no pacote que vai para o browser.
 */

/** Fim da campanha, hora de Lisboa. */
export const FOUNDER_DEADLINE = new Date('2026-10-15T23:59:59+01:00');

/** Percentagem de comissão de quem entra na campanha. */
export const FOUNDER_RATE = 5;

/** Percentagem de quem chegar depois. */
export const STANDARD_RATE = 12.5;

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

/** Vagas anunciadas. */
export const FOUNDER_SLOTS = 100;

/**
 * A campanha ainda está a decorrer?
 *
 * Verificado a cada montagem em vez de fixado na compilação: senão, um site que
 * ficasse semanas sem novo deploy continuaria a anunciar uma campanha
 * terminada.
 */
export const isFounderCampaignOpen = (agora = new Date()) => agora <= FOUNDER_DEADLINE;

/** "15 de outubro" — para escrever na frase sem repetir a data à mão. */
export const founderDeadlineLabel = () =>
  FOUNDER_DEADLINE.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
