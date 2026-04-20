const EARTH_RADIUS_KM = 6371;
const WALKING_SPEED_KMH = 5;
const DRIVING_SPEED_KMH = 35;

export const getItemCoordinates = (item) => {
  const coordinates = item?.coordinates?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [longitude, latitude] = coordinates;

  if (
    typeof longitude !== "number" ||
    typeof latitude !== "number" ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ) {
    return null;
  }

  return { latitude, longitude };
};

export const getLocationKey = (item) => {
  const placeName = String(item?.placeName || item?.location || "").trim();

  if (placeName) {
    return `place:${placeName.toLowerCase()}`;
  }

  const coordinates = getItemCoordinates(item);
  if (!coordinates) {
    return `item:${String(item?._id || "unknown")}`;
  }

  const latitude = coordinates.latitude.toFixed(4);
  const longitude = coordinates.longitude.toFixed(4);
  return `coords:${latitude},${longitude}`;
};

export const buildLocationTagMap = (items = []) => {
  const locationTags = new Map();

  items.forEach((item) => {
    const key = getLocationKey(item);

    if (!locationTags.has(key)) {
      locationTags.set(key, `P${locationTags.size + 1}`);
    }
  });

  return locationTags;
};

export const getLocationTag = (item, locationTagMap) => {
  if (!locationTagMap) return null;

  const key = getLocationKey(item);
  return locationTagMap.get(key) || null;
};

export const haversineDistanceKm = (from, to) => {
  if (!from || !to) return null;

  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

export const getTravelEstimate = (from, item) => {
  const to = getItemCoordinates(item);

  if (!from || !to) {
    return null;
  }

  const distanceKm = haversineDistanceKm(from, to);

  if (distanceKm === null) {
    return null;
  }

  const walkingMinutes = (distanceKm / WALKING_SPEED_KMH) * 60;
  const drivingMinutes = (distanceKm / DRIVING_SPEED_KMH) * 60;

  return {
    distanceKm,
    walkingMinutes,
    drivingMinutes,
  };
};

export const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  return `${distanceKm.toFixed(1)} km`;
};

export const formatDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return "--";
  }

  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
};
