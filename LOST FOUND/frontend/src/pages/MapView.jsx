import React, { useMemo, useState, useEffect, useCallback } from "react";
import LocateMap from "../components/LocateMap";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config/api";
import { buildLocationTagMap, getLocationTag } from "../utils/locationMath";

const MapViewPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showStats, setShowStats] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [focusCoordinates, setFocusCoordinates] = useState(null);

  const locationTagMap = useMemo(
    () => buildLocationTagMap(filteredItems),
    [filteredItems],
  );

  // Fetch items with location data
  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/items/map/all?limit=500`);
      if (!response.ok) {
        throw new Error("Failed to fetch items");
      }

      const data = await response.json();
      // Filter out items without coordinates
      const itemsWithLocation = data.filter(
        (item) => item.coordinates?.coordinates,
      );
      setItems(itemsWithLocation);
    } catch (err) {
      console.error("Error fetching items:", err);
      setError("Failed to load items. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get user's current location
  const getUserLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (err) => {
          console.warn("User location not available:", err);
        },
      );
    }
  }, []);

  // Initial fetch and location setup
  useEffect(() => {
    fetchItems();
    getUserLocation();
  }, [fetchItems, getUserLocation]);

  // Filter items based on category
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = items.filter((item) => {
      const categoryMatch =
        categoryFilter === "all" ? true : item.category === categoryFilter;
      const nameMatch = term
        ? (item.itemName || "").toLowerCase().includes(term)
        : true;
      return categoryMatch && nameMatch;
    });

    setFilteredItems(filtered);
  }, [items, categoryFilter, searchTerm]);

  // Handle item click to view details
  const handleItemClick = (itemId) => {
    const clickedItem = items.find(
      (item) => String(item._id) === String(itemId),
    );
    const targetPath =
      clickedItem?.category === "lost" ? "/lost-items" : "/found-items";

    navigate(`${targetPath}?itemId=${encodeURIComponent(itemId)}&open=1`);
  };

  const handleLocateItem = (item) => {
    if (!item?.coordinates?.coordinates) return;
    setSelectedItemId(item._id);
    setFocusCoordinates([...item.coordinates.coordinates]);
  };

  // Statistics
  const stats = {
    total: items.length,
    lost: items.filter((i) => i.category === "lost").length,
    found: items.filter((i) => i.category === "found").length,
  };

  const filterButtonClass = (key) =>
    `w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
      categoryFilter === key
        ? "bg-sky-500 text-white shadow-lg shadow-sky-900/40"
        : "bg-deep-surface text-slate-300 hover:bg-deep-elevated"
    }`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-deep-bg pt-24 text-slate-100">
      <div className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl border border-deep-border bg-deep-card/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80">
                Live Geolocation Board
              </p>
              <h1 className="mt-2 text-3xl font-black text-slate-100 md:text-4xl">
                Location Tracking
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Explore reported lost and found items on a map, filter quickly,
                and open details directly from each marker.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={fetchItems}
                className="rounded-xl border border-sky-500/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/30"
              >
                Refresh
              </button>
              <button
                onClick={() => setShowStats(!showStats)}
                className="rounded-xl border border-deep-border bg-deep-surface px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-deep-elevated"
              >
                {showStats ? "Hide" : "Show"} Stats
              </button>
              <button
                onClick={() => navigate("/post-item")}
                className="rounded-xl bg-gradient-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-gradient-accent-hover"
              >
                Post Item
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-5">
            {showStats && (
              <div className="rounded-2xl border border-deep-border bg-deep-card/70 p-4 shadow-xl shadow-black/25 backdrop-blur">
                <p className="mb-3 text-sm font-semibold text-slate-300">
                  Overview
                </p>
                <div className="space-y-2">
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                    <p className="text-xs text-cyan-200/80">Total</p>
                    <p className="text-2xl font-black text-cyan-200">
                      {stats.total}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
                    <p className="text-xs text-rose-200/80">Lost</p>
                    <p className="text-2xl font-black text-rose-200">
                      {stats.lost}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <p className="text-xs text-emerald-200/80">Found</p>
                    <p className="text-2xl font-black text-emerald-200">
                      {stats.found}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-deep-border bg-deep-card/70 p-4 shadow-xl shadow-black/25 backdrop-blur">
              <p className="mb-3 text-sm font-semibold text-slate-300">
                Filter by Type
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={filterButtonClass("all")}
                >
                  All Items ({stats.total})
                </button>
                <button
                  onClick={() => setCategoryFilter("lost")}
                  className={filterButtonClass("lost")}
                >
                  Lost Only ({stats.lost})
                </button>
                <button
                  onClick={() => setCategoryFilter("found")}
                  className={filterButtonClass("found")}
                >
                  Found Only ({stats.found})
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-deep-border bg-deep-card/70 p-4 shadow-xl shadow-black/25 backdrop-blur">
              <p className="mb-3 text-sm font-semibold text-slate-300">
                Find Item by Name
              </p>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search item name..."
                className="mb-3 w-full rounded-xl border border-deep-border bg-deep-surface px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-sky-400"
              />

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredItems.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No matching items with location.
                  </p>
                ) : (
                  filteredItems.slice(0, 80).map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => handleLocateItem(item)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        selectedItemId === item._id
                          ? "border-sky-400 bg-sky-500/20"
                          : "border-deep-border bg-deep-surface hover:bg-deep-elevated"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">
                            {item.itemName}
                          </p>
                          {getLocationTag(item, locationTagMap) && (
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                              Marker {getLocationTag(item, locationTagMap)}
                            </p>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            item.category === "lost"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          {item.category}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {item.placeName || item.location}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-deep-border bg-deep-card/70 p-4 text-sm text-slate-300 shadow-xl shadow-black/25 backdrop-blur">
              <p className="mb-2 font-semibold text-slate-200">Map Legend</p>
              <div className="space-y-2">
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-500" /> Lost Item
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500" /> Found
                  Item
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500" /> Claim
                  Requested
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-500" />
                  Verifying
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-gray-500" />
                  Returned
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-500" /> Your
                  Location
                </p>
              </div>
            </div>
          </aside>

          <section className="overflow-hidden rounded-2xl border border-deep-border bg-deep-card/70 shadow-2xl shadow-black/35 backdrop-blur">
            <div className="h-[70vh] min-h-[520px]">
              {isLoading ? (
                <div className="flex h-full items-center justify-center bg-deep-surface">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                    <p className="font-medium text-slate-300">
                      Loading location map...
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center bg-red-950/30">
                  <div className="text-center">
                    <p className="font-semibold text-red-300">{error}</p>
                    <button
                      onClick={fetchItems}
                      className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex h-full items-center justify-center bg-deep-surface">
                  <div className="text-center">
                    <p className="font-semibold text-slate-200">
                      No items found for this filter.
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Post a new item with map location or switch category.
                    </p>
                  </div>
                </div>
              ) : (
                <LocateMap
                  items={filteredItems}
                  userLocation={userLocation}
                  onItemClick={handleItemClick}
                  filters={{ category: categoryFilter }}
                  showSearchRadius={false}
                  selectedItemId={selectedItemId}
                  focusCoordinates={focusCoordinates}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MapViewPage;
