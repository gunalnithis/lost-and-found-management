const PostItem = require('../models/PostItem');
const Item = require('../models/Item');
const User = require('../models/User');
const { sanitizeItemForPublic, getApproximatePlaceName } = require('../utils/locationPrivacy');

const TRACKING_STATUSES = ['found', 'contacted', 'claim_requested', 'verifying', 'returned'];

const trackingStatusLabels = {
  found: 'Found',
  contacted: 'Contacted',
  claim_requested: 'Claim Requested',
  verifying: 'Verifying',
  returned: 'Returned',
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureFoundTimeline = (item) => {
  if (!item || item.category !== 'found') return item;

  const safeTimeline = Array.isArray(item.timeline) ? [...item.timeline] : [];
  const hasFoundEntry = safeTimeline.some((entry) => entry?.status === 'found');

  if (!hasFoundEntry) {
    safeTimeline.unshift({
      status: 'found',
      timestamp: item.createdAt || new Date(),
      note: 'Item posted as found.',
    });
  }

  const effectiveTrackingStatus =
    item.trackingStatus || safeTimeline[safeTimeline.length - 1]?.status || 'found';

  item.timeline = safeTimeline;
  item.trackingStatus = effectiveTrackingStatus;
  return item;
};

const appendTrackingEntry = (item, status, note = '') => {
  if (!item || item.category !== 'found') return;
  if (!TRACKING_STATUSES.includes(status)) return;

  ensureFoundTimeline(item);

  const lastStatus = item.timeline[item.timeline.length - 1]?.status;
  const statusAlreadyCurrent = item.trackingStatus === status || lastStatus === status;

  item.trackingStatus = status;
  if (statusAlreadyCurrent) {
    return;
  }

  item.timeline.push({
    status,
    timestamp: new Date(),
    note: note || `${trackingStatusLabels[status]} stage reached.`,
  });
};

const searchItemsByCriteria = async ({ itemName = '', color = '', location = '', intent = 'find_lost' } = {}) => {
  const nameTrim = String(itemName).trim();
  const colorTrim = String(color).trim();
  const locTrim = String(location).trim();

  if (!nameTrim && !colorTrim && !locTrim) {
    return [];
  }

  const hasPostItems = await PostItem.exists({});
  const hasItems = await Item.exists({});

  if (!hasPostItems && !hasItems) {
    await Item.insertMany([
      {
        name: 'Black Wallet',
        color: 'black',
        location: 'Library Block A',
        image: '',
      },
      {
        name: 'Blue Backpack',
        color: 'blue',
        location: 'Cafeteria',
        image: '',
      },
      {
        name: 'Silver Water Bottle',
        color: 'silver',
        location: 'Gym Entrance',
        image: '',
      },
    ]);
  }

  const category = intent === 'report_found' ? 'lost' : 'found';
  const andClauses = [{ status: 'approved' }, { category: category }];

  if (nameTrim) {
    const itemNameRe = new RegExp(escapeRegex(nameTrim), 'i');
    andClauses.push({
      $or: [{ itemName: itemNameRe }, { name: itemNameRe }],
    });
  }
  if (locTrim) {
    andClauses.push({ location: new RegExp(escapeRegex(locTrim), 'i') });
  }
  if (colorTrim) {
    const colorRe = new RegExp(escapeRegex(colorTrim), 'i');
    andClauses.push({
      $or: [{ color: colorRe }, { description: colorRe }, { itemName: colorRe }, { name: colorRe }],
    });
  }

  const limit = 20;
  const postItems = await PostItem.find({ $and: andClauses })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const fallbackFilter = {};
  if (nameTrim) {
    fallbackFilter.name = new RegExp(escapeRegex(nameTrim), 'i');
  }
  if (locTrim) {
    fallbackFilter.location = new RegExp(escapeRegex(locTrim), 'i');
  }
  if (colorTrim) {
    fallbackFilter.color = new RegExp(escapeRegex(colorTrim), 'i');
  }

  const basicItems = await Item.find(fallbackFilter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const normalizedBasicItems = basicItems.map((it) => ({
    _id: it._id,
    itemName: it.name,
    name: it.name,
    color: it.color,
    location: it.location,
    image: it.image,
    category,
    description: '',
    status: 'approved',
  }));

  return [...postItems, ...normalizedBasicItems].slice(0, limit);
};

const createItem = async (req, res) => {
  try {
    const {
      itemName,
      category,
      description,
      location,
      email,
      contactNumber,
      image,
      coordinates,
      placeName,
    } = req.body;

    // 🔥 Safe fallback
    let finalEmail = (email || req.body.email || '').trim();
    let finalContactNumber = (contactNumber || req.body.contactNumber || '').trim();

    if ((!finalEmail || !finalContactNumber) && req.user?._id) {
      const user = await User.findById(req.user._id).select('email phone');
      if (!finalEmail) finalEmail = user?.email || '';
      if (!finalContactNumber) finalContactNumber = user?.phone || '';
    }

    if (!finalEmail || !finalContactNumber) {
      return res.status(400).json({
        message: 'Email and contact number are required.',
      });
    }

    // Handle coordinates if provided
    let itemCoordinates = undefined;
    if (coordinates) {
      // Accept both formats: {longitude, latitude} and proper GeoJSON
      let lon, lat;
      
      if (coordinates.coordinates && Array.isArray(coordinates.coordinates)) {
        // Already in GeoJSON format: {type: 'Point', coordinates: [lon, lat]}
        [lon, lat] = coordinates.coordinates;
      } else if (coordinates.longitude !== undefined && coordinates.latitude !== undefined) {
        // Format from frontend: {longitude, latitude}
        lon = coordinates.longitude;
        lat = coordinates.latitude;
      }
      
      if (lon !== undefined && lat !== undefined) {
        // Validate coordinates
        if (typeof lon !== 'number' || typeof lat !== 'number') {
          console.error('Invalid coordinate types:', typeof lon, typeof lat);
          return res.status(400).json({
            message: 'Coordinates must be valid numbers',
          });
        }
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          console.error('Coordinates out of range:', lon, lat);
          return res.status(400).json({
            message: 'Coordinates out of bounds. Longitude: -180 to 180, Latitude: -90 to 90',
          });
        }
        
        itemCoordinates = {
          type: 'Point',
          coordinates: [lon, lat],
        };
        console.log('✓ Valid coordinates set:', itemCoordinates);
      }
    }

    const item = await PostItem.create({
      itemName,
      category,
      description,
      location,
      email: finalEmail,
      contactNumber: finalContactNumber,
      image,
      userId: req.user._id,
      status: 'approved',
      placeName: placeName || location,
      ...(itemCoordinates && { coordinates: itemCoordinates }),
      ...(category === 'found'
        ? {
            trackingStatus: 'found',
            timeline: [
              {
                status: 'found',
                timestamp: new Date(),
                note: 'Item posted as found.',
              },
            ],
          }
        : {}),
    });

    // Extra validation after save
    if (itemCoordinates && (!item.coordinates || !item.coordinates.coordinates)) {
      console.error('⚠️  Coordinates were set but not saved properly!');
      console.error('Expected:', itemCoordinates);
      console.error('Got:', item.coordinates);
    }

    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getItems = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const includeTotal = req.query.includeTotal === 'true';
    const [items, totalItems] = await Promise.all([
      PostItem.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      includeTotal ? PostItem.countDocuments({}) : Promise.resolve(null),
    ]);

    if (includeTotal && totalItems !== null) {
      res.set('X-Total-Count', String(totalItems));
    }

    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getItemStats = async (req, res) => {
  try {
    const [totalItems, lostCount, foundCount, pendingItems, approvedItems] =
      await Promise.all([
        PostItem.countDocuments({}),
        PostItem.countDocuments({ category: 'lost' }),
        PostItem.countDocuments({ category: 'found' }),
        PostItem.countDocuments({ status: 'pending' }),
        PostItem.countDocuments({ status: 'approved' }),
      ]);

    res.json({
      totalItems,
      pendingItems,
      approvedItems,
      lostCount,
      foundCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/items/search — public chatbot & guest search.
 * Body: { itemName?, color?, location?, intent?: 'find_lost' | 'report_lost' | 'report_found' }
 */
const searchItems = async (req, res) => {
  try {
    const body = req.body || {};
    const mergedItems = await searchItemsByCriteria(body);

    return res.status(200).json(mergedItems);
  } catch (error) {
    return res.status(500).json({
      message: 'Unable to search items right now.',
      error: error.message,
    });
  }
};

const getItemsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const items = await PostItem.find({ category })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (category !== 'found') {
      return res.json(items);
    }

    const normalized = items.map((item) => ensureFoundTimeline(item));
    res.json(normalized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getFoundTimelineOverview = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 6, 20);
    const foundItems = await PostItem.find({ category: 'found' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('itemName category location trackingStatus timeline createdAt')
      .lean();

    const normalizedItems = foundItems.map((item) => ensureFoundTimeline(item));
    const statusCounts = TRACKING_STATUSES.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});

    normalizedItems.forEach((item) => {
      const status = item.trackingStatus || 'found';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const items = normalizedItems.map((item) => {
      const stepIndex = TRACKING_STATUSES.indexOf(item.trackingStatus || 'found');
      const progressPercent =
        stepIndex < 0
          ? 0
          : Math.round((stepIndex / (TRACKING_STATUSES.length - 1)) * 100);
      const safeTimeline = Array.isArray(item.timeline) ? item.timeline : [];
      const lastTimelineEntry = safeTimeline[safeTimeline.length - 1] || null;

      return {
        _id: item._id,
        itemName: item.itemName,
        location: item.location,
        currentStatus: item.trackingStatus || 'found',
        progressPercent,
        lastUpdated: lastTimelineEntry?.timestamp || item.createdAt,
        timeline: safeTimeline,
      };
    });

    return res.status(200).json({
      steps: TRACKING_STATUSES.map((status) => ({
        key: status,
        label: trackingStatusLabels[status],
      })),
      statusCounts,
      items,
    });
  } catch (error) {
    console.error('getFoundTimelineOverview error:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getItemTimeline = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await PostItem.findById(id)
      .select('itemName category status trackingStatus timeline createdAt')
      .lean();

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.category !== 'found') {
      return res.status(400).json({ message: 'Timeline is available for found items only' });
    }

    const normalized = ensureFoundTimeline(item);

    return res.status(200).json({
      itemId: normalized._id,
      itemName: normalized.itemName,
      moderationStatus: normalized.status,
      currentStatus: normalized.trackingStatus,
      timeline: normalized.timeline,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateItemTrackingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body || {};

    if (!TRACKING_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid tracking status. Allowed values: ${TRACKING_STATUSES.join(', ')}`,
      });
    }

    const item = await PostItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.category !== 'found') {
      return res.status(400).json({ message: 'Tracking status is available for found items only' });
    }

    appendTrackingEntry(item, status, note);
    await item.save();

    return res.status(200).json({
      message: 'Tracking status updated successfully',
      item,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getItemsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!req.user || (String(req.user._id) !== String(userId) && !req.user.isAdmin)) {
      return res.status(403).json({ message: 'Not authorized to view these items' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const items = await PostItem.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await PostItem.findById(id);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const allowedFields = [
      'itemName',
      'category',
      'description',
      'location',
      'status',
      'email',
      'contactNumber',
      'image',
      'placeName',
      'coordinates',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'coordinates') {
          // Validate and format coordinates
          const coords = req.body[field];
          if (coords) {
            let lon, lat;
            
            if (coords.coordinates && Array.isArray(coords.coordinates)) {
              // Already in GeoJSON format
              [lon, lat] = coords.coordinates;
            } else if (coords.longitude !== undefined && coords.latitude !== undefined) {
              // Format from frontend
              lon = coords.longitude;
              lat = coords.latitude;
            }
            
            if (lon !== undefined && lat !== undefined &&
                typeof lon === 'number' && typeof lat === 'number' &&
                lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
              item[field] = {
                type: 'Point',
                coordinates: [lon, lat],
              };
            } else if (!(lon !== undefined && lat !== undefined)) {
              // Only warn if coordinates were provided but incomplete
              console.warn('Invalid coordinates provided:', coords);
            }
          }
        } else {
          item[field] = req.body[field];
        }
      }
    });

    const updatedItem = await item.save();
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await PostItem.findById(id);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    await item.deleteOne();
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/items/map/all
 * Get all items with location data for map display (without exact coordinates for privacy)
 */
const getItemsForMap = async (req, res) => {
  try {
    const { category } = req.query; // 'lost', 'found', or undefined for all
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 500);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

    const filter = { status: 'approved' };
    if (category && ['lost', 'found'].includes(category)) {
      filter.category = category;
    }

    const items = await PostItem.find(filter)
      .select('itemName category trackingStatus status location placeName createdAt image userId email coordinates')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Sanitize items for public display (privacy protection)
    const publicItems = items.map(item => {
      const sanitized = sanitizeItemForPublic(item, false); // false = obfuscate coordinates
      // Ensure placeName is set
      if (!sanitized.placeName && item.location) {
        sanitized.placeName = getApproximatePlaceName(
          item.coordinates?.coordinates?.[1],
          item.coordinates?.coordinates?.[0],
          item.location
        );
      }
      return sanitized;
    });

    res.json(publicItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/items/map/nearby
 * Get items near a location using geospatial query
 * Body: { longitude, latitude, radius (in meters), category? }
 */
const getNearbyItems = async (req, res) => {
  try {
    const { longitude, latitude, radius = 5000, category } = req.body;

    if (longitude === undefined || latitude === undefined) {
      return res.status(400).json({ message: 'Longitude and latitude are required' });
    }

    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return res.status(400).json({ message: 'Invalid coordinates' });
    }

    const filter = {
      status: 'approved',
      'coordinates.type': 'Point',
      'coordinates.coordinates.0': { $type: 'number' },
      'coordinates.coordinates.1': { $type: 'number' },
      coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: radius, // in meters
        },
      },
    };

    if (category && ['lost', 'found'].includes(category)) {
      filter.category = category;
    }

    const items = await PostItem.find(filter)
      .select('itemName category trackingStatus status location placeName createdAt image userId email coordinates')
      .limit(50)
      .lean();

    // Sanitize items for public display (privacy protection)
    const publicItems = items.map(item => {
      const sanitized = sanitizeItemForPublic(item, false); // false = obfuscate coordinates
      // Ensure placeName is set
      if (!sanitized.placeName && item.location) {
        sanitized.placeName = getApproximatePlaceName(
          item.coordinates?.coordinates?.[1],
          item.coordinates?.coordinates?.[0],
          item.location
        );
      }
      return sanitized;
    });

    res.json(publicItems);
  } catch (error) {
    // Self-heal malformed legacy docs that have { type: 'Point' } without coordinates array.
    if (String(error?.message || '').includes('Can\'t extract geo keys')) {
      await PostItem.updateMany(
        {
          'coordinates.type': 'Point',
          $or: [
            { 'coordinates.coordinates': { $exists: false } },
            { 'coordinates.coordinates': null },
            { 'coordinates.coordinates': [] },
          ],
        },
        { $unset: { coordinates: 1 } }
      );

      return res.status(409).json({
        message: 'Malformed location records were detected and cleaned. Please retry your request.',
      });
    }

    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /api/items/:id/location
 * Update item with precise coordinates and place name
 * Body: { coordinates: { longitude, latitude }, placeName }
 */
const updateItemLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { coordinates, placeName } = req.body;

    const item = await PostItem.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify user authorization
    if (String(item.userId) !== String(req.user._id) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to update this item' });
    }

    if (coordinates) {
      let lon, lat;
      
      if (coordinates.coordinates && Array.isArray(coordinates.coordinates)) {
        // Already in GeoJSON format
        [lon, lat] = coordinates.coordinates;
      } else if (coordinates.longitude !== undefined && coordinates.latitude !== undefined) {
        // Format from frontend
        lon = coordinates.longitude;
        lat = coordinates.latitude;
      }
      
      if (lon === undefined || lat === undefined) {
        return res.status(400).json({ message: 'Longitude and latitude are required' });
      }
      
      if (typeof lon !== 'number' || typeof lat !== 'number') {
        return res.status(400).json({ message: 'Coordinates must be valid numbers' });
      }
      
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return res.status(400).json({ message: 'Invalid coordinates. Longitude: -180 to 180, Latitude: -90 to 90' });
      }

      item.coordinates = {
        type: 'Point',
        coordinates: [lon, lat],
      };
    }

    if (placeName) {
      item.placeName = placeName.trim();
    }

    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  appendTrackingEntry,
  createItem,
  getItems,
  getItemStats,
  searchItemsByCriteria,
  searchItems,
  getItemsByCategory,
  getFoundTimelineOverview,
  getItemTimeline,
  getItemsByUser,
  updateItemTrackingStatus,
  updateItem,
  deleteItem,
  getItemsForMap,
  getNearbyItems,
  updateItemLocation,
};
