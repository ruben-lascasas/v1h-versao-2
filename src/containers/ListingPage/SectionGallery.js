import React, { useMemo } from 'react';
import ListingImageGallery from './ListingImageGallery/ListingImageGallery';

import css from './ListingPage.module.css';

// Stable across renders so child memoisation works. Without `useMemo` the
// child gallery sees a new array reference each parent re-render and resets
// its internal slide index.
const SectionGallery = props => {
  const { listing, variantPrefix, onSlideChange } = props;
  const images = listing.images;
  const youtubeUrl = listing?.attributes?.publicData?.youtubeUrl || null;
  const imageVariants = useMemo(
    () => ['scaled-small', 'scaled-medium', 'scaled-large', 'scaled-xlarge'],
    []
  );
  const thumbnailVariants = useMemo(
    () => [variantPrefix, `${variantPrefix}-2x`, `${variantPrefix}-4x`],
    [variantPrefix]
  );
  return (
    <section className={css.productGallery} data-testid="carousel">
      <ListingImageGallery
        images={images}
        imageVariants={imageVariants}
        thumbnailVariants={thumbnailVariants}
        youtubeUrl={youtubeUrl}
        onSlideChange={onSlideChange}
      />
    </section>
  );
};

export default SectionGallery;
