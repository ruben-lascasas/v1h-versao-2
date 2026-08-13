import { taxIdOptional, isValidPortugueseNif } from './validators';

/**
 * O NIF é obrigatório no checkout e facultativo na página de conta: quem nunca
 * reservou não tem de o dar já. Mas se o escrever, tem de estar certo — o erro
 * deve aparecer ali, e não a meio de um pagamento.
 *
 * Os números abaixo têm o dígito de controlo calculado (soma dos 8 primeiros
 * pelos pesos 9..2; 11 menos o resto da divisão por 11; 10 ou mais conta como
 * zero). Não são NIFs de ninguém — são combinações que satisfazem a regra.
 */
describe('NIF', () => {
  const VALIDOS = ['503004561', '123456789', '501442600', '201234564'];

  describe('isValidPortugueseNif', () => {
    it('aceita NIFs com dígito de controlo correcto', () => {
      VALIDOS.forEach(n => expect(isValidPortugueseNif(n)).toBe(true));
    });

    it('recusa um dígito de controlo errado', () => {
      // O mesmo número com o último dígito trocado
      expect(isValidPortugueseNif('503004564')).toBe(false);
      expect(isValidPortugueseNif('123456788')).toBe(false);
    });

    it('recusa comprimentos que não sejam 9 dígitos', () => {
      expect(isValidPortugueseNif('12345')).toBe(false);
      expect(isValidPortugueseNif('5030045611')).toBe(false);
    });

    it('recusa o que não é uma string', () => {
      expect(isValidPortugueseNif(503004561)).toBe(false);
      expect(isValidPortugueseNif(null)).toBe(false);
      expect(isValidPortugueseNif(undefined)).toBe(false);
    });
  });

  describe('taxIdOptional', () => {
    const validar = taxIdOptional('inválido');

    it('deixa passar um campo vazio — é facultativo', () => {
      expect(validar('')).toBeUndefined();
      expect(validar('   ')).toBeUndefined();
      expect(validar(undefined)).toBeUndefined();
    });

    it('deixa passar um NIF válido', () => {
      expect(validar('503004561')).toBeUndefined();
    });

    it('limpa espaços antes de validar', () => {
      // É assim que as pessoas escrevem o NIF; recusar por causa dos espaços
      // seria um erro do formulário, não do utilizador.
      expect(validar('  503 004 561  ')).toBeUndefined();
    });

    it('recusa um NIF errado, com a mensagem dada', () => {
      expect(validar('503004564')).toBe('inválido');
      expect(validar('12345')).toBe('inválido');
    });
  });
});
