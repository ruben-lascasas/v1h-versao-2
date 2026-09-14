import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { TermsOfServicePageComponent } from './TermsOfServicePage';

const { waitFor } = testingLibrary;

/**
 * Ver a nota em PrivacyPolicyPage.test.js: os Termos deixaram de depender de um
 * asset da Console e passaram a ser o documento jurídico oficial, incluído no
 * pacote da aplicação.
 *
 * Isto importa mais do que parece: é este mesmo conteúdo que aparece no modal
 * de aceitação do registo. Antes, uma falha a ir buscar o asset podia deixar
 * alguém a aceitar uma caixa vazia.
 */
describe('TermsOfServicePage', () => {
  it('mostra os Termos mesmo quando um asset da Console falha', async () => {
    const e = new Error('TermsOfServicePage failed');
    e.type = 'error';
    e.name = 'Test';

    const { getByText } = render(
      <TermsOfServicePageComponent pageAssetsData={null} inProgress={false} error={e} />
    );

    await waitFor(() => {
      expect(getByText('Termos de Serviço')).toBeInTheDocument();
    });
  });
});
