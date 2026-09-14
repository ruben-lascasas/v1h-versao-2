/**
 * Identificação da entidade que opera a Venue1Hub.
 *
 * Os valores vivem em `legalEntity.json`, ao lado deste ficheiro, e são lidos
 * por três sítios: o rodapé do site, o Centro Jurídico e o rodapé das facturas
 * que o servidor emite.
 *
 * Em JSON e não aqui em JavaScript pela mesma razão que a campanha de fundador:
 * o servidor é CommonJS e faz-lhe `require`, o site é ESM e faz-lhe `import`.
 * Um ficheiro de dados serve os dois; um módulo ESM só serviria um.
 *
 * Foi a lição da campanha de fundador e dos links das redes sociais — dados de
 * identificação escritos em três sítios acabam sempre por divergir, e num aviso
 * legal isso não é um detalhe.
 */

import entidade from './legalEntity.json';

export const OPERADOR = entidade;

/** Uma linha, para rodapés e sítios onde não cabe o bloco todo. */
export const operadorNumaLinha = () =>
  `${OPERADOR.nome} · ${OPERADOR.registo} · ${OPERADOR.morada}`;
