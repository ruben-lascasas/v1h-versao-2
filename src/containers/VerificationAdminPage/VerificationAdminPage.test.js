import { filtrarUtilizadores } from './VerificationAdminPage';

const pessoa = (over = {}) => ({
  userId: 'u1',
  displayName: 'Lídia Fernandes',
  email: 'lidia@exemplo.pt',
  status: 'pendente',
  lastUploadAt: '2026-08-10T09:00:00.000Z',
  docs: [{ key: 'id', status: 'pendente' }],
  ...over,
});

describe('filtros do painel de verificações', () => {
  const nenhum = { estado: 'todos', de: '', ate: '', procura: '' };

  it('mostra tudo quando nada está filtrado', () => {
    const users = [pessoa(), pessoa({ userId: 'u2', status: 'aprovado' })];
    expect(filtrarUtilizadores(users, nenhum)).toHaveLength(2);
  });

  it('"por rever" olha para os documentos, não para o estado da conta', () => {
    const users = [
      // Conta já aprovada, mas com um documento novo à espera de decisão:
      // tem de aparecer, senão o trabalho fica esquecido.
      pessoa({ userId: 'aprovado-com-doc-novo', status: 'aprovado', docs: [{ status: 'pendente' }] }),
      pessoa({ userId: 'sem-nada', status: 'pendente', docs: [{ status: 'aprovado' }] }),
    ];
    const r = filtrarUtilizadores(users, { ...nenhum, estado: 'por_rever' });
    expect(r.map(u => u.userId)).toEqual(['aprovado-com-doc-novo']);
  });

  it('filtra pelo estado da conta', () => {
    const users = [pessoa({ status: 'aprovado' }), pessoa({ userId: 'u2', status: 'recusado' })];
    expect(filtrarUtilizadores(users, { ...nenhum, estado: 'recusado' })).toHaveLength(1);
  });

  it('inclui o próprio dia escolhido em "até"', () => {
    // O envio foi às 21:30 de dia 10. Escolher "até 10/08" tem de o apanhar —
    // comparar contra a meia-noite de dia 10 deixava-o de fora.
    const users = [pessoa({ lastUploadAt: '2026-08-10T21:30:00.000Z' })];
    expect(filtrarUtilizadores(users, { ...nenhum, ate: '2026-08-10' })).toHaveLength(1);
  });

  it('inclui o próprio dia escolhido em "de"', () => {
    const users = [pessoa({ lastUploadAt: '2026-08-10T00:30:00.000Z' })];
    expect(filtrarUtilizadores(users, { ...nenhum, de: '2026-08-10' })).toHaveLength(1);
  });

  it('exclui o que está fora do intervalo', () => {
    const users = [
      pessoa({ userId: 'antes', lastUploadAt: '2026-08-01T10:00:00.000Z' }),
      pessoa({ userId: 'dentro', lastUploadAt: '2026-08-10T10:00:00.000Z' }),
      pessoa({ userId: 'depois', lastUploadAt: '2026-08-20T10:00:00.000Z' }),
    ];
    const r = filtrarUtilizadores(users, { ...nenhum, de: '2026-08-05', ate: '2026-08-15' });
    expect(r.map(u => u.userId)).toEqual(['dentro']);
  });

  it('quem não tem data fica de fora quando há filtro de datas', () => {
    const users = [pessoa({ lastUploadAt: null })];
    expect(filtrarUtilizadores(users, { ...nenhum, de: '2026-08-01' })).toHaveLength(0);
    // ...mas continua visível sem filtro de datas
    expect(filtrarUtilizadores(users, nenhum)).toHaveLength(1);
  });

  it('procura por nome e por email, sem distinguir maiúsculas', () => {
    const users = [
      pessoa({ userId: 'lidia' }),
      pessoa({ userId: 'joao', displayName: 'João Sousa', email: 'joao@outro.pt' }),
    ];
    expect(filtrarUtilizadores(users, { ...nenhum, procura: 'LÍDIA' })[0].userId).toBe('lidia');
    expect(filtrarUtilizadores(users, { ...nenhum, procura: 'outro.pt' })[0].userId).toBe('joao');
    expect(filtrarUtilizadores(users, { ...nenhum, procura: 'ninguém' })).toHaveLength(0);
  });

  it('combina estado, datas e procura', () => {
    const users = [
      pessoa({ userId: 'certo', docs: [{ status: 'pendente' }], lastUploadAt: '2026-08-10T10:00:00.000Z' }),
      pessoa({ userId: 'data-errada', docs: [{ status: 'pendente' }], lastUploadAt: '2026-01-01T10:00:00.000Z' }),
      pessoa({ userId: 'sem-pendentes', docs: [{ status: 'aprovado' }], lastUploadAt: '2026-08-10T10:00:00.000Z' }),
    ];
    const r = filtrarUtilizadores(users, {
      estado: 'por_rever',
      de: '2026-08-01',
      ate: '2026-08-31',
      procura: 'lidia',
    });
    expect(r.map(u => u.userId)).toEqual(['certo']);
  });

  it('aguenta uma lista em falta', () => {
    expect(filtrarUtilizadores(undefined, nenhum)).toEqual([]);
  });
});
