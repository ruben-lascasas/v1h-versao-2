import React from 'react';
import { FormattedMessage } from '../../util/reactIntl';
import { Heading, H2, Reviews } from '../../components';

import css from './ListingPage.module.css';

const SectionReviews = props => {
  const { reviews, fetchReviewsError, isOwnListing } = props;

  return (
    <section className={css.sectionReviews}>
      <Heading as="h2" rootClassName={css.sectionHeadingWithExtraMargin}>
        <FormattedMessage id="ListingPage.reviewsTitle" values={{ count: reviews.length }} />
      </Heading>
      {reviews.length > 0 ? (
        <p className={css.reviewsCount}>
          <FormattedMessage
            id="ListingPage.reviewsCount"
            values={{ count: reviews.length }}
          />
        </p>
      ) : null}
      {fetchReviewsError ? (
        <H2 className={css.errorText}>
          <FormattedMessage id="ListingPage.reviewsError" />
        </H2>
      ) : null}
      {!fetchReviewsError && reviews.length === 0 ? (
        <p className={css.noReviewsText}>
          <FormattedMessage
            id={isOwnListing ? 'ListingPage.noReviewsOwn' : 'ListingPage.noReviews'}
          />
        </p>
      ) : null}
      <Reviews reviews={reviews} />
    </section>
  );
};

export default SectionReviews;
