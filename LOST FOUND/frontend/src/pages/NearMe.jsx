import React, { useMemo, useState, useEffect, useCallback } from "react";
import LocateMap from "../components/LocateMap";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config/api";
import {
  buildLocationTagMap,
  formatDistance,
  formatDuration,
  getTravelEstimate,
  getLocationTag,
} from "../utils/locationMath";

const NearMePage = () => {
  const navigate = useNavigate();
  const [nearbyItems, setNearbyItems] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchRadius, setSearchRadius] = useState(5000); // Default 5km in meters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isSearching, setIsSearching] = useState(false);

  // Get user's current location
  const getUserLocation = useCallback(() => {
    setIsLoading(true);
    setError(null);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserLocation(location);
          setIsLoading(false);
        },
        (err) => {
          setError(
            "Unable to retrieve your location. Please enable location services.",
          );
          console.error("Geolocation error:", err);
          setIsLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    } else {
      setError("Geolocation is not supported by your browser.");
      setIsLoading(false);
    }
  }, []);

  // Fetch nearby items
  const fetchNearbyItems = useCallback(async () => {
    if (!userLocation) {
      setError("Please enable location access first");
      return;
    }

    try {
      setIsSearching(true);
      setError(null);

      const payload = {
        longitude: userLocation.longitude,
        latitude: userLocation.latitude,
        radius: searchRadius,
        ...(categoryFilter !== "all" && { category: categoryFilter }),
      };

      const response = await fetch(`${API_BASE}/api/items/map/nearby`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch nearby items");
      }

      const data = await response.json();
      const itemsWithLocation = data.filter(
        (item) => item.coordinates?.coordinates,
      );
      setNearbyItems(itemsWithLocation);
    } catch (err) {
      console.error("Error fetching nearby items:", err);
      setError("Failed to load nearby items. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [userLocation, searchRadius, categoryFilter]);

  // Initial location setup
  useEffect(() => {
    getUserLocation();
  }, [getUserLocation]);

  // Auto-search when user location is available
  useEffect(() => {
    if (userLocation && nearbyItems.length === 0 && !isSearching) {
      fetchNearbyItems();
    }
  }, [userLocation, nearbyItems.length, isSearching, fetchNearbyItems]);

  // Handle item click
  const handleItemClick = (itemId) => {
    const clickedItem = nearbyItems.find(
      (item) => String(item._id) === String(itemId),
    );
    const targetPath =
      clickedItem?.category === "lost" ? "/lost-items" : "/found-items";

    navigate(`${targetPath}?itemId=${encodeURIComponent(itemId)}&open=1`);
  };

  // Radius options in km
  const radiusOptions = [
    { value: 1000, label: "1 km" },
    { value: 5000, label: "5 km" },
    { value: 10000, label: "10 km" },
    { value: 25000, label: "25 km" },
    { value: 50000, label: "50 km" },
  ];

  const stats = {
    total: nearbyItems.length,
    lost: nearbyItems.filter((i) => i.category === "lost").length,
    found: nearbyItems.filter((i) => i.category === "found").length,
  };

  const locationTagMap = useMemo(
    () => buildLocationTagMap(nearbyItems),
    [nearbyItems],
  );

  const getItemTravelEstimate = (item) =>
    userLocation ? getTravelEstimate(userLocation, item) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Find Items Near Me
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Discover lost and found items in your area
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Location Status */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              <p className="text-blue-600 font-medium">
                Getting your location...
              </p>
            </div>
          ) : userLocation ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <div>
                  <p className="text-green-700 font-medium">Location Found</p>
                  <p className="text-xs text-gray-600">
                    Latitude: {userLocation.latitude.toFixed(4)}, Longitude:{" "}
                    {userLocation.longitude.toFixed(4)}
                  </p>
                </div>
              </div>
              <button
                onClick={getUserLocation}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
              >
                Update Location
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <p className="font-medium">{error || "Location not available"}</p>
            </div>
          )}
        </div>

        {/* Search Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Search Options
          </h2>

          <div className="space-y-4">
            {/* Search Radius */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Radius
              </label>
              <div className="flex flex-wrap gap-2">
                {radiusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSearchRadius(option.value)}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      searchRadius === option.value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Category
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    categoryFilter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All Items
                </button>
                <button
                  onClick={() => setCategoryFilter("lost")}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    categoryFilter === "lost"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Lost Items
                </button>
                <button
                  onClick={() => setCategoryFilter("found")}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    categoryFilter === "found"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Found Items
                </button>
              </div>
            </div>

            {/* Search Button */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={fetchNearbyItems}
                disabled={!userLocation || isSearching}
                className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition font-medium"
              >
                {isSearching ? "Searching..." : "Search Nearby Items"}
              </button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        {nearbyItems.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
              <p className="text-gray-600 text-sm">Total Items</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
              <p className="text-gray-600 text-sm">Lost Items</p>
              <p className="text-3xl font-bold text-red-600">{stats.lost}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
              <p className="text-gray-600 text-sm">Found Items</p>
              <p className="text-3xl font-bold text-green-600">{stats.found}</p>
            </div>
          </div>
        )}

        {/* Map Container */}
        <div
          className="bg-white rounded-lg shadow overflow-hidden"
          style={{ height: "550px" }}
        >
          {!userLocation ? (
            <div className="h-full flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="text-4xl mb-2">📍</div>
                <p className="text-gray-600 font-medium mb-2">
                  Enable location to see nearby items
                </p>
                <button
                  onClick={getUserLocation}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Enable Location
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center bg-red-50">
              <div className="text-center">
                <div className="text-red-500 text-4xl mb-2">⚠️</div>
                <p className="text-red-600 font-medium">{error}</p>
              </div>
            </div>
          ) : nearbyItems.length === 0 && !isSearching ? (
            <div className="h-full flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-gray-600 font-medium">
                  No items found in the selected area
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Try increasing the search radius
                </p>
              </div>
            </div>
          ) : (
            <LocateMap
              items={nearbyItems}
              userLocation={userLocation}
              onItemClick={handleItemClick}
              filters={{ category: categoryFilter }}
              searchRadius={searchRadius}
              showSearchRadius={true}
            />
          )}
        </div>

        {/* Items List */}
        {nearbyItems.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Nearby Items ({stats.total})
              </h2>
              <p className="text-xs text-gray-500">
                Items from the same place share the same location tag like P1,
                P2, or P3.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyItems.map((item) => (
                <div
                  key={item._id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition cursor-pointer"
                  onClick={() => handleItemClick(item._id)}
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.itemName}
                      className="w-full h-40 object-cover rounded mb-3"
                      onError={(e) => {
                        e.target.src =
                          "https://via.placeholder.com/200?text=No+Image";
                      }}
                    />
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-800">
                        {item.itemName}
                      </h3>
                      {getLocationTag(item, locationTagMap) && (
                        <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                          Location {getLocationTag(item, locationTagMap)}
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-white text-xs font-bold ${
                        item.category === "lost" ? "bg-red-500" : "bg-green-500"
                      }`}
                    >
                      {item.category === "lost" ? "Lost" : "Found"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    📍 {item.placeName || item.location}
                  </p>
                  {getItemTravelEstimate(item) && (
                    <div className="mb-2 rounded-md bg-blue-50 p-2 text-xs text-blue-900">
                      <p className="font-semibold">
                        From your current location
                      </p>
                      <p>
                        Distance:{" "}
                        {formatDistance(getItemTravelEstimate(item).distanceKm)}
                      </p>
                      <p>
                        Walk time:{" "}
                        {formatDuration(
                          getItemTravelEstimate(item).walkingMinutes,
                        )}
                      </p>
                      <p>
                        Drive time:{" "}
                        {formatDuration(
                          getItemTravelEstimate(item).drivingMinutes,
                        )}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Posted on {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                  <button className="mt-3 w-full px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition">
                    View Full Details
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
          <h3 className="font-semibold text-blue-900 mb-2">
            💡 Privacy & Safety
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • Your exact location is only used for searching nearby items
            </li>
            <li>
              • Item locations are shown as approximate area names for privacy
            </li>
            <li>
              • Exact coordinates are kept secure and not displayed publicly
            </li>
            <li>
              • Contact item owners directly through the item details page
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NearMePage;
