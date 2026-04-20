# Location Data Validation & Coordinate Format Guide

## The GeoJSON Point Format

MongoDB uses the GeoJSON specification for geospatial data. A Point must have this exact structure:

```javascript
{
  type: "Point",
  coordinates: [longitude, latitude]  // Array with exactly 2 numbers
}
```

### Important Notes:
- **Order matters**: Always `[longitude, latitude]`, NOT `[latitude, longitude]`
- **Longitude range**: -180 to 180
- **Latitude range**: -90 to 90
- **coordinates must be an array**, not an object
- The `type` field must be exactly `"Point"`

## Common Errors & Fixes

### Error: "Point must be an array or object, instead got type missing"

**Cause**: The `coordinates.coordinates` array is missing

**Bad (❌):**
```javascript
coordinates: {
  type: "Point"
  // Missing coordinates array!
}
```

**Good (✅):**
```javascript
coordinates: {
  type: "Point",
  coordinates: [-73.9352, 40.7306]
}
```

### Error: "Coordinates must be a valid [longitude, latitude] pair"

**Cause**: The coordinates array doesn't have exactly 2 numbers, or values are out of range

**Bad Examples (❌):**
```javascript
coordinates: [-73.9352]                    // Only 1 number
coordinates: [-73.9352, 40.7306, 100]      // 3 numbers
coordinates: [null, 40.7306]               // Non-number value
coordinates: [360, 40.7306]                // Longitude > 180
coordinates: [-73.9352, 95]                // Latitude > 90
```

**Good (✅):**
```javascript
coordinates: [-73.9352, 40.7306]           // Two valid numbers within range
```

## Frontend to Backend Coordinate Format Conversion

### Frontend (LocationCapture Component)

Sends coordinates in this format:
```javascript
{
  latitude: 40.7306,
  longitude: -73.9352
}
```

### Backend (Should convert to)

Stores in database as:
```javascript
{
  type: "Point",
  coordinates: [-73.9352, 40.7306]
}
```

### Conversion Logic

The backend controllers automatically handle the conversion:

```javascript
const coordinates = req.body.coordinates; // {latitude, longitude}

if (coordinates.longitude !== undefined && coordinates.latitude !== undefined) {
  const { longitude, latitude } = coordinates;
  
  // Convert to GeoJSON format
  const geoJSON = {
    type: "Point",
    coordinates: [longitude, latitude]
  };
  
  // Store in database
  item.coordinates = geoJSON;
}
```

## API Request/Response Examples

### Creating an Item with Coordinates

**Request:**
```json
POST /api/items

{
  "itemName": "Blue Backpack",
  "category": "lost",
  "description": "Lost blue backpack with laptop",
  "location": "Washington Square Park",
  "email": "user@example.com",
  "contactNumber": "555-1234",
  "coordinates": {
    "longitude": -73.9352,
    "latitude": 40.7306
  },
  "placeName": "Washington Square Park"
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "itemName": "Blue Backpack",
  "coordinates": {
    "type": "Point",
    "coordinates": [-73.9352, 40.7306]
  },
  "placeName": "Washington Square Park",
  ...
}
```

### Updating Item Location

**Request:**
```json
PATCH /api/items/507f1f77bcf86cd799439011/location

{
  "coordinates": {
    "longitude": -73.9352,
    "latitude": 40.7306
  },
  "placeName": "Central Park"
}
```

### Searching Nearby Items

**Request:**
```json
POST /api/items/map/nearby

{
  "longitude": -73.9352,
  "latitude": 40.7306,
  "radius": 5000,
  "category": "lost"
}
```

## Validation Checklist

When storing coordinates, verify:

- [ ] `coordinates` object exists
- [ ] `coordinates.type` equals `"Point"`
- [ ] `coordinates.coordinates` is an array
- [ ] Array has exactly 2 elements: `[longitude, latitude]`
- [ ] Both values are numbers
- [ ] Longitude is between -180 and 180
- [ ] Latitude is between -90 and 90

## Database Queries to Check Coordinates

### Check for Invalid Coordinates

```javascript
// Items with missing coordinates array
db.postItems.find({ 'coordinates.coordinates': { $exists: false } }).count()

// Items with non-array coordinates
db.postItems.find({ 'coordinates.coordinates': { $not: { $type: 'array' } } }).count()

// Items with wrong array length
db.postItems.find({ 'coordinates.coordinates': { $size: { $ne: 2 } } }).count()

// Items with invalid longitude
db.postItems.find({ 
  'coordinates.coordinates': { 
    $elemMatch: { 
      $lt: -180 
    } 
  } 
}).count()
```

### Check for Valid Coordinates

```javascript
// Items with valid coordinates
db.postItems.find({
  'coordinates.type': 'Point',
  'coordinates.coordinates': { $exists: true, $type: 'array', $size: 2 }
}).count()

// View sample valid item
db.postItems.findOne({
  'coordinates.type': 'Point',
  'coordinates.coordinates': { $exists: true }
})
```

### Geospatial Index

```javascript
// Check if 2dsphere index exists
db.postItems.getIndexes()

// Should show something like:
// {
//   "key" : { "coordinates" : "2dsphere" },
//   "name" : "coordinates_2dsphere"
// }
```

## Fixing Existing Items

### Option 1: Using the Migration Script

```bash
node backend/scripts/fixCoordinates.js
```

This script will:
1. Find items with incomplete coordinates
2. Remove malformed coordinates
3. Create the 2dsphere index if missing
4. Display statistics

### Option 2: Manual MongoDB Fix

```javascript
// Remove incomplete coordinates
db.postItems.updateMany(
  { 'coordinates.coordinates': { $exists: false } },
  { $unset: { coordinates: "" } }
)

// Create 2dsphere index
db.postItems.createIndex({ "coordinates": "2dsphere" })
```

### Option 3: Bulk Update with Valid Coordinates

If you know the correct coordinates:

```javascript
db.postItems.updateOne(
  { _id: ObjectId("507f1f77bcf86cd799439011") },
  {
    $set: {
      "coordinates": {
        "type": "Point",
        "coordinates": [-73.9352, 40.7306]
      }
    }
  }
)
```

## Debugging Coordinates Issues

### Enable Detailed Logging

In `itemController.js`, add logging:

```javascript
console.log('Received coordinates:', req.body.coordinates);
console.log('Formatted coordinates:', itemCoordinates);

// Before save
console.log('Item before save:', item.coordinates);

// After save
console.log('Item after save:', savedItem.coordinates);
```

### Test Geospatial Query

```bash
# Check if coordinates are queryable
curl -X POST http://localhost:5000/api/items/map/nearby \
  -H "Content-Type: application/json" \
  -d '{
    "longitude": -73.9352,
    "latitude": 40.7306,
    "radius": 10000
  }'
```

### Browser Console Test

```javascript
// Test coordinate conversion
const coords = { latitude: 40.7306, longitude: -73.9352 };
console.log('Original:', coords);
console.log('GeoJSON:', {
  type: 'Point',
  coordinates: [coords.longitude, coords.latitude]
});
```

## Prevention Best Practices

1. **Always validate in frontend:**
   ```javascript
   if (!location.latitude || !location.longitude) {
     return error("Location is required");
   }
   ```

2. **Always validate in backend:**
   - Check type (number)
   - Check range (-180-180, -90-90)
   - Check format (array with 2 elements)

3. **Return meaningful error messages:**
   ```javascript
   return res.status(400).json({
     message: 'Invalid coordinates format',
     details: 'Expected {longitude: number, latitude: number}',
     received: coordinates
   });
   ```

4. **Test with edge cases:**
   - Coordinates at poles: 0, 90 / 0, -90
   - Date line: 180, 0 / -180, 0
   - Invalid: 360, 100 / -200, -100

5. **Handle missing coordinates gracefully:**
   ```javascript
   // Don't break if coordinates are missing
   if (!item.coordinates?.coordinates) {
     // Item is still valid, just not on map
     return item;
   }
   ```

## Troubleshooting Flowchart

```
Geospatial query returns error?
├─ "Point must be an array..."
│  └─ Coordinates array is missing or malformed
│     └─ Run fixCoordinates.js migration
│
├─ "Operator $near requires geospatial index"
│  └─ 2dsphere index not created
│     └─ Create index manually or run migration
│
├─ Items not showing on map
│  └─ Items don't have coordinates
│     └─ Check database: db.postItems.find({'coordinates': {$exists: false}})
│     └─ Recreate items with location data
│
└─ Wrong results or empty results
   └─ Check radius, category filter, or zoom level
      └─ Verify coordinates are actually in desired area
```
