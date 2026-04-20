import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  buildLocationTagMap,
  formatDistance,
  formatDuration,
  getLocationKey,
  getTravelEstimate,
  getLocationTag,
} from "../utils/locationMath";

const statusLabels = {
  found: "Found",
  contacted: "Contacted",
  claim_requested: "Claim Requested",
  verifying: "Verifying",
  returned: "Returned",
};

const statusColors = {
  found: "#22C55E",
  contacted: "#06B6D4",
  claim_requested: "#F59E0B",
  verifying: "#3B82F6",
  returned: "#6B7280",
};

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const userLocationIcon = new L.Icon({
  iconUrl:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIiBmaWxsPSJub25lIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI4IiBmaWxsPSIjMw1CREEiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

const createLocationTagIcon = (tag, color) =>
  new L.DivIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:${color};color:#fff;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,0.25)">${tag}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });

const createSelectedItemIcon = (itemName = "Item") => {
  const label = String(itemName).trim().slice(0, 14) || "Item";

  return new L.DivIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;min-width:52px;height:34px;padding:0 10px;border-radius:999px;background:#F97316;color:#fff;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 6px 14px rgba(249,115,22,0.45)">${label}</div>`,
    iconSize: [64, 34],
    iconAnchor: [32, 17],
    popupAnchor: [0, -14],
  });
};

/**
 * ItemInfoPopup Component
 * Displays item information in a popup on the map
 */
const ItemInfoPopup = ({ item, onViewDetails, userLocation, locationTag }) => {
  const travelEstimate = userLocation
    ? getTravelEstimate(userLocation, item)
    : null;

  return (
    <div className="w-60 p-3 bg-white">
      {item.image && (
        <img
          src={item.image}
          alt={item.itemName}
          className="w-full h-32 object-cover rounded mb-2"
          onError={(e) => {
            e.target.src = "https://via.placeholder.com/200?text=No+Image";
          }}
        />
      )}
      <h3 className="font-semibold text-sm text-gray-800 mb-1">
        {item.itemName}
      </h3>
      {locationTag && (
        <p className="mb-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700">
          Location {locationTag}
        </p>
      )}
      <p className="text-xs text-gray-600 mb-2">
        <span
          className={`inline-block px-2 py-1 rounded-full text-white text-xs font-semibold ${
            item.category === "lost" ? "bg-red-500" : "bg-green-500"
          }`}
        >
          {item.category === "lost" ? "Lost" : "Found"}
        </span>
      </p>
      {item.category === "found" && (
        <p className="text-xs text-gray-600 mb-2">
          <span
            className="inline-block px-2 py-1 rounded-full text-white text-xs font-semibold"
            style={{
              backgroundColor:
                statusColors[item.trackingStatus || "found"] ||
                statusColors.found,
            }}
          >
            {statusLabels[item.trackingStatus || "found"] || "Found"}
          </span>
        </p>
      )}
      <p className="text-xs text-gray-600 mb-2">
        <strong>Location:</strong> {item.placeName || item.location}
      </p>
      {travelEstimate && (
        <div className="mb-2 rounded-md border border-blue-100 bg-blue-50 p-2 text-xs text-blue-900">
          <p className="font-semibold">From your current location</p>
          <p className="mt-1">
            Distance: {formatDistance(travelEstimate.distanceKm)}
          </p>
          <p>Walk time: {formatDuration(travelEstimate.walkingMinutes)}</p>
          <p>Drive time: {formatDuration(travelEstimate.drivingMinutes)}</p>
        </div>
      )}
      <p className="text-xs text-gray-600 mb-3">
        <strong>Posted:</strong> {new Date(item.createdAt).toLocaleDateString()}
      </p>
      <button
        onClick={() => onViewDetails(item._id)}
        className="w-full px-3 py-2 bg-blue-500 text-white text-xs font-semibold rounded hover:bg-blue-600 transition"
      >
        View Full Details
      </button>
      <p className="text-xs text-gray-500 mt-2">
        <strong>Contact:</strong> {item.email}
      </p>
    </div>
  );
};

const MapFocusController = ({ focusCoordinates }) => {
  const map = useMap();

  useEffect(() => {
    if (!focusCoordinates || !Array.isArray(focusCoordinates)) return;

    const [longitude, latitude] = focusCoordinates;
    if (
      typeof longitude === "number" &&
      typeof latitude === "number" &&
      Number.isFinite(longitude) &&
      Number.isFinite(latitude)
    ) {
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 16), {
        duration: 0.8,
      });
    }
  }, [focusCoordinates, map]);

  return null;
};

const LocationGroupPopup = ({ group, onSelectItem }) => (
  <div className="w-64 p-2">
    <p className="text-xs font-black uppercase tracking-wide text-blue-700">
      Location {group.tag}
    </p>
    <p className="mb-2 text-xs text-gray-600">{group.placeLabel}</p>
    <div className="max-h-44 space-y-2 overflow-y-auto">
      {group.items.map((item) => (
        <button
          key={item._id}
          type="button"
          onClick={() => onSelectItem(item)}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-left hover:bg-gray-50"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-gray-800">
              {item.itemName}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                item.category === "lost"
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {item.category}
            </span>
          </div>
        </button>
      ))}
    </div>
  </div>
);

/**
 * LocateMap Component
 * Main map component for displaying items with location data
 */
const LocateMap = ({
  items = [],
  onItemClick,
  userLocation = null,
  searchRadius = 5000,
  showSearchRadius = false,
  filters = {},
  focusCoordinates = null,
  selectedItemId = null,
}) => {
  const [filteredItems, setFilteredItems] = useState(items);
  const [mapCenter, setMapCenter] = useState([51.505, -0.09]); // Default center
  const [selectedItem, setSelectedItem] = useState(null);
  const mapRef = useRef(null);
  const locationTagMap = useMemo(
    () => buildLocationTagMap(filteredItems),
    [filteredItems],
  );

  const groupedLocations = useMemo(() => {
    const groups = new Map();

    filteredItems.forEach((item) => {
      if (!item.coordinates?.coordinates) return;

      const key = getLocationKey(item);
      const existingGroup = groups.get(key);
      const [longitude, latitude] = item.coordinates.coordinates;

      if (existingGroup) {
        existingGroup.items.push(item);
        return;
      }

      groups.set(key, {
        key,
        tag: getLocationTag(item, locationTagMap),
        coordinates: [latitude, longitude],
        placeLabel: item.placeName || item.location || "Unknown place",
        items: [item],
      });
    });

    return Array.from(groups.values());
  }, [filteredItems, locationTagMap]);

  const selectedItemCoordinates = useMemo(() => {
    if (!selectedItem?.coordinates?.coordinates) return null;
    const [longitude, latitude] = selectedItem.coordinates.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    return [latitude, longitude];
  }, [selectedItem]);

  // Filter items based on category
  useEffect(() => {
    let filtered = items;

    if (filters.category && filters.category !== "all") {
      filtered = filtered.filter((item) => item.category === filters.category);
    }

    setFilteredItems(filtered);
  }, [items, filters]);

  // Set map center to user location if provided
  useEffect(() => {
    if (userLocation && userLocation.latitude && userLocation.longitude) {
      setMapCenter([userLocation.latitude, userLocation.longitude]);
    } else if (filteredItems.length > 0) {
      // Center on first item if no user location
      const firstItem = filteredItems[0];
      if (firstItem.coordinates?.coordinates) {
        const [lon, lat] = firstItem.coordinates.coordinates;
        setMapCenter([lat, lon]);
      }
    }
  }, [userLocation, filteredItems]);

  useEffect(() => {
    if (!selectedItemId) return;
    const target = filteredItems.find((item) => item._id === selectedItemId);
    if (target) {
      setSelectedItem(target);
    }
  }, [selectedItemId, filteredItems]);

  const handleViewDetails = (itemId) => {
    if (onItemClick) {
      onItemClick(itemId);
    }
  };

  const getLocationGroupColor = (group) => {
    const hasLost = group.items.some((item) => item.category === "lost");
    const hasFound = group.items.some((item) => item.category === "found");

    if (hasLost && hasFound) return "#2563EB";
    if (hasLost) return "#EF4444";
    if (hasFound) return "#16A34A";
    return "#334155";
  };

  const handleSelectItemFromGroup = (item) => {
    setSelectedItem(item);
  };

  return (
    <div className="w-full h-full rounded-lg overflow-hidden shadow-lg">
      <MapContainer
        ref={mapRef}
        center={mapCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <MapFocusController focusCoordinates={focusCoordinates} />

        {/* User Location Marker */}
        {userLocation && userLocation.latitude && userLocation.longitude && (
          <>
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={userLocationIcon}
            >
              <Popup>
                <div className="p-2">
                  <p className="font-semibold text-sm">Your Location</p>
                </div>
              </Popup>
            </Marker>

            {/* Search Radius Circle */}
            {showSearchRadius && (
              <Circle
                center={[userLocation.latitude, userLocation.longitude]}
                radius={searchRadius}
                color="#3B82F6"
                fillColor="#3B82F6"
                fillOpacity={0.1}
                weight={2}
              />
            )}
          </>
        )}

        {/* Grouped Location Markers (P1, P2, P3...) */}
        {groupedLocations.map((group) => (
          <Marker
            key={group.key}
            position={group.coordinates}
            icon={createLocationTagIcon(
              group.tag || "P",
              getLocationGroupColor(group),
            )}
          >
            <Popup>
              <LocationGroupPopup
                group={group}
                onSelectItem={handleSelectItemFromGroup}
              />
            </Popup>
          </Marker>
        ))}

        {/* Selected item marker for clear item-to-location mapping */}
        {selectedItemCoordinates && (
          <Marker
            position={selectedItemCoordinates}
            icon={createSelectedItemIcon(selectedItem?.itemName)}
            zIndexOffset={1000}
          >
            <Popup>
              <ItemInfoPopup
                item={selectedItem}
                onViewDetails={handleViewDetails}
                userLocation={userLocation}
                locationTag={getLocationTag(selectedItem, locationTagMap)}
              />
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Info Box when item is selected */}
      {selectedItem && (
        <div className="absolute bottom-4 right-4 z-10 bg-white rounded-lg shadow-lg p-4 w-80 max-h-[400px] overflow-y-auto">
          <button
            onClick={() => setSelectedItem(null)}
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
          <ItemInfoPopup
            item={selectedItem}
            onViewDetails={handleViewDetails}
            userLocation={userLocation}
            locationTag={getLocationTag(selectedItem, locationTagMap)}
          />
        </div>
      )}

      {/* Empty State */}
      {filteredItems.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-white rounded-lg shadow-lg p-4 text-center">
          <p className="text-gray-600">No items found in this area</p>
        </div>
      )}
    </div>
  );
};

export default LocateMap;
