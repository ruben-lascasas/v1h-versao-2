import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { LegalCentrePageComponent } from './LegalCentrePage';

const { waitFor } = testingLibrary;

/**
 * Teste de montagem. Ver a nota em LegalDocumentsPage.test.js: uma destas
 * páginas foi para produção em branco porque nada a montava em teste.
 */
describe('LegalCentrePage', () => {
  it('monta e lista as categorias', async () => {
    const { getByText } = render(<LegalCentrePageComponent scrollingDisabled={false} />);
    await waitFor(() => {
      expect(getByText('Centro Jurídico e de Confiança')).toBeInTheDocument();
      expect(getByText('A plataforma')).toBeInTheDocument();
      expect(getByText('Reclamações')).toBeInTheDocument();
    });
  });

  // A identificação do operador é exigência legal e sai da mesma fonte que o
  // rodapé e as facturas.
  it('identifica a entidade operadora', async () => {
    const { getByText } = render(<LegalCentrePageComponent scrollingDisabled={false} />);
    await waitFor(() => {
      expect(getByText('EdgeHub OÜ')).toBeInTheDocument();
    });
  });
});
