import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { PrivacyPolicyPageComponent } from './PrivacyPolicyPage';

const { waitFor } = testingLibrary;

/**
 * Este teste verificava que a página mostrava uma FallbackPage quando o texto
 * não vinha da Console. Deixou de haver esse modo de falha: a Política de
 * Privacidade passou a ser o documento jurídico oficial, que vive no próprio
 * pacote da aplicação e não depende de nenhuma chamada de rede.
 *
 * O que se verifica agora é o que substituiu essa garantia — que a página
 * aparece mesmo quando um erro de asset lhe é passado, porque já não depende
 * dele. Antes, esse erro deixava o visitante sem política nenhuma.
 */
describe('PrivacyPolicyPage', () => {
  it('mostra a política mesmo quando um asset da Console falha', async () => {
    const e = new Error('PrivacyPolicyPage failed');
    e.type = 'error';
    e.name = 'Test';

    const { getByText } = render(
      <PrivacyPolicyPageComponent pageAssetsData={null} inProgress={false} error={e} />
    );

    await waitFor(() => {
      expect(getByText('Política de Privacidade')).toBeInTheDocument();
    });
  });
});
