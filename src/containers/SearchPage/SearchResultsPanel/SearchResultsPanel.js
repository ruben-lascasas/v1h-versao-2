import React from 'react';
import classNames from 'classnames';

import { propTypes } from '../../../util/types';
import { ListingCard, PaginationLinks } from '../../../components';

import css from './SearchResultsPanel.module.css';

/**
 * SearchResultsPanel component
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {Array<propTypes.listing>} props.listings - The listings
 * @param {propTypes.pagination} props.pagination - The pagination
 * @param {Object} props.search - The search
 * @param {Function} props.setActiveListing - The function to handle the active listing
 * @param {boolean} [props.isMapVariant] - Whether the map variant is enabled
 * @returns {JSX.Element}
 */
const SearchResultsPanel = props => {
  const {
    className,
    rootClassName,
    listings = [],
    pagination,
    search,
    setActiveListing,
    isMapVariant = true,
    listingTypeParam,
    intl,
  } = props;
  const classes = classNames(rootClassName || css.root, className);
  const pageName = listingTypeParam ? 'SearchPageWithListingType' : 'SearchPage';

  const paginationLinks =
    pagination && pagination.totalPages > 1 ? (
      <PaginationLinks
        className={css.pagination}
        pageName={pageName}
        pagePathParams={{ listingType: listingTypeParam }}
        pageSearchParams={search}
        pagination={pagination}
        aria-label={intl.formatMessage({ id: 'SearchResultsPanel.screenreader.pagination' })}
      />
    ) : null;

  // "A mostrar 1-24 de 28" — counts are computed from the current pagination
  // meta returned by the API/duck. Hidden when there is nothing or only one
  // result, since it would be redundant.
  const showingRange = (() => {
    if (!pagination || !pagination.totalItems || pagination.totalItems < 1) return null;
    const page = pagination.page || 1;
    const perPage = pagination.perPage || listings.length || 1;
    const total = pagination.totalItems;
    const start = (page - 1) * perPage + 1;
    const end = Math.min(start + (listings.length || perPage) - 1, total);
    return { start, end, total };
  })();

  const cardRenderSizes = isMapVariant => {
    if (isMapVariant) {
      // Panel width relative to the viewport
      const panelMediumWidth = 50;
      const panelLargeWidth = 62.5;
      return [
        '(max-width: 767px) 100vw',
        `(max-width: 1023px) ${panelMediumWidth}vw`,
        `(max-width: 1920px) ${panelLargeWidth / 2}vw`,
        `${panelLargeWidth / 3}vw`,
      ].join(', ');
    } else {
      // Panel width relative to the viewport
      const panelMediumWidth = 50;
      const panelLargeWidth = 62.5;
      return [
        '(max-width: 549px) 100vw',
        '(max-width: 767px) 50vw',
        `(max-width: 1439px) 26vw`,
        `(max-width: 1920px) 18vw`,
        `14vw`,
      ].join(', ');
    }
  };

  return (
    <div className={classes}>
      <ul className={isMapVariant ? css.listingCardsMapVariant : css.listingCards}>
        {listings.map(l => (
          <li key={l.id.uuid} className={css.resultItem}>
            <ListingCard
              className={css.listingCard}
              listing={l}
              renderSizes={cardRenderSizes(isMapVariant)}
              setActiveListing={setActiveListing}
            />
          </li>
        ))}
        {props.children}
      </ul>
      {showingRange ? (
        <p className={css.showingRange}>
          {intl.formatMessage(
            { id: 'SearchResultsPanel.showingRange' },
            showingRange
          )}
        </p>
      ) : null}
      {paginationLinks}
    </div>
  );
};

export default SearchResultsPanel;
