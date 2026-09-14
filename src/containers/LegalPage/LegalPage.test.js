import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { LegalPageComponent } from './LegalPage';

const { waitFor } = testingLibrary;

/** Teste de montagem — ver a nota em LegalDocumentsPage.test.js. */
describe('LegalPage', () => {
  it('monta um documento e mostra o título e a versão', async () => {
    const { getByText } = render(
      <LegalPageComponent scrollingDisabled={false} params={{ slug: 'aviso-legal' }} />
    );
    await waitFor(() => {
      expect(getByText(/IDENTIFICAÇÃO DO OPERADOR/i)).toBeInTheDocument();
    });
  });

  // Um slug inventado tem de dar 404 a sério: se um motor de busca indexar
  // /legal/qualquer-coisa a 200, fica lá.
  it('um slug desconhecido não finge que existe', async () => {
    const { queryByText, container } = render(
      <LegalPageComponent scrollingDisabled={false} params={{ slug: 'nao-existe' }} />
    );
    await waitFor(() => {
      expect(container.querySelector('#page')).toBeInTheDocument();
    });
    expect(queryByText(/IDENTIFICAÇÃO DO OPERADOR/i)).not.toBeInTheDocument();
  });
});
