import React from 'react';
import { useForm, useFormState } from 'react-final-form';
import classNames from 'classnames';

import { useIntl } from '../../util/reactIntl';
import * as validators from '../../util/validators';

import { FieldTextInput, FieldSelect } from '../../components';

import css from './ProfessionField.module.css';

// ─── Profissão (dependente do "Segmento de negócio") ─────────────────────────
// A Console não suporta campos condicionais, por isso o user field `profissao`
// é um campo Metadata e este dropdown é renderizado por nós. As opções dependem
// do que o utilizador escolheu no campo `segmento_de_negocio`, e o valor
// escolhido é gravado em metadata depois do signup (ver auth.duck.js +
// /api/profile-metadata). Usado no SignupForm e no ConfirmSignupForm (SSO).

const stripAccents = value =>
  (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Matched against the normalized option value AND label of the Console field,
// so it keeps working regardless of the exact option values set in Console.
export const PROFESSIONS_BY_SEGMENT = [
  {
    match: ['corporativo'],
    options: [
      'Consultor(a)',
      'Advogado(a)',
      'Arquiteto(a)',
      'Contabilista',
      'Mediador(a)',
      'Gestor(a)/Empreendedor(a) (PME/Startup)',
      'Outra',
    ],
  },
  {
    match: ['saude', 'bem-estar', 'bem_estar'],
    options: [
      'Psicólogo(a)',
      'Terapeuta holístico(a)',
      'Massoterapeuta',
      'Fisioterapeuta',
      'Nutricionista',
      'Esteticista',
      'Coach de bem-estar',
      'Outra',
    ],
  },
  {
    match: ['criativo'],
    options: [
      'Fotógrafo(a)',
      'Produtor(a) de vídeo',
      'Podcaster / Criador(a) de conteúdo',
      'Designer',
      'Artista visual',
      'Marca / Agência criativa',
      'Outra',
    ],
  },
  {
    match: ['formacao', 'eventos'],
    options: [
      'Formador(a)',
      'Organizador(a) de eventos',
      'Palestrante / Coach',
      'Agência de eventos',
      'Comunidade / Associação',
      'Outra',
    ],
  },
  {
    match: ['particular', 'outro'],
    freeText: true,
  },
];

const SEGMENT_FIELD_KEY = 'segmento_de_negocio';
export const SEGMENT_FORM_NAME = `pub_${SEGMENT_FIELD_KEY}`;

export const findProfessionConfig = (segmentValue, userFields) => {
  if (!segmentValue) return null;
  // Also match against the Console option label so the mapping survives
  // whatever option values were generated in Console.
  const segmentField = userFields?.find(f => f.key === SEGMENT_FIELD_KEY);
  const enumOption = segmentField?.enumOptions?.find(o => `${o.option}` === `${segmentValue}`);
  const haystack = stripAccents(`${segmentValue} ${enumOption?.label || ''}`);
  return PROFESSIONS_BY_SEGMENT.find(entry => entry.match.some(m => haystack.includes(m))) || null;
};

/**
 * Dropdown/free-text da Profissão, sempre visível. Enquanto o segmento de
 * negócio não estiver escolhido aparece desativado, com um blur suave e uma
 * dica a explicar o porquê ("Regra: Profissão dependente").
 *
 * @component
 * @param {Object} props
 * @param {string} props.formId - The form id
 * @param {propTypes.listingFields} props.userFields - User field configs (Console)
 * @param {string} props.className - Class extending the root
 * @returns {JSX.Element}
 */
const ProfessionField = props => {
  const { formId, userFields, className } = props;
  const intl = useIntl();
  const form = useForm();
  const { values } = useFormState({ subscription: { values: true } });

  const segmentValue = values?.[SEGMENT_FORM_NAME];
  const professionConfig = findProfessionConfig(segmentValue, userFields);
  const professionOptions = professionConfig?.options || null;

  const isStaleProfession =
    !!values?.profissao &&
    (professionOptions
      ? // Dropdown segment: clear anything outside the visible list.
        !professionOptions.includes(values.profissao)
      : // Free-text segment: clear leftovers from a previous dropdown pick.
        !!professionConfig?.freeText &&
        PROFESSIONS_BY_SEGMENT.some(entry => entry.options?.includes(values.profissao)));
  if (isStaleProfession) {
    // Segment changed after a profession was picked — the old choice no
    // longer belongs to the visible list, so drop it.
    form.change('profissao', undefined);
  }

  const label = intl.formatMessage({ id: 'SignupForm.profissaoLabel' });

  // Sem segmento escolhido: campo visível mas bloqueado, com blur suave e
  // tooltip. Não é um Field final-form para a validação required não disparar
  // enquanto está bloqueado.
  if (!professionConfig) {
    const hint = intl.formatMessage({ id: 'SignupForm.profissaoLockedHint' });
    return (
      <div className={classNames(css.root, className)} title={hint}>
        <label className={css.lockedLabel} htmlFor={formId ? `${formId}.profissao` : 'profissao'}>
          {label}
        </label>
        <div className={css.lockedControl} aria-disabled="true">
          <select disabled className={css.lockedSelect} tabIndex={-1}>
            <option>
              {intl.formatMessage({ id: 'SignupForm.profissaoLockedPlaceholder' })}
            </option>
          </select>
        </div>
        <p className={css.lockedHint}>{hint}</p>
      </div>
    );
  }

  return professionOptions ? (
    <FieldSelect
      className={classNames(css.root, className)}
      id={formId ? `${formId}.profissao` : 'profissao'}
      name="profissao"
      label={label}
      validate={validators.required(intl.formatMessage({ id: 'SignupForm.profissaoRequired' }))}
    >
      <option disabled value="">
        {intl.formatMessage({ id: 'SignupForm.profissaoPlaceholder' })}
      </option>
      {professionOptions.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </FieldSelect>
  ) : (
    <FieldTextInput
      className={classNames(css.root, className)}
      type="text"
      id={formId ? `${formId}.profissao` : 'profissao'}
      name="profissao"
      label={label}
      placeholder={intl.formatMessage({ id: 'SignupForm.profissaoFreeTextPlaceholder' })}
      maxLength={70}
    />
  );
};

export default ProfessionField;
