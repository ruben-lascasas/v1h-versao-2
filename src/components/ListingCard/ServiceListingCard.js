import React from 'react';

import { useConfiguration } from '../../context/configurationContext';
import { useIntl } from '../../util/reactIntl';
import { createSlug } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';

import { NamedLink, ResponsiveImage } from '../../components';

import css from './ServiceListingCard.module.css';

const CATEGORY_KEY = 'categoria_de_servico';

// Resolves the option values stored in publicData.categoria_de_servico (an
// array, since the field is multi-enum) into their Console-configured labels,
// so the card keeps working if the categories list changes without a code
// deploy.
const resolveCategoryLabels = (categoryValues, listingFields) => {
  if (!Array.isArray(categoryValues) || categoryValues.length === 0) return [];
  const fieldConfig = listingFields?.find(f => f.key === CATEGORY_KEY);
  const enumOptions = fieldConfig?.enumOptions || [];
  return categoryValues.map(value => {
    const match = enumOptions.find(o => `${o.option}` === `${value}`);
    return match?.label || value;
  });
};

/**
 * Cartão de anúncio de Serviço (complemento) — visualmente distinto do
 * cartão de espaço: mostra a(s) categoria(s) do serviço em vez de avaliação,
 * e o nome do prestador em vez da localização.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.listing - Listing entity (tipo "servico")
 * @param {string} [props.renderSizes] - `sizes` para o ResponsiveImage
 * @returns {JSX.Element}
 */
const ServiceListingCard = props => {
  const { listing, renderSizes } = props;
  const config = useConfiguration();
  const intl = useIntl();

  const id = listing?.id?.uuid;
  const { title = '', price, publicData } = listing?.attributes || {};
  const slug = createSlug(title);
  const authorName = listing?.author?.attributes?.profile?.displayName;

  const firstImage = listing?.images?.[0] || null;
  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } =
    config.layout.listingImage;
  const variants = firstImage?.attributes?.variants
    ? Object.keys(firstImage.attributes.variants).filter(k => k.startsWith(variantPrefix))
    : [];

  const categoryLabels = resolveCategoryLabels(
    publicData?.[CATEGORY_KEY],
    config.listing.listingFields
  );

  const formattedPrice =
    price && price.currency === config.currency ? formatMoney(intl, price) : null;
  const unitType = publicData?.unitType;
  const perUnitLabel =
    unitType === 'hour'
      ? intl.formatMessage({ id: 'ListingCard.perHour' })
      : unitType === 'day'
      ? intl.formatMessage({ id: 'ListingCard.perDay' })
      : null;

  return (
    <NamedLink className={css.root} name="ListingPage" params={{ id, slug }}>
      <div className={css.imageWrapper}>
        {firstImage ? (
          <ResponsiveImage
            rootClassName={css.image}
            alt={title}
            image={firstImage}
            variants={variants}
            sizes={renderSizes || '(max-width: 767px) 50vw, 220px'}
          />
        ) : (
          <div className={css.imagePlaceholder} />
        )}
        {categoryLabels.length > 0 ? (
          <div className={css.categoryBadge}>
            <span>{categoryLabels[0]}</span>
            {categoryLabels.length > 1 ? (
              <span className={css.categoryBadgeMore}>+{categoryLabels.length - 1}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={css.info}>
        <div className={css.title}>{title}</div>

        {authorName ? (
          <div className={css.provider}>
            <svg
              className={css.providerIcon}
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4.5 20c1.3-3.2 4.1-5 7.5-5s6.2 1.8 7.5 5" />
            </svg>
            {authorName}
          </div>
        ) : null}

        {formattedPrice ? (
          <div className={css.priceRow}>
            <span className={css.price}>{formattedPrice}</span>
            {perUnitLabel ? <span className={css.perUnit}>{perUnitLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </NamedLink>
  );
};

export default ServiceListingCard;
