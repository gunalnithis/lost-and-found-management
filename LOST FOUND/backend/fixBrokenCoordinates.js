/**
 * URGENT FIX: Remove all incomplete coordinates from database
 * This uses native MongoDB driver to avoid any Mongoose middleware issues
 * 
 * Usage: node fixBrokenCoordinates.js
 */

const mongoose = require('mongoose');

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/test';

async function fixCoordinates() {
  try {
    await mongoose.connect(mongoUri);
    
    console.log('✓ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const collection = db.collection('postitems');

    // Step 1: Find all items with incomplete/broken coordinates
    console.log('🔍 Searching for items with incomplete coordinates...\n');
    
    const brokenItems = await collection
      .find({
        $or: [
          // Coordinates object exists but coordinates array is missing
          {
            $and: [
              { coordinates: { $exists: true } },
              { 'coordinates.coordinates': { $exists: false } },
            ],
          },
          // Coordinates array is null
          { 'coordinates.coordinates': null },
          // Coordinates array is empty
          { 'coordinates.coordinates': [] },
        ],
      })
      .toArray();

    console.log(`Found ${brokenItems.length} items with incomplete coordinates`);

    if (brokenItems.length > 0) {
      console.log('\nSample broken item:');
      console.log(`  Item: ${brokenItems[0].itemName}`);
      console.log(`  Coordinates: ${JSON.stringify(brokenItems[0].coordinates)}`);
    }

    // Step 2: Remove incomplete coordinates
    if (brokenItems.length > 0) {
      console.log('\n🔧 Removing incomplete coordinates...');
      
      const result = await collection.updateMany(
        {
          $or: [
            {
              $and: [
                { coordinates: { $exists: true } },
                { 'coordinates.coordinates': { $exists: false } },
              ],
            },
            { 'coordinates.coordinates': null },
            { 'coordinates.coordinates': [] },
          ],
        },
        { $unset: { coordinates: 1 } }
      );

      console.log(`✓ Removed coordinates from ${result.modifiedCount} items\n`);
    }

    // Step 3: Verify geospatial index
    console.log('📍 Checking geospatial index...');
    // Try to get all indexes in a different way
    const indexList = await collection.listIndexes().toArray();
    const geoIndexExists = indexList.some(
      idx => idx.key && idx.key.coordinates === '2dsphere'
    );

    if (!geoIndexExists) {
      console.log('⚠️  Creating 2dsphere index...');
      try {
        await collection.createIndex({ coordinates: '2dsphere' });
        console.log('✓ 2dsphere index created\n');
      } catch (err) {
        console.log(`Note: ${err.message}\n`);
      }
    } else {
      console.log('✓ 2dsphere index exists\n');
    }

    // Step 4: Statistics
    console.log('📊 Final Statistics:');
    const stats = await collection
      .aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            withCoordinates: [
              {
                $match: {
                  'coordinates.coordinates': { $exists: true, $type: 'array' },
                },
              },
              { $count: 'count' },
            ],
            withoutCoordinates: [
              {
                $match: {
                  coordinates: { $exists: false },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ])
      .toArray();

    const [data] = stats;
    console.log(`   Total items: ${data.total[0]?.count || 0}`);
    console.log(
      `   Items with valid coordinates: ${data.withCoordinates[0]?.count || 0}`
    );
    console.log(
      `   Items without coordinates: ${data.withoutCoordinates[0]?.count || 0}`
    );

    // Step 5: Sample valid item
    console.log('\n📋 Sample valid item (if any):');
    const validItem = await collection.findOne({
      'coordinates.coordinates': { $exists: true, $type: 'array' },
    });

    if (validItem) {
      console.log(`   Item: ${validItem.itemName}`);
      console.log(`   Location: ${validItem.location}`);
      console.log(`   Coordinates: [${validItem.coordinates.coordinates.join(', ')}]`);
    } else {
      console.log(
        '   No items with valid coordinates yet (create an item with location to test)'
      );
    }

    console.log('\n✅ Database cleanup completed!\n');
    console.log('Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Create a new item with location coordinates');
    console.log('3. Try the /map/nearby endpoint\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure MongoDB is running');
    console.error('2. Check MONGO_URI environment variable');
    console.error('3. Verify you have write permissions to the database');
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

fixCoordinates();
