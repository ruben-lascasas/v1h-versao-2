import GeocoderMapbox from './GeocoderMapbox';

// Address autocomplete used to require mapbox-gl.js (the map *rendering*
// library, loaded from the Mapbox CDN) on top of the self-hosted geocoding SDK.
// When that script was missing the listing wizard's Localização step threw
// "Mapbox libraries are required for GeocoderMapbox" on every keystroke and the
// user could never resolve an address. Geocoding must work with the SDK alone.
describe('GeocoderMapbox without mapbox-gl.js', () => {
  const TOKEN = 'pk.test-token';
  let forwardGeocode;

  beforeEach(() => {
    delete window.mapboxgl;
    forwardGeocode = jest.fn(() => ({
      send: () =>
        Promise.resolve({
          body: {
            features: [{ id: 'address.1', place_name: 'Rua de Cabanas, Porto', center: [-8.6, 41.1] }],
          },
        }),
    }));
    window.mapboxSdk = jest.fn(() => ({ geocoding: { forwardGeocode } }));
  });

  afterEach(() => {
    delete window.mapboxSdk;
  });

  it('fetches predictions using the token from the config', async () => {
    const geocoder = new GeocoderMapbox(TOKEN);
    const result = await geocoder.getPlacePredictions('Rua de Cabanas', null, 'pt-PT');

    expect(window.mapboxSdk).toHaveBeenCalledWith({ accessToken: TOKEN });
    expect(result.search).toEqual('Rua de Cabanas');
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].place_name).toEqual('Rua de Cabanas, Porto');
  });

  it('rejects instead of throwing synchronously when the SDK is absent', async () => {
    delete window.mapboxSdk;
    const geocoder = new GeocoderMapbox(TOKEN);

    // A synchronous throw here is what left `fetchingPredictions` stuck and
    // bypassed the caller's .catch(). It must be a rejection instead.
    const promise = geocoder.getPlacePredictions('Lisboa', null, 'pt-PT');
    expect(promise).toBeInstanceOf(Promise);

    // The on-demand loader appends a <script> that jsdom never resolves, which
    // is exactly the "blocked / stalled" case the timeout exists for.
    const script = document.getElementById('mapbox_SDK_JS');
    expect(script).not.toBeNull();
    script.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow(/Failed to load the Mapbox SDK/);
  });

  it('resolves place details with an origin, without mapbox-gl', async () => {
    const geocoder = new GeocoderMapbox(TOKEN);
    const { predictions } = await geocoder.getPlacePredictions('Rua de Cabanas', null, 'pt-PT');
    const place = await geocoder.getPlaceDetails(predictions[0], 500);

    expect(place.address).toEqual('Rua de Cabanas, Porto');
    // The listing wizard only accepts an address whose origin is a LatLng.
    expect(place.origin.lat).toBeCloseTo(41.1, 5);
    expect(place.origin.lng).toBeCloseTo(-8.6, 5);
  });

  it('generates bounds without mapbox-gl LngLat.toBounds', async () => {
    const geocoder = new GeocoderMapbox(TOKEN);
    // No bbox on the feature, so bounds have to be generated around the origin.
    const place = await geocoder.getPlaceDetails(
      { id: 'address.2', place_name: 'Porto', place_type: ['address'], center: [-8.6, 41.1] },
      500
    );

    expect(place.bounds.ne.lat).toBeGreaterThan(41.1);
    expect(place.bounds.sw.lat).toBeLessThan(41.1);
    expect(place.bounds.ne.lng).toBeGreaterThan(-8.6);
    expect(place.bounds.sw.lng).toBeLessThan(-8.6);
    // 500 m of latitude is ~0.0045 degrees.
    expect(place.bounds.ne.lat - 41.1).toBeCloseTo(0.0045, 3);
  });
});
