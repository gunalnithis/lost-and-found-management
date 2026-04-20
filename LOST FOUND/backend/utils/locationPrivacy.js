/**
 * Location Privacy Utility
 * Handles coordinate obfuscation and approximate location generation
 */

/**
 * Obfuscate coordinates by adding random noise
 * Reduces precision while keeping items in approximate area
 * @param {number} latitude - Original latitude
 * @param {number} longitude - Original longitude
 * @param {number} radiusInMeters - Radius for obfuscation (default 500 meters)
 * @returns {Object} Obfuscated coordinates {latitude, longitude}
 */
const obfuscateCoordinates = (latitude, longitude, radiusInMeters = 500) => {
  if (!latitude || !longitude) {
    return null;
  }

  // Convert radius to approximate degrees
  // 1 degree of latitude ≈ 111 km
  const latitudeOffset = (Math.random() - 0.5) * (radiusInMeters / (111000 / 2));
  const longitudeOffset = (Math.random() - 0.5) * (radiusInMeters / (111000 * Math.cos(latitude * Math.PI / 180) / 2));

  return {
    latitude: latitude + latitudeOffset,
    longitude: longitude + longitudeOffset,
  };
};

/**
 * Round coordinates to reduce precision
 * Helpful for grouping items in approximate areas
 * @param {number} latitude - Original latitude
 * @param {number} longitude - Original longitude
 * @param {number} decimalPlaces - Number of decimal places to round to (default 2)
 * @returns {Object} Rounded coordinates
 */
const roundCoordinates = (latitude, longitude, decimalPlaces = 2) => {
  const factor = Math.pow(10, decimalPlaces);
  return {
    latitude: Math.round(latitude * factor) / factor,
    longitude: Math.round(longitude * factor) / factor,
  };
};

/**
 * Get approximate place name based on coordinates
 * Used for displaying user-friendly location without exposing exact coordinates
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {string} fallbackLocationName - Fallback if no name is available
 * @returns {string} Approximate place name
 */
const getApproximatePlaceName = (latitude, longitude, fallbackLocationName = '') => {
  // This is a simple example that generates a grid-based location name
  // In practice, you might want to use a geocoding service like Nominatim or Google Maps

  const latGrid = Math.floor(latitude * 4); // Creates grid zones
  const lonGrid = Math.floor(longitude * 4);

  // Generate a hash-based name to ensure consistency
  const hash = Math.abs(latGrid * 31 + lonGrid) % 1000;

  const areas = [
    'Downtown District',
    'North Quarter',
    'South End',
    'East Side',
    'West Park',
    'Central Hub',
    'Oak Valley',
    'Pine Heights',
    'Riverside',
    'Lakeside',
    'Hillside',
    'Parkside',
    'Midtown',
    'Uptown',
    'Waterfront',
    'Merchant District',
    'University Area',
    'Arts Quarter',
    'Tech Hub',
    'Garden District',
  ];

  const approximateArea = areas[hash % areas.length];

  return fallbackLocationName || approximateArea;
};

/**
 * Filter out exact coordinates from item objects for public API responses
 * Keeps only necessary fields for display
 * @param {Object} item - Item object with coordinates
 * @param {boolean} includeExactCoordinates - Whether to include exact coordinates (default false)
 * @returns {Object} Sanitized item object
 */
const sanitizeItemForPublic = (item, includeExactCoordinates = false) => {
  const sanitized = {
    _id: item._id,
    itemName: item.itemName,
    category: item.category,
    trackingStatus: item.trackingStatus,
    moderationStatus: item.status,
    description: item.description,
    location: item.location,
    placeName: item.placeName,
    image: item.image,
    createdAt: item.createdAt,
    email: item.email,
    userId: item.userId,
  };

  // Include coordinates for map display, but can be obfuscated for privacy
  if (item.coordinates && item.coordinates.coordinates) {
    const [lon, lat] = item.coordinates.coordinates;
    
    if (includeExactCoordinates) {
      sanitized.coordinates = item.coordinates;
    } else {
      // Option 1: Round coordinates for approximate location
      const rounded = roundCoordinates(lat, lon, 3);
      sanitized.coordinates = {
        type: 'Point',
        coordinates: [rounded.longitude, rounded.latitude],
      };
    }
  }

  return sanitized;
};

/**
 * Calculate distance between two coordinates in meters using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
const distanceBetweenCoordinates = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

module.exports = {
  obfuscateCoordinates,
  roundCoordinates,
  getApproximatePlaceName,
  sanitizeItemForPublic,
  distanceBetweenCoordinates,
};
