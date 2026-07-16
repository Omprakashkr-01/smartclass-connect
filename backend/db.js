import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOCK_DB_PATH = path.join(__dirname, 'mock_db.json');

let client = null;
let db = null;
let isMock = false;
let MongoObjectId = null;

// Mock database state when MongoDB is not running
let mockData = {
  students: [],
  attendance: [],
  flagged_issues: []
};

// Load existing mock data if any
if (fs.existsSync(MOCK_DB_PATH)) {
  try {
    mockData = JSON.parse(fs.readFileSync(MOCK_DB_PATH, 'utf-8'));
  } catch (err) {
    console.error('Error reading mock_db.json, initializing fresh:', err.message);
  }
}

function saveMockData() {
  fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(mockData, null, 2), 'utf-8');
}

export async function connectDb() {
  if (config.useMockDb) {
    console.log('Database Mode: MOCK (Local mock_db.json)');
    isMock = true;
    return { isMock: true };
  }

  try {
    console.log(`Connecting to MongoDB at: ${config.mongoUri}...`);
    const { MongoClient, ObjectId } = await import('mongodb');
    client = new MongoClient(config.mongoUri, {
      serverSelectionTimeoutMS: 2000 // Quick timeout to failover to mock db if offline
    });
    await client.connect();
    db = client.db(config.dbName);
    MongoObjectId = ObjectId;
    console.log('Database Mode: MONGODB (Connected successfully)');
    isMock = false;
    return { isMock: false, client, db };
  } catch (err) {
    console.warn(`Failed to connect to MongoDB: ${err.message}. Falling back to MOCK database.`);
    isMock = true;
    return { isMock: true };
  }
}

export function getCollection(name) {
  if (isMock) {
    // Return a mock collection interface that replicates basic MongoDB driver methods
    return {
      find: (query = {}) => {
        let results = mockData[name] || [];
        // Support basic querying (e.g. date matching)
        results = results.filter(item => {
          for (let key in query) {
            if (query[key] !== undefined && item[key] !== query[key]) {
              // Basic date check if query contains string matching
              if (item[key] instanceof Date && typeof query[key] === 'string') {
                if (item[key].toISOString().split('T')[0] !== query[key]) return false;
              } else {
                return false;
              }
            }
          }
          return true;
        });
        
        return {
          toArray: async () => [...results]
        };
      },
      insertOne: async (doc) => {
        if (!mockData[name]) mockData[name] = [];
        const newDoc = { _id: Math.random().toString(36).substr(2, 9), ...doc };
        mockData[name].push(newDoc);
        saveMockData();
        return { acknowledged: true, insertedId: newDoc._id };
      },
      insertMany: async (docs) => {
        if (!mockData[name]) mockData[name] = [];
        const insertedDocs = docs.map(d => ({ _id: Math.random().toString(36).substr(2, 9), ...d }));
        mockData[name].push(...insertedDocs);
        saveMockData();
        return { acknowledged: true, insertedIds: insertedDocs.map(d => d._id) };
      },
      updateOne: async (query, update) => {
        const list = mockData[name] || [];
        const item = list.find(item => {
          for (let key in query) {
            if (item[key] !== query[key]) return false;
          }
          return true;
        });
        if (item) {
          if (update.$set) {
            Object.assign(item, update.$set);
          }
          saveMockData();
          return { acknowledged: true, modifiedCount: 1 };
        }
        return { acknowledged: true, modifiedCount: 0 };
      },
      deleteMany: async (query = {}) => {
        if (!mockData[name]) return { acknowledged: true, deletedCount: 0 };
        const initialCount = mockData[name].length;
        if (Object.keys(query).length === 0) {
          mockData[name] = [];
        } else {
          mockData[name] = mockData[name].filter(item => {
            for (let key in query) {
              if (item[key] === query[key]) return false; // delete matches
            }
            return true;
          });
        }
        saveMockData();
        return { acknowledged: true, deletedCount: initialCount - mockData[name].length };
      }
    };
  }

  // Real MongoDB collection
  return db.collection(name);
}

export function isMockDb() {
  return isMock;
}

export function convertId(id) {
  if (isMock || !MongoObjectId) {
    return id;
  }
  try {
    return new MongoObjectId(id);
  } catch (e) {
    return id;
  }
}
