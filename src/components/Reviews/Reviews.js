import React, { useState } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import { useIntl } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { createSlug } from '../../util/urlHelpers';

import { Avatar, UserDisplayName } from '../../components';
import IconReviewStar from '../IconReviewStar/IconReviewStar';
import TranslateButton from '../TranslateButton/TranslateButton';

import css from './Reviews.module.css';

const Review = props => {
  const { review, intl } = props;
  const [translated, setTranslated] = useState(null);
  const originalContent = review.attributes.content;
  const shownContent = translated || originalContent;
  const isTranslatable =
    originalContent && originalContent.trim() && originalContent.trim() !== '-';

  const date = review.attributes.createdAt;
  const dateString = intl.formatDate(date, { month: 'long', year: 'numeric' });
  const rating = review.attributes.rating;

  const listing = review.listing;
  const listingId = listing?.id?.uuid;
  const listingTitle = listing?.attributes?.title;
  const listingSlug = listingTitle ? createSlug(listingTitle) : listingId;
  const imageVariants = listing?.images?.[0]?.attributes?.variants || {};
  const listingImage =
    imageVariants['listing-card']?.url ||
    imageVariants['listing-card-2x']?.url ||
    imageVariants['square-small']?.url ||
    imageVariants['square-small2x']?.url ||
    Object.values(imageVariants)[0]?.url ||
    null;
  const listingUrl = listingId ? `/l/${listingSlug}/${listingId}` : null;

  return (
    <div className={css.review}>
      <Avatar className={css.avatar} user={review.author} />
      <div className={css.reviewBody}>
        <div className={css.reviewHeader}>
          <span className={css.reviewAuthor}>
            <UserDisplayName user={review.author} intl={intl} />
          </span>
          <span className={css.reviewMeta}>
            {dateString}
            <span className={css.separator}>•</span>
            <span className={css.inlineRating}>
              <IconReviewStar className={css.reviewRatingStar} isFilled={true} />
              {rating != null ? rating.toFixed(1) : null}
            </span>
          </span>
        </div>
        {isTranslatable ? (
          <>
            <p className={css.reviewContent}>{shownContent}</p>
            <TranslateButton
              text={originalContent}
              isShowingOriginal={!translated}
              onResult={setTranslated}
            />
          </>
        ) : review.attributes.content === '-' ? (
          <p className={css.reviewContentEmpty}>{intl.formatMessage({ id: 'Reviews.noComment' })}</p>
        ) : null}
      </div>
      {listingUrl && listingImage ? (
        <Link to={listingUrl} className={css.listingHeader}>
          <img src={listingImage} alt={listingTitle} className={css.listingImage} />
        </Link>
      ) : null}
    </div>
  );
};

const Reviews = props => {
  const intl = useIntl();
  const { className, rootClassName, reviews = [] } = props;
  const classes = classNames(rootClassName || css.root, className);

  return reviews.length ? (
    <ul className={classes}>
      {reviews.map(r => {
        return (
          <li key={`Review_${r.id.uuid}`} className={css.reviewItem}>
            <Review review={r} intl={intl} />
          </li>
        );
      })}
    </ul>
  ) : null;
};

export default Reviews;
