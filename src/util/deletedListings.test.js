import {
  getDeletedListingIds,
  addDeletedListingId,
  isListingDeleted,
  mergeServerDeletedListings,
} from './deletedListings';

/**
 * A contagem da página de anúncios vinha do `pagination.totalItems` da API, que
 * não conhece a lista de escondidos. Quem apagasse o seu único anúncio lia
 * "Tem 1 anúncio" por cima de uma grelha vazia.
 *
 * A conta que a página faz agora é `totalItems - escondidos`. Estes testes
 * fixam a lista de escondidos, de que essa conta depende.
 */
describe('lista de anúncios escondidos', () => {
  beforeEach(() => window.localStorage.clear());

  const conta = (totalItems, escondidos) => Math.max(0, totalItems - escondidos.length);

  it('guarda por utilizador, sem misturar contas', () => {
    addDeletedListingId('user-a', 'l-1');
    expect(getDeletedListingIds('user-a')).toEqual(['l-1']);
    expect(getDeletedListingIds('user-b')).toEqual([]);
  });

  it('não duplica o mesmo anúncio', () => {
    addDeletedListingId('user-a', 'l-1');
    addDeletedListingId('user-a', 'l-1');
    expect(getDeletedListingIds('user-a')).toEqual(['l-1']);
  });

  it('apagar o único anúncio dá contagem zero, não um', () => {
    // Exactamente o caso relatado: a API continua a contar o anúncio, porque
    // ele existe (fechado). O que a pessoa vê é zero.
    addDeletedListingId('user-a', 'l-1');
    expect(conta(1, getDeletedListingIds('user-a'))).toBe(0);
  });

  it('desconta só os escondidos', () => {
    addDeletedListingId('user-a', 'l-1');
    expect(conta(3, getDeletedListingIds('user-a'))).toBe(2);
  });

  it('nunca desce abaixo de zero', () => {
    // Defensivo: se a lista tiver um id que a API já não conta, a subtracção
    // não pode produzir um número negativo no ecrã.
    addDeletedListingId('user-a', 'l-1');
    addDeletedListingId('user-a', 'l-2');
    expect(conta(1, getDeletedListingIds('user-a'))).toBe(0);
  });

  it('isListingDeleted responde ao que foi guardado', () => {
    addDeletedListingId('user-a', 'l-1');
    expect(isListingDeleted('user-a', 'l-1')).toBe(true);
    expect(isListingDeleted('user-a', 'l-9')).toBe(false);
  });

  it('junta o que veio do servidor sem perder o que era só local', () => {
    // O local só existe neste browser; o do servidor veio de outro. Perder
    // qualquer um deles faz reaparecer um anúncio que a pessoa já apagou.
    addDeletedListingId('user-a', 'local-1');
    const merged = mergeServerDeletedListings('user-a', ['servidor-1']);
    expect(merged.sort()).toEqual(['local-1', 'servidor-1']);
  });

  it('não duplica ao juntar o que já era conhecido dos dois lados', () => {
    addDeletedListingId('user-a', 'l-1');
    expect(mergeServerDeletedListings('user-a', ['l-1'])).toEqual(['l-1']);
  });

  it('aguenta uma resposta do servidor sem lista', () => {
    addDeletedListingId('user-a', 'l-1');
    expect(mergeServerDeletedListings('user-a', undefined)).toEqual(['l-1']);
  });
});
