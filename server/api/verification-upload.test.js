/**
 * O envio de documentos, e sobretudo os erros que devolve.
 *
 * Escrito depois de nenhum anunciante conseguir submeter um único documento
 * durante dias. Foram dois problemas sobrepostos:
 *
 *   1. Um bodyParser.json global, sem `limit`, montado quando o CSP está
 *      ligado. O valor por omissão do body-parser são 100 KB, e ele corria
 *      antes do router da API — qualquer fotografia de um cartão de cidadão era
 *      recusada com 413 antes de o nosso código a ver.
 *
 *   2. Mesmo quando o erro era nosso, o ecrã dizia sempre a mesma coisa:
 *      "não foi possível enviar". Quem estava do outro lado não tinha como
 *      saber se o problema era o tamanho, o formato, ou a sessão.
 *
 * O primeiro é de configuração do servidor e não se apanha aqui. O segundo
 * apanha-se: estes testes fixam o código devolvido em cada recusa, que é o que
 * o ecrã usa para escolher a mensagem.
 */

process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'conta-de-teste';
process.env.R2_BUCKET = process.env.R2_BUCKET || 'balde-de-teste';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'chave-de-teste';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'segredo-de-teste';
process.env.VERIFICATION_USER_TYPES = 'anunciante';
process.env.RESEND_API_KEY = '';

jest.mock('../api-util/r2', () => ({
  isConfigured: () => true,
  putObject: jest.fn(async () => ({})),
  getSignedUrl: jest.fn(async () => 'https://exemplo/assinado'),
  deleteObject: jest.fn(async () => ({})),
}));

// verification.js desestrutura `getSdk` no topo do ficheiro, por isso guarda a
// sua própria referência ao carregar. Reatribuir sdkMod.getSdk depois disso não
// tem efeito nenhum — tem de ser substituído antes, com jest.mock.
let mockSessao = null;
let mockIntegration = null;

jest.mock('../api-util/sdk', () => ({
  getSdk: () => mockSessao,
  getIntegrationSdk: () => mockIntegration,
}));

const r2 = require('../api-util/r2');
const verification = require('./verification');

const utilizador = (userType = 'anunciante', docs = {}) => ({
  id: { uuid: 'u-1' },
  attributes: {
    email: 'anfitriao@exemplo.pt',
    profile: {
      displayName: 'Teste',
      publicData: { userType },
      privateData: { verification: { docs } },
      metadata: {},
    },
  },
});

const montar = user => {
  mockSessao = { currentUser: { show: async () => ({ data: { data: user } }) } };
  mockIntegration = {
    users: {
      show: async () => ({ data: { data: user } }),
      updateProfile: async () => ({ data: {} }),
      updatePermissions: async () => ({ data: {} }),
    },
  };
};

const enviar = async body => {
  const res = { codigo: 200, corpo: null };
  res.status = c => {
    res.codigo = c;
    return res;
  };
  res.json = b => {
    res.corpo = b;
    return res;
  };
  await verification.upload({ body }, res);
  return res;
};

const pngValido = tamanho =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(tamanho - 8, 0x42),
  ]).toString('base64');

const CORPO_BOM = {
  docKey: 'identificacao',
  contentType: 'image/png',
  filename: 'cartao.png',
  data: pngValido(1024),
};

describe('envio de documentos de verificação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    montar(utilizador());
  });

  describe('cada recusa tem o seu código', () => {
    it('formato não aceite', async () => {
      const r = await enviar({ ...CORPO_BOM, contentType: 'image/gif' });
      expect(r.codigo).toBe(400);
      expect(r.corpo.error).toBe('invalid-type');
      expect(r2.putObject).not.toHaveBeenCalled();
    });

    it('documento desconhecido', async () => {
      const r = await enviar({ ...CORPO_BOM, docKey: 'inventado' });
      expect(r.codigo).toBe(400);
      expect(r.corpo.error).toBe('invalid-doc');
    });

    it('ficheiro vazio', async () => {
      const r = await enviar({ ...CORPO_BOM, data: '' });
      expect(r.codigo).toBe(400);
      expect(r.corpo.error).toBe('missing-file');
    });

    it('acima do limite devolve 413, para o ecrã falar de tamanho', async () => {
      const r = await enviar({ ...CORPO_BOM, data: pngValido(9 * 1024 * 1024) });
      expect(r.codigo).toBe(413);
      expect(r.corpo.error).toBe('too-large');
      // O ficheiro grande nunca chega ao armazenamento.
      expect(r2.putObject).not.toHaveBeenCalled();
    });

    it('sem sessão', async () => {
      mockSessao = {
        currentUser: {
          show: async () => {
            throw new Error('sem sessão');
          },
        },
      };
      const r = await enviar(CORPO_BOM);
      expect(r.codigo).toBe(401);
      expect(r.corpo.error).toBe('not-authenticated');
    });

    it('conta que não submete documentos', async () => {
      montar(utilizador('visitante'));
      const r = await enviar(CORPO_BOM);
      expect(r.codigo).toBe(403);
      expect(r.corpo.error).toBe('not-an-anunciante');
    });

    it('documento já aprovado não é substituído por um clique perdido', async () => {
      montar(
        utilizador('anunciante', {
          identificacao: { key: 'k', status: 'aprovado', contentType: 'image/png' },
        })
      );
      const r = await enviar(CORPO_BOM);
      expect(r.codigo).toBe(409);
      expect(r.corpo.error).toBe('already-approved');
      expect(r2.putObject).not.toHaveBeenCalled();
    });
  });

  describe('envio válido', () => {
    it('guarda o ficheiro e devolve o estado ao ecrã', async () => {
      const r = await enviar(CORPO_BOM);

      expect(r.codigo).toBe(200);
      expect(r2.putObject).toHaveBeenCalledTimes(1);
      const [chave, corpo, tipo] = r2.putObject.mock.calls[0];
      expect(chave).toContain('identificacao');
      expect(Buffer.isBuffer(corpo)).toBe(true);
      expect(tipo).toBe('image/png');

      const doc = (r.corpo.docs || []).find(d => d.key === 'identificacao');
      expect(doc.status).toBe('pendente');
    });

    it('um ficheiro de vários MB passa — é o caso normal, não a excepção', async () => {
      // Uma fotografia de um cartão de cidadão anda por aqui. Era exactamente
      // isto que o limite de 100 KB do parser global recusava.
      const r = await enviar({ ...CORPO_BOM, data: pngValido(3 * 1024 * 1024) });
      expect(r.codigo).toBe(200);
      expect(r2.putObject).toHaveBeenCalledTimes(1);
    });

    it('apaga o ficheiro anterior ao substituir um documento', async () => {
      montar(
        utilizador('anunciante', {
          identificacao: { key: 'antigo/ficheiro.png', status: 'pendente' },
        })
      );
      await enviar(CORPO_BOM);
      // Sem isto ficavam documentos de identidade órfãos no balde.
      expect(r2.deleteObject).toHaveBeenCalledWith('antigo/ficheiro.png');
    });
  });
});
