# Location Tracking Feature - Implementation Guide

## Overview

The Location Tracking feature for the Lost & Found Management System allows users to:
- Capture and store precise location data for lost/found items
- View items on an interactive map with filtering capabilities
- Search for items nearby their current location
- Maintain privacy by not exposing exact coordinates publicly

## Architecture

### Backend Components

#### Database Schema Updates (PostItem Model)
Added geospatial fields to the PostItem model:
```javascript
coordinates: {
  type: 'Point',
  coordinates: [longitude, latitude] // GeoJSON format
}
placeName: String // Approximate location name for display
```

A 2dsphere geospatial index is created on the coordinates field for efficient location-based queries.

#### API Endpoints

##### 1. Get Items for Map
**Endpoint:** `GET /api/items/map/all`
**Query Parameters:**
- `category` (optional): 'lost' or 'found' to filter by type
- `limit` (optional): Max results (default: 50, max: 500)
- `skip` (optional): Pagination offset (default: 0)

**Response:** Array of items with obfuscated coordinates for privacy

##### 2. Get Nearby Items
**Endpoint:** `POST /api/items/map/nearby`
**Request Body:**
```json
{
  "longitude": -73.9352,
  "latitude": 40.7306,
  "radius": 5000,
  "category": "lost" // Optional
}
```
**Parameters:**
- `longitude`: User's longitude (-180 to 180)
- `latitude`: User's latitude (-90 to 90)
- `radius`: Search radius in meters (default: 5000)
- `category` (optional): 'lost' or 'found'

**Response:** Array of items within the radius, sorted by distance

##### 3. Update Item Location
**Endpoint:** `PATCH /api/items/:id/location`
**Authorization:** Required (user must own the item or be admin)
**Request Body:**
```json
{
  "coordinates": {
    "longitude": -73.9352,
    "latitude": 40.7306
  },
  "placeName": "Washington Square Park"
}
```

### Frontend Components

#### 1. LocateMap Component (`LocateMap.jsx`)
Main map display component using Leaflet and React-Leaflet.

**Props:**
- `items` (Array): Items to display on map
- `onItemClick` (Function): Callback when item is clicked
- `userLocation` (Object): User's location {latitude, longitude}
- `searchRadius` (Number): Circle radius to display in meters
- `showSearchRadius` (Boolean): Whether to show radius circle
- `filters` (Object): Filter options {category}

**Features:**
- Interactive map with OpenStreetMap tiles
- Custom markers for lost (red) and found (green) items
- User location marker (blue)
- Search radius visualization circle
- Click markers to view item details popup
- Mobile-responsive design

#### 2. LocationCapture Component (`LocationCapture.jsx`)
Component for capturing location during item posting.

**Props:**
- `onLocationSelect` (Function): Callback with selected coordinates
- `initialLocation` (Object): Pre-filled location
- `title` (String): Component title

**Features:**
- Get current location via geolocation API
- Click on map to manually select location
- Real-time coordinate display
- User-friendly error handling

#### 3. MapViewPage (`MapView.jsx`)
Full-page map view for browsing all items by location.

**Features:**
- Display all items with location data
- Filter by category (All/Lost/Found)
- Item statistics
- Real-time map updates
- Responsive statistics dashboard

#### 4. NearMePage (`NearMe.jsx`)
Full-page view for finding items near user's location.

**Features:**
- Get user's current location
- Adjustable search radius (1km, 5km, 10km, 25km, 50km)
- Filter by category
- List view of nearby items
- Statistics for nearby items
- Map visualization with search radius circle

### Privacy Protection

#### Location Privacy Utility (`locationPrivacy.js`)
Handles privacy protection for location data:

**Key Functions:**
1. `roundCoordinates()` - Reduces coordinate precision
2. `obfuscateCoordinates()` - Adds random noise to coordinates
3. `sanitizeItemForPublic()` - Removes exact coordinates from public API responses
4. `getApproximatePlaceName()` - Generates approximate area names
5. `distanceBetweenCoordinates()` - Calculates distance between two points

**Privacy Strategy:**
- Exact coordinates are stored in database for geospatial queries
- Public APIs return obfuscated/rounded coordinates
- Approximate place names are shown instead of exact addresses
- User's exact location is only used client-side for local searches
- Admin/owner can see exact coordinates when managing their items

## Setup Instructions

### Backend Setup

1. **Install Dependencies:**
   - Leaflet and react-leaflet are used for mapping
   - MongoDB geospatial indexes are automatically created

2. **Database Migration:**
   - Old items without coordinates will still work but won't appear on maps
   - New items created with the LocationCapture component will have coordinates

3. **Environment Configuration:**
   - No additional environment variables needed for basic functionality
   - Optional: Configure reverse geocoding service for place names (future enhancement)

### Frontend Setup

1. **Install Required Packages:**
   ```bash
   npm install leaflet react-leaflet
   ```

2. **Add Routes to App.js:**
   ```javascript
   import MapView from './pages/MapView';
   import NearMe from './pages/NearMe';

   // In your routing
   <Route path="/map" element={<MapView />} />
   <Route path="/near-me" element={<NearMe />} />
   ```

3. **Update Navigation:**
   Add links to navigation menu:
   - "Location Tracker" → `/map`
   - "Find Near Me" → `/near-me`

4. **Integrate LocationCapture:**
   In your PostItem or UpdateItem component:
   ```javascript
   import LocationCapture from '../components/LocationCapture';

   const [selectedLocation, setSelectedLocation] = useState(null);

   // In form:
   <LocationCapture 
     onLocationSelect={setSelectedLocation}
     title="Select where you lost/found this item"
   />

   // When submitting:
   const payload = {
     // ... other fields
     coordinates: selectedLocation,
     placeName: selectedLocation ? `Area ${selectedLocation.latitude.toFixed(2)}` : ''
   };
   ```

## User Guide

### For Users Posting Items

1. **Enable Location Capture:**
   - Click "Use My Location" to auto-capture current location
   - Or click on the map to manually select a location
   - Confirm the selected location

2. **Location Privacy:**
   - Exact coordinates are kept private
   - Only approximate locations are shown to other users
   - You can always see and modify exact locations for your items

### For Users Finding Items

1. **View All Items on Map:**
   - Navigate to "Location Tracker"
   - Filter by item category (All/Lost/Found)
   - Click on markers to view item details
   - Click "View Full Details" to contact owner

2. **Find Items Near You:**
   - Navigate to "Find Near Me"
   - Enable location when prompted
   - Adjust search radius if needed
   - Filter by category
   - View nearby items on map or in list view

## API Integration Example

### Creating an Item with Location

```javascript
const createItemWithLocation = async (itemData, location) => {
  const payload = {
    itemName: itemData.itemName,
    category: itemData.category,
    description: itemData.description,
    location: itemData.location,
    email: itemData.email,
    contactNumber: itemData.contactNumber,
    image: itemData.image,
    coordinates: {
      longitude: location.longitude,
      latitude: location.latitude
    },
    placeName: itemData.placeName || itemData.location
  };

  const response = await fetch('/api/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  return response.json();
};
```

### Searching Nearby Items

```javascript
const searchNearbyItems = async (latitude, longitude, radius = 5000, category = null) => {
  const payload = {
    latitude,
    longitude,
    radius
  };

  if (category) {
    payload.category = category;
  }

  const response = await fetch('/api/items/map/nearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
};
```

## Testing Checklist

### Backend Testing
- [ ] Test geospatial index creation
- [ ] Test item creation with coordinates
- [ ] Test nearbyItems query with various radii
- [ ] Test coordinate validation
- [ ] Test privacy sanitization in API responses
- [ ] Test with items that lack coordinates

### Frontend Testing
- [ ] Test LocationCapture component with geolocation enabled
- [ ] Test LocationCapture with manual map selection
- [ ] Test MapViewPage with multiple items
- [ ] Test filtering by category
- [ ] Test NearMe page with different search radii
- [ ] Test on mobile devices
- [ ] Test error handling (location disabled, network errors)
- [ ] Test marker animations and popups

### Integration Testing
- [ ] Test end-to-end creation of item with location to map display
- [ ] Test filtering across page refreshes
- [ ] Test map responsiveness on different screen sizes
- [ ] Test privacy protection (verify exact coords not exposed)
- [ ] Test performance with many items (500+)

## Future Enhancements

1. **Reverse Geocoding:**
   - Integrate with Nominatim or Google Maps Geocoding API
   - Auto-generate place names from coordinates

2. **Advanced Filtering:**
   - Search by distance traveled
   - Time-based filtering (last 24 hours, week, etc.)
   - Category-specific search

3. **Notifications:**
   - Notify users of items found near them
   - Alert when someone is looking for item similar to theirs

4. **Heat Maps:**
   - Visualize areas with high concentration of lost/found items
   - Identify hotspots for common item losses

5. **Analytics Dashboard:**
   - Traffic patterns by location and time
   - Popular item types by area
   - Success rate by location

## Troubleshooting

### Issue: Items not appearing on map
**Solution:** 
- Verify items have coordinates stored in database
- Check if coordinates are valid (lon: -180 to 180, lat: -90 to 90)
- Ensure geospatial index is created: `db.items.getIndexes()`

### Issue: Geolocation not working
**Solution:**
- Ensure site is on HTTPS (geolocation requires secure context)
- Check browser permissions for location access
- Provide manual map selection as fallback

### Issue: Performance issues with many markers
**Solution:**
- Implement clustering using Leaflet.markercluster
- Paginate results using skip/limit
- Filter results server-side

### Issue: Coordinates being exposed in responses
**Solution:**
- Verify sanitizeItemForPublic() is being called in API endpoints
- Check that obfuscateCoordinates is working correctly
- Audit all API endpoints returning location data

## Security Considerations

1. **HTTPS Only:** Geolocation API requires secure context
2. **User Privacy:** Never store/transmit user's location without consent
3. **SQL Injection:** MongoDB queries are parameterized against injection
4. **CORS:** API endpoints validate origin for cross-domain requests
5. **Rate Limiting:** Consider adding rate limiting to prevent abuse of location APIs

## Performance Optimization

- Geospatial indexes on coordinates field for fast queries
- Lean queries to reduce memory usage
- Result pagination (limit 50 for nearby, 500 for map view)
- Client-side marker clustering for large datasets
- Debounce map interactions to reduce API calls

## License

This Location Tracking feature is part of the Lost & Found Management System.
