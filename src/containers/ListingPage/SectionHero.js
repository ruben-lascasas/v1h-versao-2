import React, { useEffect, useState } from 'react';

import { FormattedMessage } from '../../util/reactIntl';
import { ResponsiveImage, Modal, NamedLink } from '../../components';
import FavoriteButton from '../../components/FavoriteButton/FavoriteButton';
import { getCategoryIcon, getCategoryLabel } from '../../components/CategoryIcons/CategoryIcons';
import { useConfiguration } from '../../context/configurationContext';
import { useLocale } from '../../context/localeContext';
import { pickCategoryFields } from '../../util/fieldHelpers';

import ImageCarousel from './ImageCarousel/ImageCarousel';

import css from './ListingPage.module.css';

const VIEW_PHOTOS_BUTTON_ID = 'viewPhotosButton';

const SectionHero = props => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    title,
    listing,
    isOwnListing,
    handleViewPhotosClick,
    imageCarouselOpen,
    onImageCarouselClose,
    onManageDisableScrolling,
    actionBar,
  } = props;

  const config = useConfiguration();
  const { locale } = useLocale();
  const hasImages = listing.images && listing.images.length > 0;
  const firstImage = hasImages ? listing.images[0] : null;
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter(k => k.startsWith('scaled'))
    : [];

  const publicData = listing?.attributes?.publicData || {};
  const { key: categoryPrefix, categories: listingCategoriesConfig } =
    config.categoryConfiguration || {};
  const categoriesObj = categoryPrefix && listingCategoriesConfig
    ? pickCategoryFields(publicData, categoryPrefix, 1, listingCategoriesConfig)
    : {};
  const topCategoryId = Object.values(categoriesObj)[0];
  const topCategoryConfig = topCategoryId
    ? listingCategoriesConfig.find(c => c.id === topCategoryId)
    : null;
  const topCategoryLabel = topCategoryId
    ? getCategoryLabel(topCategoryId, topCategoryConfig?.name, locale)
    : null;

  const viewPhotosButton = hasImages ? (
    <button id={VIEW_PHOTOS_BUTTON_ID} className={css.viewPhotos} onClick={handleViewPhotosClick}>
      <FormattedMessage
        id="ListingPage.viewImagesButton"
        values={{ count: listing.images.length }}
      />
    </button>
  ) : null;

  return (
    <section className={css.sectionHero} data-testid="hero">
      <div className={css.imageWrapperForSectionHero} onClick={handleViewPhotosClick}>
        {mounted && listing.id && isOwnListing ? (
          <div onClick={e => e.stopPropagation()} className={css.actionBarContainerForHeroLayout}>
            {actionBar}
          </div>
        ) : null}
        {mounted && listing.id ? (
          <div onClick={e => e.stopPropagation()} className={css.favoriteButtonContainer}>
            <FavoriteButton
              listingId={listing.id.uuid}
              initialCount={listing?.attributes?.publicData?.favoritesCount}
              readOnly={isOwnListing}
              className={css.favoriteButtonLarge}
            />
          </div>
        ) : null}
        {topCategoryId && topCategoryLabel ? (
          <span
            className={css.listingCategoryBadgeWrapper}
            onClick={e => e.stopPropagation()}
          >
            <NamedLink
              name="SearchPage"
              to={{ search: `?pub_categoryLevel1=${encodeURIComponent(topCategoryId)}` }}
              className={css.listingCategoryBadge}
            >
              <span className={css.listingCategoryBadgeIcon}>
                {getCategoryIcon(topCategoryId, topCategoryConfig?.name)}
              </span>
              <span className={css.listingCategoryBadgeLabel}>{topCategoryLabel}</span>
            </NamedLink>
          </span>
        ) : null}

        <ResponsiveImage
          rootClassName={css.rootForImage}
          alt={title}
          image={firstImage}
          variants={variants}
        />
        {viewPhotosButton}
      </div>
      <Modal
        id="ListingPage.imageCarousel"
        scrollLayerClassName={css.carouselModalScrollLayer}
        containerClassName={css.carouselModalContainer}
        lightCloseButton
        isOpen={imageCarouselOpen}
        onClose={onImageCarouselClose}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
        focusElementId={VIEW_PHOTOS_BUTTON_ID}
      >
        <ImageCarousel
          images={listing.images}
          imageVariants={['scaled-small', 'scaled-medium', 'scaled-large', 'scaled-1600', 'scaled-xlarge']}
        />
      </Modal>
    </section>
  );
};

export default SectionHero;
