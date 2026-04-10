/**
 * db.js — IndexedDB wrapper for Trade Journal
 * All trade data is stored persistently in IndexedDB.
 */

const DB_NAME = 'TradeJournalDB';
const DB_VERSION = 1;
const STORE_TRADES = 'trades';
const STORE_SETTINGS = 'settings';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_TRADES)) {
        const tradesStore = database.createObjectStore(STORE_TRADES, { keyPath: 'id', autoIncrement: true });
        tradesStore.createIndex('date', 'entryDate', { unique: false });
        tradesStore.createIndex('instrument', 'instrument', { unique: false });
        tradesStore.createIndex('strategy', 'strategy', { unique: false });
        tradesStore.createIndex('outcome', 'outcome', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
        database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

async function addTrade(trade) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_TRADES, 'readwrite');
    const store = tx.objectStore(STORE_TRADES);
    trade.createdAt = trade.createdAt || new Date().toISOString();
    trade.updatedAt = new Date().toISOString();
    const request = store.add(trade);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateTrade(trade) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_TRADES, 'readwrite');
    const store = tx.objectStore(STORE_TRADES);
    trade.updatedAt = new Date().toISOString();
    const request = store.put(trade);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteTrade(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_TRADES, 'readwrite');
    const store = tx.objectStore(STORE_TRADES);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getTrade(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_TRADES, 'readonly');
    const store = tx.objectStore(STORE_TRADES);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllTrades() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_TRADES, 'readonly');
    const store = tx.objectStore(STORE_TRADES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function clearAllTrades() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_TRADES, 'readwrite');
    const store = tx.objectStore(STORE_TRADES);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function bulkAddTrades(trades) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_TRADES, 'readwrite');
    const store = tx.objectStore(STORE_TRADES);
    let count = 0;
    for (const trade of trades) {
      delete trade.id; // Let autoIncrement assign new IDs
      trade.createdAt = trade.createdAt || new Date().toISOString();
      trade.updatedAt = new Date().toISOString();
      store.add(trade);
      count++;
    }
    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

// Settings helpers
async function getSetting(key) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_SETTINGS, 'readonly');
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
}

async function setSetting(key, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_SETTINGS, 'readwrite');
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllSettings() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_SETTINGS, 'readonly');
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.getAll();
    request.onsuccess = () => {
      const settings = {};
      for (const item of (request.result || [])) {
        settings[item.key] = item.value;
      }
      resolve(settings);
    };
    request.onerror = () => reject(request.error);
  });
}
