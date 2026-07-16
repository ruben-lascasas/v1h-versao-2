import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const isInPortugal = geo => {
  if (!geo || geo.lat == null || geo.lng == null) return false;
  const { lat, lng } = geo;
  return (
    // Portugal continental
    (lat >= 36.9 && lat <= 42.15 && lng >= -9.52 && lng <= -6.19) ||
    // Madeira
    (lat >= 32.4 && lat <= 33.2 && lng >= -17.4 && lng <= -16.2) ||
    // Açores
    (lat >= 36.9 && lat <= 39.8 && lng >= -31.6 && lng <= -24.9)
  );
};

export const fetchMapListings = createAsyncThunk(
  'mapListings/fetch',
  async (_, { extra: sdk }) => {
    const response = await sdk.listings.query({
      perPage: 100,
      minStock: 1,
      stockMode: 'match-undefined',
    });
    return (response.data?.data || []).filter(
      l =>
        !l.attributes.deleted &&
        l.attributes.state === 'published' &&
        l.attributes.geolocation &&
        isInPortugal(l.attributes.geolocation)
    );
  }
);

const mapListingsSlice = createSlice({
  name: 'mapListings',
  initialState: { listings: [], inProgress: false, fetched: false },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchMapListings.pending, state => {
        state.inProgress = true;
      })
      .addCase(fetchMapListings.fulfilled, (state, action) => {
        state.listings = action.payload;
        state.inProgress = false;
        state.fetched = true;
      })
      .addCase(fetchMapListings.rejected, state => {
        state.inProgress = false;
        state.fetched = true;
      });
  },
});

export default mapListingsSlice.reducer;
