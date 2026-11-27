import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders as render } from '../../util/testHelpers';
import { SeoAdminPageComponent } from './SeoAdminPage';

/**
 * O painel SEO: carrega o que está gravado, mostra a pré-visualização, e grava
 * as duas línguas da página escolhida.
 */

const resposta = (status, corpo) =>
  Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(corpo) });

describe('SeoAdminPage', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('mostra o aviso de acesso restrito a quem não é admin', async () => {
    global.fetch = jest.fn(() => resposta(403, { error: 'forbidden' }));
    render(<SeoAdminPageComponent scrollingDisabled={false} />);
    // A primeira montagem neste ficheiro é lenta: dá-se mais tempo do que o 1 s habitual.
    expect(
      await screen.findByText(/Esta página é restrita/, undefined, { timeout: 5000 })
    ).toBeInTheDocument();
  });

  it('parte do texto gravado, mostra-o na pré-visualização e grava a página', async () => {
    const gravadas = {
      '/': { noIndex: false, pt: { title: 'Título gravado da página inicial' }, en: {} },
    };
    const onGravado = jest.fn();
    global.fetch = jest.fn((url, opts) => {
      if (url === '/api/seo-admin') return resposta(200, { paginas: gravadas, armazenamento: 'r2' });
      if (url === '/api/seo-admin/pagina') {
        const { caminho, valores } = JSON.parse(opts.body);
        return resposta(200, { paginas: { ...gravadas, [caminho]: valores } });
      }
      return resposta(404, {});
    });

    render(<SeoAdminPageComponent scrollingDisabled={false} onGravado={onGravado} />);

    const titulo = await screen.findByLabelText('Título');
    expect(titulo.value).toBe('Título gravado da página inicial');
    expect(screen.getAllByText('Título gravado da página inicial').length).toBeGreaterThan(0);

    const gravar = screen.getByRole('button', { name: 'Gravar' });
    expect(gravar).toBeDisabled();

    fireEvent.change(titulo, { target: { value: 'Aluguer de espaços | Venue1Hub' } });
    expect(screen.getByText(/por gravar/)).toBeInTheDocument();
    fireEvent.click(gravar);

    await waitFor(() => expect(onGravado).toHaveBeenCalled());
    const pedido = global.fetch.mock.calls.find(([u]) => u === '/api/seo-admin/pagina');
    const corpo = JSON.parse(pedido[1].body);
    expect(corpo.caminho).toBe('/');
    expect(corpo.valores.pt.title).toBe('Aluguer de espaços | Venue1Hub');
    // A outra língua vai também, com a sugestão que estava em vigor.
    expect(corpo.valores.en.title).toBe('Venue hire for meetings and events | Venue1Hub');
    expect(await screen.findByText(/Gravado\. Já está em vigor/)).toBeInTheDocument();
  });

  it('avisa quando o armazenamento é só local', async () => {
    global.fetch = jest.fn(() => resposta(200, { paginas: {}, armazenamento: 'local' }));
    render(<SeoAdminPageComponent scrollingDisabled={false} />);
    expect(await screen.findByText(/perde-se no próximo deploy/)).toBeInTheDocument();
  });
});
