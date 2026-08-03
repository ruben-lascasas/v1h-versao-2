import { types as sdkTypes } from '../../util/sdkLoader';
import { userLocation } from '../../util/maps';

const { LatLng: SDKLatLng, LatLngBounds: SDKLatLngBounds } = sdkTypes;

export const CURRENT_LOCATION_ID = 'current-location';

const GENERATED_BOUNDS_DEFAULT_DISTANCE = 500; // meters
// Distances for generated bounding boxes for different Mapbox place types
const PLACE_TYPE_BOUNDS_DISTANCES = {
  address: 500,
  country: 2000,
  region: 2000,
  postcode: 2000,
  district: 2000,
  place: 2000,
  locality: 2000,
  neighborhood: 2000,
  poi: 2000,
  'poi.landmark': 2000,
};

// The geocoding SDK is served from our own /static folder, so address
// autocomplete must not depend on mapbox-gl.js loading from the Mapbox CDN —
// that script is only needed to *draw* maps, and it is the part that goes
// missing when the CDN is blocked or the script tag never made it into <head>.
const MAPBOX_SDK_SCRIPT_ID = 'mapbox_SDK_JS';
const MAPBOX_SDK_SRC = '/static/scripts/mapbox/mapbox-sdk@0.16.2/mapbox-sdk.min.js';
const MAPBOX_SDK_LOAD_TIMEOUT = 10000;

let sdkLoadPromise = null;

/**
 * Resolve once window.mapboxSdk exists, injecting the self-hosted script if
 * whatever was supposed to add it (IncludeScripts via react-helmet) did not.
 *
 * @return {Promise<void>}
 */
export const ensureMapboxSdk = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Mapbox SDK can only be loaded in a browser'));
  }
  if (window.mapboxSdk) {
    return Promise.resolve();
  }
  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(MAPBOX_SDK_SCRIPT_ID);
    // A request that neither loads nor errors (blocked by an extension, stalled
    // proxy) would otherwise leave the field waiting forever with no feedback.
    const timeoutId = window.setTimeout(() => {
      sdkLoadPromise = null;
      reject(new Error(`Timed out loading the Mapbox SDK from ${MAPBOX_SDK_SRC}`));
    }, MAPBOX_SDK_LOAD_TIMEOUT);

    const onLoad = () => {
      window.clearTimeout(timeoutId);
      return window.mapboxSdk ? resolve() : reject(new Error('Mapbox SDK not found'));
    };
    const onError = () => {
      window.clearTimeout(timeoutId);
      // Allow a later attempt to retry the download.
      sdkLoadPromise = null;
      reject(new Error(`Failed to load the Mapbox SDK from ${MAPBOX_SDK_SRC}`));
    };

    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', onError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = MAPBOX_SDK_SCRIPT_ID;
    // Root-relative on purpose: the file is same-origin, so this keeps working
    // even if marketplaceRootURL is misconfigured for the deployed host.
    script.src = MAPBOX_SDK_SRC;
    script.async = true;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
};

// Same math as mapbox-gl's LngLat.toBounds, inlined so bounds can be computed
// without the mapbox-gl library being present.
const EARTH_CIRCUMFERENCE_METERS = 40075017;

const locationBounds = (latlng, distance) => {
  if (!latlng) {
    return null;
  }

  const latAccuracy = (360 * distance) / EARTH_CIRCUMFERENCE_METERS;
  const lngAccuracy = latAccuracy / Math.cos((Math.PI / 180) * latlng.lat);

  return new SDKLatLngBounds(
    new SDKLatLng(latlng.lat + latAccuracy, latlng.lng + lngAccuracy),
    new SDKLatLng(latlng.lat - latAccuracy, latlng.lng - lngAccuracy)
  );
};

const placeOrigin = prediction => {
  if (prediction && Array.isArray(prediction.center) && prediction.center.length === 2) {
    // Coordinates in Mapbox features are represented as [longitude, latitude].
    return new SDKLatLng(prediction.center[1], prediction.center[0]);
  }
  return null;
};

const placeBounds = prediction => {
  if (prediction) {
    if (Array.isArray(prediction.bbox) && prediction.bbox.length === 4) {
      // Bounds in Mapbox features are represented as [minX, minY, maxX, maxY]
      return new SDKLatLngBounds(
        new SDKLatLng(prediction.bbox[3], prediction.bbox[2]),
        new SDKLatLng(prediction.bbox[1], prediction.bbox[0])
      );
    } else {
      // If bounds are not available, generate them around the origin

      // Resolve bounds distance based on place type
      const placeType = Array.isArray(prediction.place_type) && prediction.place_type[0];

      const distance =
        (placeType && PLACE_TYPE_BOUNDS_DISTANCES[placeType]) || GENERATED_BOUNDS_DEFAULT_DISTANCE;

      return locationBounds(placeOrigin(prediction), distance);
    }
  }
  return null;
};

export const GeocoderAttribution = () => null;

/**
 * A forward geocoding (place name -> coordinates) implementation
 * using the Mapbox Geocoding API.
 */
class GeocoderMapbox {
  /**
   * @param {string} [accessToken] token from the app config. Falls back to the
   *   one mapbox-gl publishes on window, for callers that don't pass it.
   */
  constructor(accessToken) {
    this._accessToken = accessToken;
  }

  getAccessToken() {
    return this._accessToken || (typeof window !== 'undefined' && window?.mapboxgl?.accessToken);
  }

  getClient() {
    if (typeof window === 'undefined' || !window.mapboxSdk) {
      throw new Error('The Mapbox SDK is required for GeocoderMapbox');
    }
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('A Mapbox access token is required for GeocoderMapbox');
    }
    if (!this._client) {
      this._client = window.mapboxSdk({ accessToken });
    }
    return this._client;
  }

  // Public API
  //

  /**
   * Search places with the given name.
   *
   * @param {String} search query for place names
   *
   * @return {Promise<{ search: String, predictions: Array<Object>}>}
   * results of the geocoding, should have the original search query
   * and an array of predictions. The format of the predictions is
   * only relevant for the `getPlaceDetails` function below.
   */
  getPlacePredictions(search, countryLimit, locale) {
    const limitCountriesMaybe = countryLimit ? { countries: countryLimit } : {};

    // Load-on-demand inside the promise chain, so a missing SDK surfaces as a
    // rejected promise the caller can handle instead of a synchronous throw.
    return ensureMapboxSdk()
      .then(() =>
        this.getClient()
          .geocoding.forwardGeocode({
            query: search,
            limit: 5,
            ...limitCountriesMaybe,
            language: [locale],
          })
          .send()
      )
      .then(response => {
        return {
          search,
          predictions: response.body.features,
        };
      });
  }

  /**
   * Get the ID of the given prediction.
   */
  getPredictionId(prediction) {
    return prediction.id;
  }

  /**
   * Get the address text of the given prediction.
   */
  getPredictionAddress(prediction) {
    if (prediction.predictionPlace) {
      // default prediction defined above
      return prediction.predictionPlace.address;
    }
    // prediction from Mapbox geocoding API
    return prediction.place_name;
  }

  /**
   * Fetch or read place details from the selected prediction.
   *
   * @param {Object} prediction selected prediction object
   *
   * @return {Promise<util.propTypes.place>} a place object
   */
  getPlaceDetails(prediction, currentLocationBoundsDistance) {
    if (this.getPredictionId(prediction) === CURRENT_LOCATION_ID) {
      return userLocation().then(latlng => {
        return {
          address: '',
          origin: latlng,
          bounds: locationBounds(latlng, currentLocationBoundsDistance),
        };
      });
    }

    if (prediction.predictionPlace) {
      return Promise.resolve(prediction.predictionPlace);
    }

    return Promise.resolve({
      address: this.getPredictionAddress(prediction),
      origin: placeOrigin(prediction),
      bounds: placeBounds(prediction),
    });
  }
}

export default GeocoderMapbox;
