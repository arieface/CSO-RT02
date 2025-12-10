[file name]: server-cache.js
[file content begin]
// ==================== SERVER CACHE PROXY ====================
// File: server-cache.js
// Skrip ini berjalan di server untuk caching data dari sumber utama

const SOURCE_SERVER_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";

let cachedData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 10000; // 10 detik cache

// Fungsi untuk mendapatkan data dengan cache
async function getCachedSaldoData() {
    const now = Date.now();
    
    // Jika cache masih fresh, gunakan cache
    if (cachedData && (now - lastFetchTime) < CACHE_DURATION) {
        console.log('📦 Menggunakan data cached');
        return {
            ...cachedData,
            cached: true,
            timestamp: new Date().toISOString()
        };
    }
    
    try {
        console.log('🌐 Fetching data dari sumber utama...');
        
        // Fetch dari server utama
        const response = await fetch(`${SOURCE_SERVER_URL}&_=${now}`, {
            headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} dari server utama`);
        }
        
        const text = await response.text();
        
        // Process data
        const processedData = processSaldoData(text);
        
        // Update cache
        cachedData = processedData;
        lastFetchTime = now;
        
        console.log('✅ Data diupdate dari server utama');
        
        return {
            ...processedData,
            cached: false,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ Error dari server utama:', error);
        
        // Jika error tapi ada cache, return cache
        if (cachedData) {
            console.log('⚠️ Menggunakan cache lama karena error');
            return {
                ...cachedData,
                cached: true,
                error: 'Menggunakan cache karena koneksi server utama bermasalah',
                timestamp: new Date().toISOString()
            };
        }
        
        throw error;
    }
}

// Fungsi processing data (sama dengan di client)
function processSaldoData(rawData) {
    let cleaned = rawData.trim();
    
    if (!cleaned) {
        throw new Error('Data kosong dari server');
    }
    
    // Format 1: Rp 1.234.567 atau 1.234.567
    if (cleaned.includes('.')) {
        cleaned = cleaned.replace(/Rp\s*/i, '');
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
    }
    // Format 2: 1,234,567 (format internasional)
    else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(/,/g, '');
    }
    
    if (!/^-?\d*\.?\d*$/.test(cleaned)) {
        throw new Error('Format data tidak valid');
    }
    
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue)) {
        throw new Error('Tidak dapat mengkonversi ke angka');
    }
    
    const formatted = new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(numericValue);
    
    return {
        raw: rawData,
        numeric: numericValue,
        formatted: formatted
    };
}

// Export untuk penggunaan sebagai module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getCachedSaldoData };
}
[file content end]
