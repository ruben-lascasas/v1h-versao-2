import React, { useRef, useState } from 'react';
import { ARRAY_ERROR } from 'final-form';
import { Form as FinalForm, Field } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import { FieldArray } from 'react-final-form-arrays';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';

// Import configs and util modules
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import { propTypes } from '../../../../util/types';
import { nonEmptyArray, composeValidators } from '../../../../util/validators';
import { isUploadImageOverLimitError } from '../../../../util/errors';

// Import shared components
import { Button, Form, AspectRatioWrapper, FieldTextInput } from '../../../../components';
import { extractYouTubeVideoId } from '../../../../util/youtube';

// Import modules from this directory
import ListingImage from './ListingImage';
import css from './EditListingPhotosForm.module.css';

const ACCEPT_IMAGES = 'image/*';
const MAX_PHOTOS = 25;

const ImageUploadError = props => {
  return props.uploadOverLimit ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.imageUploadFailed.uploadOverLimit" />
    </p>
  ) : props.uploadImageError ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.imageUploadFailed.uploadFailed" />
    </p>
  ) : null;
};

// NOTE: PublishListingError and ShowListingsError are here since Photos panel is the last visible panel
// before creating a new listing. If that order is changed, these should be changed too.
// Create and show listing errors are shown above submit button
const PublishListingError = props => {
  return props.error ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.publishListingFailed" />
    </p>
  ) : null;
};

const ShowListingsError = props => {
  return props.error ? (
    <p className={css.error}>
      <FormattedMessage id="EditListingPhotosForm.showListingFailed" />
    </p>
  ) : null;
};

// Field component that uses file-input to allow user to select images.
export const FieldAddImage = props => {
  const { formApi, onImageUploadHandler, aspectWidth = 1, aspectHeight = 1, ...rest } = props;
  return (
    <Field form={null} {...rest}>
      {fieldprops => {
        const { accept, input, label, disabled: fieldDisabled } = fieldprops;
        const { name, type } = input;
        const onChange = e => {
          const file = e.target.files[0];
          formApi.change(`addImage`, file);
          formApi.blur(`addImage`);
          onImageUploadHandler(file);
        };
        const inputProps = { accept, id: name, name, onChange, type };
        return (
          <div className={css.addImageWrapper}>
            <AspectRatioWrapper width={aspectWidth} height={aspectHeight}>
              {fieldDisabled ? null : <input {...inputProps} className={css.addImageInput} />}
              <label htmlFor={name} className={css.addImage}>
                {label}
              </label>
            </AspectRatioWrapper>
          </div>
        );
      }}
    </Field>
  );
};

// Thin wrapper around the FieldArray render so we can use hooks for the
// pointer-events drag-to-reorder UX (mouse + touch, no external deps).
// Each thumbnail listens for onPointerDown; while a drag is active we resolve
// the element under the pointer with `elementFromPoint` and call `fields.move`
// when the user releases over a different thumbnail.
const SortableImageList = ({
  fields,
  intl,
  onRemoveImage,
  aspectWidth,
  aspectHeight,
  variantPrefix,
}) => {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  // Live pointer offset from the drag start — used to translate the dragged
  // thumbnail so it visually follows the cursor instead of staying in place.
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  // Pointer-down position; used to wait for ~5px of movement before flagging
  // the gesture as a drag, so quick taps on the remove X don't get hijacked.
  const downRef = useRef(null);

  const handlePointerDown = (idx, e) => {
    // Don't start a drag if the user pressed on a button (remove X) or a link.
    if (e.target.closest('button, a, input, label')) return;
    downRef.current = { idx, x: e.clientX, y: e.clientY, active: false };
  };

  const handlePointerMove = e => {
    if (!downRef.current) return;
    const { idx, x, y, active } = downRef.current;
    if (!active) {
      const dx = Math.abs(e.clientX - x);
      const dy = Math.abs(e.clientY - y);
      if (Math.max(dx, dy) < 6) return;
      downRef.current.active = true;
      setDragIdx(idx);
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch (_) {}
    }
    e.preventDefault();
    setDelta({ x: e.clientX - x, y: e.clientY - y });
    const el = typeof document !== 'undefined'
      ? document.elementFromPoint(e.clientX, e.clientY)
      : null;
    const thumb = el?.closest('[data-thumb-idx]');
    if (thumb) {
      const n = Number(thumb.getAttribute('data-thumb-idx'));
      if (!Number.isNaN(n) && n !== overIdx) setOverIdx(n);
    }
  };

  const handlePointerEnd = () => {
    const d = downRef.current;
    if (d && d.active && dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      fields.move(dragIdx, overIdx);
    }
    downRef.current = null;
    setDragIdx(null);
    setOverIdx(null);
    setDelta({ x: 0, y: 0 });
  };

  return fields.map((name, index) => {
    const isDragging = dragIdx === index;
    const isOver = overIdx === index && dragIdx !== index;
    // Keep the dragged tile glued to the cursor while the gesture is active.
    // `pointer-events: none` makes elementFromPoint skip the moving tile so we
    // can detect the slot underneath the cursor; pointer capture (set on
    // pointerdown's parent) keeps the move/up events flowing regardless.
    const dragStyle = isDragging
      ? {
          touchAction: 'none',
          transform: `translate(${delta.x}px, ${delta.y}px) scale(1.03)`,
          zIndex: 10,
          boxShadow: '0 12px 28px rgba(0, 0, 0, 0.25)',
          pointerEvents: 'none',
        }
      : { touchAction: 'none' };
    return (
      <div
        key={name}
        data-thumb-idx={index}
        className={classNames(css.sortableSlot, {
          [css.dragging]: isDragging,
          [css.dragOver]: isOver,
        })}
        onPointerDown={e => handlePointerDown(index, e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={dragStyle}
      >
        <FieldListingImage
          name={name}
          onRemoveImage={imageId => {
            fields.remove(index);
            onRemoveImage(imageId);
          }}
          intl={intl}
          aspectWidth={aspectWidth}
          aspectHeight={aspectHeight}
          variantPrefix={variantPrefix}
        />
      </div>
    );
  });
};

// Component that shows listing images from "images" field array
const FieldListingImage = props => {
  const { name, intl, onRemoveImage, aspectWidth, aspectHeight, variantPrefix } = props;
  return (
    <Field name={name}>
      {fieldProps => {
        const { input } = fieldProps;
        const image = input.value;
        return image ? (
          <ListingImage
            image={image}
            key={image?.id?.uuid || image?.id}
            className={css.thumbnail}
            savedImageAltText={intl.formatMessage({
              id: 'EditListingPhotosForm.savedImageAltText',
            })}
            onRemoveImage={() => onRemoveImage(image?.id)}
            aspectWidth={aspectWidth}
            aspectHeight={aspectHeight}
            variantPrefix={variantPrefix}
          />
        ) : null;
      }}
    </Field>
  );
};

/**
 * The EditListingPhotosForm component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {boolean} props.disabled - Whether the form is disabled
 * @param {boolean} props.ready - Whether the form is ready
 * @param {boolean} props.updated - Whether the form is updated
 * @param {boolean} props.updateInProgress - Whether the update is in progress
 * @param {Object} props.fetchErrors - The fetch errors object
 * @param {propTypes.error} props.fetchErrors.publishListingError - The publish listing error
 * @param {propTypes.error} props.fetchErrors.showListingsError - The show listings error
 * @param {propTypes.error} props.fetchErrors.uploadImageError - The upload image error
 * @param {propTypes.error} props.fetchErrors.updateListingError - The update listing error
 * @param {string} props.saveActionMsg - The save action message
 * @param {Function} props.onSubmit - The submit function
 * @param {Function} props.onImageUpload - The image upload function
 * @param {Function} props.onRemoveImage - The remove image function
 * @param {Object} props.listingImageConfig - The listing image config
 * @param {number} props.listingImageConfig.aspectWidth - The aspect width
 * @param {number} props.listingImageConfig.aspectHeight - The aspect height
 * @param {string} props.listingImageConfig.variantPrefix - The variant prefix
 * @returns {JSX.Element}
 */
export const EditListingPhotosForm = props => {
  const [state, setState] = useState({ imageUploadRequested: false });
  const [submittedImages, setSubmittedImages] = useState([]);

  const onImageUploadHandler = file => {
    const { listingImageConfig, onImageUpload } = props;
    if (file) {
      setState({ imageUploadRequested: true });

      onImageUpload({ id: `${file.name}_${Date.now()}`, file }, listingImageConfig)
        .then(() => {
          setState({ imageUploadRequested: false });
        })
        .catch(() => {
          setState({ imageUploadRequested: false });
        });
    }
  };
  const intl = useIntl();

  return (
    <FinalForm
      {...props}
      mutators={{ ...arrayMutators }}
      render={formRenderProps => {
        const {
          form,
          className,
          fetchErrors,
          handleSubmit,
          invalid,
          onRemoveImage,
          disabled,
          ready,
          saveActionMsg,
          updated,
          updateInProgress,
          touched,
          errors,
          values,
          listingImageConfig,
        } = formRenderProps;

        const images = values.images || [];
        const { aspectWidth = 1, aspectHeight = 1, variantPrefix } = listingImageConfig;

        const { publishListingError, showListingsError, updateListingError, uploadImageError } =
          fetchErrors || {};
        const uploadOverLimit = isUploadImageOverLimitError(uploadImageError);

        // imgs can contain added images (with temp ids) and submitted images with uniq ids.
        const arrayOfImgIds = imgs => imgs?.map(i => (typeof i.id === 'string' ? i.imageId : i.id));
        const imageIdsFromProps = arrayOfImgIds(images);
        const imageIdsFromPreviousSubmit = arrayOfImgIds(submittedImages);
        const imageArrayHasSameImages = isEqual(imageIdsFromProps, imageIdsFromPreviousSubmit);
        const submittedOnce = submittedImages.length > 0;
        const pristineSinceLastSubmit = submittedOnce && imageArrayHasSameImages;

        const submitReady = (updated && pristineSinceLastSubmit) || ready;
        const submitInProgress = updateInProgress;
        const submitDisabled =
          invalid || disabled || submitInProgress || state.imageUploadRequested || ready;
        const imagesError = touched.images && errors?.images && errors.images[ARRAY_ERROR];

        const classes = classNames(css.root, className);

        return (
          <Form
            className={classes}
            onSubmit={e => {
              setSubmittedImages(images);
              handleSubmit(e);
            }}
          >
            {updateListingError ? (
              <p className={css.error}>
                <FormattedMessage id="EditListingPhotosForm.updateFailed" />
              </p>
            ) : null}

            <div className={css.imagesFieldArray}>
              <FieldArray
                name="images"
                validate={composeValidators(
                  nonEmptyArray(
                    intl.formatMessage({
                      id: 'EditListingPhotosForm.imageRequired',
                    })
                  )
                )}
              >
                {({ fields }) => (
                  <SortableImageList
                    fields={fields}
                    intl={intl}
                    onRemoveImage={onRemoveImage}
                    aspectWidth={aspectWidth}
                    aspectHeight={aspectHeight}
                    variantPrefix={variantPrefix}
                  />
                )}
              </FieldArray>

              {images.length < MAX_PHOTOS ? (
                <FieldAddImage
                  id="addImage"
                  name="addImage"
                  accept={ACCEPT_IMAGES}
                  label={
                    <span className={css.chooseImageText}>
                      <span className={css.chooseImage}>
                        <FormattedMessage id="EditListingPhotosForm.chooseImage" />
                      </span>
                      <span className={css.imageTypes}>
                        <FormattedMessage id="EditListingPhotosForm.imageTypes" />
                      </span>
                    </span>
                  }
                  type="file"
                  disabled={state.imageUploadRequested}
                  formApi={form}
                  onImageUploadHandler={onImageUploadHandler}
                  aspectWidth={aspectWidth}
                  aspectHeight={aspectHeight}
                />
              ) : null}
            </div>

            {imagesError ? <div className={css.arrayError}>{imagesError}</div> : null}

            {images.length >= MAX_PHOTOS ? (
              <p className={css.tip}>
                Atingiste o máximo de {MAX_PHOTOS} fotografias. Remove uma para adicionar outra.
              </p>
            ) : null}

            <ImageUploadError
              uploadOverLimit={uploadOverLimit}
              uploadImageError={uploadImageError}
            />

            <p className={css.tip}>
              <FormattedMessage id="EditListingPhotosForm.addImagesTip" />
            </p>

            <div className={css.youtubeSection}>
              <FieldTextInput
                id="youtubeUrl"
                name="youtubeUrl"
                type="text"
                maxLength={300}
                label={intl.formatMessage({ id: 'EditListingPhotosForm.youtubeLabel' })}
                placeholder="https://www.youtube.com/watch?v=..."
                validate={value => {
                  if (!value || !value.trim()) return undefined;
                  if (value.length > 300) {
                    return intl.formatMessage({ id: 'EditListingPhotosForm.youtubeTooLong' });
                  }
                  return extractYouTubeVideoId(value)
                    ? undefined
                    : intl.formatMessage({ id: 'EditListingPhotosForm.youtubeInvalid' });
                }}
              />
              <p className={css.youtubeHint}>
                <FormattedMessage id="EditListingPhotosForm.youtubeHint" />
              </p>
            </div>

            <PublishListingError error={publishListingError} />
            <ShowListingsError error={showListingsError} />

            <Button
              className={css.submitButton}
              type="submit"
              inProgress={submitInProgress}
              disabled={submitDisabled}
              ready={submitReady}
            >
              {saveActionMsg}
            </Button>
          </Form>
        );
      }}
    />
  );
};

export default EditListingPhotosForm;
