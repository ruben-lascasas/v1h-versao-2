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

// Sentinel option present in every dropdown segment. Picking it reveals a
// free-text "Qual?" field (see mockup de UX) instead of saving the literal
// string "Outra" with no further detail.
const OTHER_OPTION = 'Outra';
export const PROFESSAO_OUTRA_FIELD = 'profissaoOutra';

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
 * Resolves the value that should actually be persisted to `metadata.profissao`.
 * When the user picked the "Outra" option in a dropdown segment, the specific
 * text they typed in the follow-up field is saved instead of the literal
 * "Outra" — otherwise that choice carries no information at all.
 *
 * @param {Object} values - Current form values (SignupForm/ConfirmSignupForm)
 * @returns {string|undefined}
 */
export const resolveProfessionValue = values => {
  const raw = values?.profissao;
  if (raw === OTHER_OPTION) {
    const detail = values?.[PROFESSAO_OUTRA_FIELD];
    return detail?.trim() || undefined;
  }
  return raw?.trim() || undefined;
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
  const isOtherSelected = values?.profissao === OTHER_OPTION;
  if (!isOtherSelected && values?.[PROFESSAO_OUTRA_FIELD]) {
    // Left the "Outra" option (or the whole segment) — drop the leftover detail.
    form.change(PROFESSAO_OUTRA_FIELD, undefined);
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
    <>
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
      {isOtherSelected ? (
        <FieldTextInput
          className={classNames(css.root, className)}
          type="text"
          id={formId ? `${formId}.${PROFESSAO_OUTRA_FIELD}` : PROFESSAO_OUTRA_FIELD}
          name={PROFESSAO_OUTRA_FIELD}
          label={intl.formatMessage({ id: 'SignupForm.profissaoOutraLabel' })}
          placeholder={intl.formatMessage({ id: 'SignupForm.profissaoOutraPlaceholder' })}
          maxLength={50}
          validate={validators.composeValidators(
            validators.required(intl.formatMessage({ id: 'SignupForm.profissaoOutraRequired' })),
            validators.minLength(intl.formatMessage({ id: 'SignupForm.profissaoOutraInvalid' }), 2),
            validators.maxLength(intl.formatMessage({ id: 'SignupForm.profissaoOutraInvalid' }), 50)
          )}
        />
      ) : null}
    </>
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
