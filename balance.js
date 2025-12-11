// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 5000; // 5 detik

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;
let lastFetchTime = 0;
let consecutiveSameValues = 0;
let lastFetchValue = null;
let fetchAttemptCounter = 0;
let forceRefreshCount = 0; // Counter untuk force refresh
const MAX_FORCE_REFRESH = 3; // Maksimal force refresh berturut-turut

// ==================== FUNGSI UTAMA ====================

// Fungsi untuk memaksa refresh dengan berbagai metode
async function forceRealTimeRefresh() {
    console.log("🔥 [Balance] Memulai REAL-TIME refresh...");
    
    // Metode 1: Direct fetch dengan parameter unik
    const directFetch = async () => {
        const timestamp = new Date().getTime();
        const random = Math.floor(Math.random() * 100000);
        const uniqueId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        
        const url = `${SHEET_URL}&t=${timestamp}&r=${random}&u=${uniqueId}&force=1`;
        
        const response = await fetch(url, {
            cache: 'no-store',
            mode: 'cors',
            headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah (direct):", text);
        
        return processRawData(text);
    };
    
    // Metode 2: Fetch dengan format berbeda (HTML)
    const htmlFetch = async () => {
        const htmlUrl = SHEET_URL.replace('output=csv', 'output=html');
        const timestamp = new Date().getTime();
        const url = `${htmlUrl}&t=${timestamp}&force=2`;
        
        const response = await fetch(url, {
            cache: 'no-store',
            mode: 'cors',
            headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const html = await response.text();
        console.log("📄 [Balance] Data mentah (HTML):", html.substring(0, 100) + "...");
        
        // Ekstrak nilai dari HTML (metode yang lebih kompleks)
        const regex = /<td[^>]*>([^<]*)<\/td>/g;
        const matches = regex.exec(html);
        
        if (matches && matches.length > 1) {
            const cellValue = matches[1].replace(/<[^>]*>/g, '').trim();
            return processRawData(cellValue);
        }
        
        return null;
    };
    
    // Metode 3: Fetch dengan JSON format
    const jsonFetch = async () => {
        const jsonUrl = SHEET_URL.replace('output=csv', 'output=json');
        const timestamp = new Date().getTime();
        const url = `${jsonUrl}&t=${timestamp}&force=3`;
        
        try {
            const response = await fetch(url, {
                cache: 'no-store',
                mode: 'cors',
                headers: { 
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const json = await response.json();
            console.log("📄 [Balance] Data mentah (JSON):", json);
            
            if (json && json.table && json.table.rows && json.table.rows.length > 0) {
                const cellValue = json.table.rows[0].c[0] ? json.table.rows[0].c[0].v : null;
                return processRawData(cellValue);
            }
            
            return null;
        } catch (error) {
            console.warn("⚠️ [Balance] JSON fetch tidak didukung:", error.message);
            return null;
        }
    };
    
    // Coba semua metode secara berurutan
    const methods = [directFetch, htmlFetch, jsonFetch];
    
    for (let i = 0; i < methods.length; i++) {
        try {
            console.log(`🔄 [Balance] Mencoba metode ${i + 1}...`);
            const result = await methods[i]();
            
            if (result !== null) {
                console.log(`✅ [Balance] Berhasil dengan metode ${i + 1}: ${result}`);
                return result;
            }
        } catch (error) {
            console.error(`❌ [Balance] Error dengan metode ${i + 1}:`, error.message);
        }
    }
    
    console.error("❌ [Balance] Semua metode real-time refresh gagal");
    return null;
}

// Fungsi untuk memproses data mentah
function processRawData(text) {
    if (!text || text.trim() === '') {
        return null;
    }
    
    // Periksa error Google Sheets
    if (text.includes('#NAME?') || text.includes('#REF!') || text.includes('#VALUE!') || text.includes('#DIV/0!')) {
        console.error("❌ [Balance] Error dari Google Sheets:", text);
        return null;
    }
    
    // Bersihkan data
    let cleaned = text.trim();
    cleaned = cleaned.replace(/Rp\s*/i, '');
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(',', '.');
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    if (!cleaned || cleaned === '') {
        return null;
    }
    
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue)) {
        return null;
    }
    
    return numericValue;
}

async function fetchAndProcessSaldo() {
    try {
        console.log("📡 [Balance] Mengambil dari Google Sheets...");
        
        // Cache-busting yang lebih agresif dengan timestamp dan random
        const timestamp = new Date().getTime();
        const random = Math.floor(Math.random() * 10000);
        fetchAttemptCounter++;
        const urlWithCacheBuster = `${SHEET_URL}&_=${timestamp}&rand=${random}&attempt=${fetchAttemptCounter}`;
        
        const response = await fetch(urlWithCacheBuster, {
            cache: 'no-store',
            mode: 'cors',
            headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah:", text);
        
        const numericValue = processRawData(text);
        
        if (numericValue !== null) {
            lastFetchTime = Date.now();
            console.log(`✅ [Balance] Berhasil: ${numericValue}`);
            return numericValue;
        } else {
            // Jika data tidak valid, coba force refresh
            if (forceRefreshCount < MAX_FORCE_REFRESH) {
                forceRefreshCount++;
                console.log(`🔄 [Balance] Mencoba force refresh (${forceRefreshCount}/${MAX_FORCE_REFRESH})...`);
                return await forceRealTimeRefresh();
            } else {
                console.warn("⚠️ [Balance] Maksimal force refresh tercapai, menggunakan data yang ada");
                return currentSaldo;
            }
        }
        
    } catch (error) {
        console.error("❌ [Balance] Error fetch:", error.message);
        
        // Jika terjadi error, coba force refresh
        if (forceRefreshCount < MAX_FORCE_REFRESH) {
            forceRefreshCount++;
            console.log(`🔄 [Balance] Error, mencoba force refresh (${forceRefreshCount}/${MAX_FORCE_REFRESH})...`);
            return await forceRealTimeRefresh();
        } else {
            console.warn("⚠️ [Balance] Maksimal force refresh tercapai, menggunakan data yang ada");
            return currentSaldo;
        }
    }
}

async function updateSaldo() {
    if (isUpdating) {
        console.log("⏳ [Balance] Update sudah berjalan...");
        return;
    }
    
    isUpdating = true;
    console.log("🔄 [Balance] Memulai update...");
    
    try {
        const newSaldo = await fetchAndProcessSaldo();
        
        if (newSaldo !== null && newSaldo !== currentSaldo) {
            // Reset force refresh count jika berhasil
            forceRefreshCount = 0;
            
            // Simpan ke variabel global
            currentSaldo = newSaldo;
            lastUpdateTime = new Date().toISOString();
            
            console.log(`💾 [Balance] Saldo disimpan: ${newSaldo}`);
            
            // KIRIM EVENT ke script.js
            const event = new CustomEvent('balanceUpdated', {
                detail: {
                    saldo: newSaldo,
                    timestamp: lastUpdateTime,
                    formatted: new Intl.NumberFormat('id-ID').format(newSaldo),
                    isRealTime: true
                }
            });
            window.dispatchEvent(event);
        } else if (newSaldo !== null) {
            console.log(`📊 [Balance] Saldo tidak berubah: ${newSaldo}`);
            // Reset force refresh count jika tidak ada perubahan
            forceRefreshCount = 0;
        } else {
            console.warn("⚠️ [Balance] Gagal mendapatkan saldo baru");
        }
        
    } catch (error) {
        console.error("❌ [Balance] Error dalam update:", error);
    } finally {
        isUpdating = false;
        console.log("✅ [Balance] Update selesai");
    }
}

// ==================== INISIALISASI ====================

async function initialize() {
    if (isInitialized) {
        console.log("ℹ️ [Balance] Sudah diinisialisasi");
        return;
    }
    
    console.log("🚀 [Balance] Inisialisasi sistem...");
    
    try {
        if (document.readyState !== 'loading') {
            await initBalance();
        } else {
            document.addEventListener('DOMContentLoaded', initBalance);
        }
        
    } catch (error) {
        console.error("❌ [Balance] Error inisialisasi:", error);
    }
}

async function initBalance() {
    console.log("📦 [Balance] DOM siap, mulai setup...");
    
    // 1. Load pertama kali
    await updateSaldo();
    
    // 2. Setup auto-update setiap 5 detik
    updateTimer = setInterval(() => {
        console.log("⏰ [Balance] Interval update terpicu (5 detik)");
        updateSaldo();
    }, UPDATE_INTERVAL);
    console.log(`⏰ [Balance] Auto-update diatur (${UPDATE_INTERVAL/1000} detik)`);
    
    // 3. Update saat tab aktif
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ [Balance] Tab aktif, refresh...");
            forceRefreshCount = 0; // Reset counter saat tab aktif
            updateSaldo();
        }
    });
    
    // 4. Update saat online
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Online, refresh...");
        forceRefreshCount = 0; // Reset counter saat online
        updateSaldo();
    });
    
    isInitialized = true;
    console.log("✅ [Balance] Sistem siap!");
    
    const readyEvent = new CustomEvent('balanceReady');
    window.dispatchEvent(readyEvent);
}

// ==================== PUBLIC API ====================

window.BalanceSystem = {
    isReady: () => isInitialized,
    getCurrentSaldo: () => currentSaldo,
    getLastUpdateTime: () => lastUpdateTime,
    refresh: updateSaldo,
    forceRefresh: () => {
        console.log("🔧 [Balance] Manual force refresh");
        forceRefreshCount = 0; // Reset counter
        updateSaldo();
    },
    debug: () => ({
        currentSaldo,
        lastUpdateTime,
        isUpdating,
        isInitialized,
        lastFetchTime,
        fetchAttemptCounter,
        forceRefreshCount
    })
};

// ==================== AUTO START ====================
setTimeout(() => {
    initialize().catch(console.error);
}, 100);
