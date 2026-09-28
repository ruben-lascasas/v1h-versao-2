import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render } from '../../util/testHelpers';

import { CareersPageComponent } from './CareersPage';

/**
 * As vagas são de um serviço externo, e o endereço desse serviço já mudou uma
 * vez (do careers-page.com para o BusinessHRM). Quando voltar a mudar, há dois
 * sítios a acertar — o iframe e a ligação de recurso por baixo dele — e falhar
 * um deles deixa metade da página a apontar para um sítio que já não existe.
 *
 * Nota: o endereço também tem de estar autorizado em server/csp.js (frameSrc).
 * Isso é do servidor e não se vê daqui; está lá o comentário a lembrar.
 */
describe('CareersPage', () => {
  it('mostra o título e a introdução', () => {
    const { getByText } = render(<CareersPageComponent scrollingDisabled={false} />);
    expect(getByText('Trabalhar connosco')).toBeInTheDocument();
  });

  it('o iframe aponta para o serviço de recrutamento em uso', () => {
    const { container } = render(<CareersPageComponent scrollingDisabled={false} />);
    const iframe = container.querySelector('iframe');

    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe(
      'https://ehub.businesshrm.com/careers/619e01d883923f970938d80ef150f9a9'
    );
  });

  // Se o iframe for bloqueado — extensão do browser, CSP, serviço em baixo —
  // esta ligação é a única saída de quem se quer candidatar.
  it('a ligação de recurso vai para o mesmo sítio que o iframe', () => {
    const { container } = render(<CareersPageComponent scrollingDisabled={false} />);
    const iframe = container.querySelector('iframe');
    const link = container.querySelector('a[target="_blank"]');

    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(iframe.getAttribute('src'));
  });
});
