import { verificationCopy, verificationPhase } from './verificationCopy';

/**
 * O aviso do topo e a NoAccessPage mostram o mesmo estado. Estavam escritos à
 * parte e divergiram: a NoAccessPage dizia a um anunciante que precisava de
 * "uma conta de Anunciante", que é o que ele já tinha. Estes testes fixam a
 * redação por estado, para não voltar a acontecer.
 */

const doc = status => ({ status });

describe('que estado comunicar', () => {
  it('nada submetido', () => {
    expect(verificationPhase('nao_iniciado', [doc('em_falta'), doc('em_falta')])).toBe(
      'nao_iniciado'
    );
  });

  it('em análise', () => {
    expect(verificationPhase('pendente', [doc('pendente'), doc('em_falta')])).toBe('pendente');
  });

  // Recusado ganha a em falta: é preciso saber que há algo para corrigir, não
  // apenas algo para acrescentar.
  it('uma recusa ganha a documentos por enviar', () => {
    expect(verificationPhase('pendente', [doc('recusado'), doc('em_falta')])).toBe('recusado');
  });

  it('o estado global recusado também conta', () => {
    expect(verificationPhase('recusado', [])).toBe('recusado');
  });
});

describe('texto por estado', () => {
  it('nada submetido diz o que fazer e quanto demora', () => {
    const c = verificationCopy({ status: 'nao_iniciado', docs: [], isEN: false });
    expect(c.heading).toBe('Falta verificar a sua conta');
    expect(c.body).toMatch(/submeta os documentos/i);
    expect(c.body).toMatch(/48 horas/);
    expect(c.action).toBe('Submeter documentos');
  });

  it('em análise não pede nada ao utilizador', () => {
    const c = verificationCopy({ status: 'pendente', docs: [doc('pendente')], isEN: false });
    expect(c.heading).toBe('Documentos em análise');
    expect(c.body).toMatch(/Recebemos os seus documentos/);
  });

  it('recusado manda corrigir apenas os assinalados', () => {
    const c = verificationCopy({ status: 'pendente', docs: [doc('recusado')], isEN: false });
    expect(c.heading).toBe('Há documentos por corrigir');
    expect(c.body).toMatch(/apenas esses/);
    expect(c.action).toBe('Corrigir documentos');
  });

  // O que o utilizador reportou: um anunciante não pode ser mandado arranjar
  // uma conta de anunciante.
  it('nunca manda o anunciante mudar de tipo de conta', () => {
    ['nao_iniciado', 'pendente', 'recusado'].forEach(status => {
      const c = verificationCopy({ status, docs: [], isEN: false });
      expect(`${c.heading} ${c.body}`).not.toMatch(/conta de Anunciante|Prestador de Serviços/i);
    });
  });
});

describe('inglês', () => {
  it('traduz os três estados', () => {
    expect(verificationCopy({ status: 'nao_iniciado', docs: [], isEN: true }).heading).toBe(
      'Your account needs verifying'
    );
    expect(verificationCopy({ status: 'pendente', docs: [], isEN: true }).heading).toBe(
      'Documents under review'
    );
    expect(verificationCopy({ status: 'recusado', docs: [], isEN: true }).heading).toBe(
      'Some documents need fixing'
    );
  });

  it('não deixa português no texto inglês', () => {
    ['nao_iniciado', 'pendente', 'recusado'].forEach(status => {
      const c = verificationCopy({ status, docs: [], isEN: true });
      expect(`${c.heading} ${c.body} ${c.action}`).not.toMatch(/documentos|análise|conta/i);
    });
  });
});

describe('robustez', () => {
  it('sem documentos nem estado, cai em análise em vez de rebentar', () => {
    expect(() => verificationCopy({ isEN: false })).not.toThrow();
    expect(verificationCopy({ isEN: false }).heading).toBe('Documentos em análise');
  });
});
