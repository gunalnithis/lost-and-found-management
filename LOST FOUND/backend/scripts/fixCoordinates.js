/**
 * Migration Script: Fix coordinates format in PostItem collection
 * Run this once to fix any items that have incomplete or malformed coordinates
 * 
 * Usage: node fixCoordinates.js
 */

const mongoose = require('mongoose');
const PostItem = require('../models/PostItem');

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/lostfound';

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('✓ Connected to MongoDB');
    
    try {
      // Find items with incomplete coordinates
      const itemsToFix = await PostItem.find({
        $or: [
          { 'coordinates.coordinates': { $exists: false } },
          { 'coordinates.coordinates': { $size: 0 } },
          { 'coordinates.coordinates': null },
        ]
      });

      console.log(`\nFound ${itemsToFix.length} items with incomplete coordinates`);

      if (itemsToFix.length > 0) {
        // Delete the coordinates field from these items
        const result = await PostItem.updateMany(
          {
            $or: [
              { 'coordinates.coordinates': { $exists: false } },
              { 'coordinates.coordinates': { $size: 0 } },
              { 'coordinates.coordinates': null },
            ]
          },
          { $unset: { coordinates: '' } }
        );

        console.log(`\n✓ Removed ${result.modifiedCount} incomplete coordinate entries`);
      }

      // Verify geospatial index exists
      const indexes = await PostItem.collection.getIndexes();
      const geoIndexExists = Object.values(indexes).some(
        idx => idx.key && idx.key['coordinates'] === '2dsphere'
      );

      if (!geoIndexExists) {
        console.log('\n⚠️  Creating 2dsphere index for coordinates...');
        await PostItem.collection.createIndex({ 'coordinates': '2dsphere' });
        console.log('✓ 2dsphere index created');
      } else {
        console.log('\n✓ 2dsphere index already exists');
      }

      // Show statistics
      const stats = await PostItem.aggregate([
        {
          $facet: {
            totalItems: [{ $count: 'count' }],
            itemsWithCoordinates: [
              { $match: { 'coordinates.coordinates': { $exists: true, $ne: null } } },
              { $count: 'count' }
            ],
            itemsWithoutCoordinates: [
              { $match: { 'coordinates.coordinates': { $exists: false } } },
              { $count: 'count' }
            ]
          }
        }
      ]);

      const [data] = stats;
      console.log('\n📊 Coordinates Statistics:');
      console.log(`   Total items: ${data.totalItems[0]?.count || 0}`);
      console.log(`   Items with coordinates: ${data.itemsWithCoordinates[0]?.count || 0}`);
      console.log(`   Items without coordinates: ${data.itemsWithoutCoordinates[0]?.count || 0}`);

      // Sample valid coordinates
      const sample = await PostItem.findOne(
        { 'coordinates.coordinates': { $exists: true, $ne: null } },
        { itemName: 1, location: 1, coordinates: 1 }
      );

      if (sample) {
        console.log('\n📍 Sample item with valid coordinates:');
        console.log(`   Item: ${sample.itemName}`);
        console.log(`   Coordinates: ${sample.coordinates.coordinates.join(', ')}`);
      }

      console.log('\n✅ Migration completed successfully!\n');
      
    } catch (error) {
      console.error('❌ Migration error:', error.message);
    } finally {
      mongoose.connection.close();
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  });
