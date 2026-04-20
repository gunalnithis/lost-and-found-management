import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/**
 * LocationMarker Component
 * Handles map click events to set marker location
 */
const LocationMarker = ({ onLocationSelect, selectedLocation }) => {
  const map = useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      onLocationSelect({
        latitude: lat,
        longitude: lng,
      });
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return selectedLocation ? (
    <Marker position={[selectedLocation.latitude, selectedLocation.longitude]}>
      <Popup>
        <div className="p-2">
          <p className="text-sm font-semibold">Selected Location</p>
          <p className="text-xs text-gray-600">
            Lat: {selectedLocation.latitude.toFixed(4)}
          </p>
          <p className="text-xs text-gray-600">
            Lon: {selectedLocation.longitude.toFixed(4)}
          </p>
        </div>
      </Popup>
    </Marker>
  ) : null;
};

/**
 * LocationCapture Component
 * Allows users to select a location via geolocation or map click
 */
const LocationCapture = ({
  onLocationSelect,
  initialLocation = null,
  title = "Select Location for Your Item",
}) => {
  const [selectedLocation, setSelectedLocation] = useState(initialLocation);
  const [userLocation, setUserLocation] = useState(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState([51.505, -0.09]);
  const mapRef = useRef(null);

  const handleGetCurrentLocation = useCallback(() => {
    setIsLoadingLocation(true);
    setError(null);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const location = { latitude, longitude };
          setUserLocation(location);
          setSelectedLocation(location);
          onLocationSelect(location);
          setIsLoadingLocation(false);
        },
        (err) => {
          setError(
            "Unable to get your location. Please ensure location services are enabled and try clicking on the map to select a location manually.",
          );
          console.error("Geolocation error:", err);
          setIsLoadingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        },
      );
    } else {
      setError("Geolocation is not supported by your browser.");
      setIsLoadingLocation(false);
    }
  }, [onLocationSelect]);

  // Try to get user's current location on component mount
  useEffect(() => {
    if (!userLocation && !initialLocation) {
      handleGetCurrentLocation();
    }
  }, [handleGetCurrentLocation, initialLocation, userLocation]);

  // Update map center when location changes
  useEffect(() => {
    if (userLocation) {
      setMapCenter([userLocation.latitude, userLocation.longitude]);
    } else if (selectedLocation) {
      setMapCenter([selectedLocation.latitude, selectedLocation.longitude]);
    }
  }, [userLocation, selectedLocation]);

  const handleLocationSelect = useCallback(
    (location) => {
      setSelectedLocation(location);
      onLocationSelect(location);
    },
    [onLocationSelect],
  );

  const handleClearLocation = () => {
    setSelectedLocation(null);
    setError(null);
    onLocationSelect(null);
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">
          Click on the map to select a location, or use the button below to get
          your current location.
        </p>

        {/* Control Buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleGetCurrentLocation}
            disabled={isLoadingLocation}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition font-medium"
          >
            {isLoadingLocation ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Getting Location...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Use My Location
              </>
            )}
          </button>

          {selectedLocation && (
            <button
              onClick={handleClearLocation}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
            >
              Clear Location
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">{error}</p>
          </div>
        )}

        {/* Location Display */}
        {selectedLocation && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-semibold text-green-800 mb-2">
              ✓ Location Selected
            </p>
            <p className="text-xs text-gray-700">
              <strong>Latitude:</strong> {selectedLocation.latitude.toFixed(6)}
            </p>
            <p className="text-xs text-gray-700">
              <strong>Longitude:</strong>{" "}
              {selectedLocation.longitude.toFixed(6)}
            </p>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="w-full h-96 rounded-lg overflow-hidden shadow-lg border border-gray-200">
        <MapContainer
          ref={mapRef}
          center={mapCenter}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <LocationMarker
            onLocationSelect={handleLocationSelect}
            selectedLocation={selectedLocation}
          />
        </MapContainer>
      </div>

      {/* Info Text */}
      <p className="text-xs text-gray-500 mt-3">
        💡 Tip: Click anywhere on the map to select a location. Your exact
        coordinates will be stored securely and only approximate location names
        will be shown publicly.
      </p>
    </div>
  );
};

export default LocationCapture;
