// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&single=true&output=csv";
const UPDATE_INTERVAL = 60000; // 1 menit

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;
let isFirstLoad = true;

// ==================== FUNGSI UTAMA ====================

async function fetchAndProcessSaldo() {
    try {
        console.log("📡 [Balance] Mengambil dari Google Sheets...");
        
        // Gunakan cache busting
        const timestamp = new Date().getTime();
        const response = await fetch(`${SHEET_URL}&_=${timestamp}`, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }
        
        const csvData = await response.text();
        console.log("📄 [Balance] Data CSV diterima");
        
        // Parse CSV dan ambil baris ke-100 (indeks 99 karena 0-based)
        const rows = csvData.split('\n').filter(row => row.trim() !== '');
        
        if (rows.length < 100) {
            console.warn(`⚠️ [Balance] Hanya ada ${rows.length} baris, tidak mencapai baris 100`);
            return null;
        }
        
        // Ambil baris ke-100 (cell A100)
        const row100 = rows[99].trim(); // Baris ke-100 (indeks 99)
        console.log(`📊 [Balance] Baris 100: "${row100}"`);
        
        // Parse kolom dari baris (CSV menggunakan koma sebagai separator)
        const columns = row100.split(',');
        const cellA100 = columns[0] ? columns[0].trim() : ''; // Kolom A (indeks 0)
        
        console.log(`📍 [Balance] Cell A100: "${cellA100}"`);
        
        if (!cellA100 || cellA100 === '') {
            console.warn("⚠️ [Balance] Cell A100 kosong");
            return null;
        }
        
        // PROSES DATA dengan berbagai format
        let cleaned = cellA100;
        
        // 1. Hapus "Rp" jika ada (case insensitive)
        cleaned = cleaned.replace(/Rp\s*/gi, '');
        
        // 2. Hapus spasi
        cleaned = cleaned.replace(/\s/g, '');
        
        // 3. Hapus titik (ribuan separator)
        cleaned = cleaned.replace(/\./g, '');
        
        // 4. Ganti koma dengan titik untuk desimal (jika ada koma sebagai desimal)
        cleaned = cleaned.replace(/,(\d{1,2})$/, '.$1');
        
        // 5. Hapus karakter non-numerik kecuali titik dan minus
        cleaned = cleaned.replace(/[^\d.-]/g, '');
        
        console.log("🧹 [Balance] Setelah cleaning:", cleaned);
        
        if (!cleaned || cleaned === '' || cleaned === '-') {
            console.warn("⚠️ [Balance] Data kosong setelah cleaning");
            return null;
        }
        
        const numericValue = parseFloat(cleaned);
        
        if (isNaN(numericValue)) {
            console.error("❌ [Balance] Bukan angka:", cleaned);
            return null;
        }
        
        console.log(`✅ [Balance] Berhasil: ${numericValue}`);
        return numericValue;
        
    } catch (error) {
        console.error("❌ [Balance] Error fetch:", error.message);
        return null;
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
        
        if (newSaldo !== null) {
            // Simpan ke variabel global
            currentSaldo = newSaldo;
            lastUpdateTime = new Date();
            
            console.log(`💾 [Balance] Saldo disimpan: ${newSaldo}`);
            console.log(`⏰ [Balance] Terakhir update: ${lastUpdateTime.toLocaleTimeString()}`);
            
            // Format untuk display
            const formattedSaldo = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(newSaldo);
            
            // KIRIM EVENT ke script.js
            const event = new CustomEvent('balanceUpdated', {
                detail: {
                    saldo: newSaldo,
                    formatted: formattedSaldo,
                    timestamp: lastUpdateTime.toISOString(),
                    timeDisplay: lastUpdateTime.toLocaleTimeString(),
                    isFirstLoad: isFirstLoad
                }
            });
            window.dispatchEvent(event);
            
            if (isFirstLoad) {
                isFirstLoad = false;
            }
            
        } else {
            console.warn("⚠️ [Balance] Gagal mendapatkan saldo baru");
            
            // Kirim event error
            const errorEvent = new CustomEvent('balanceError', {
                detail: {
                    message: 'Gagal mengambil data saldo',
                    timestamp: new Date().toISOString()
                }
            });
            window.dispatchEvent(errorEvent);
        }
        
    } catch (error) {
        console.error("❌ [Balance] Error dalam update:", error);
        
        const errorEvent = new CustomEvent('balanceError', {
            detail: {
                message: error.message,
                timestamp: new Date().toISOString()
            }
        });
        window.dispatchEvent(errorEvent);
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
        // Tunggu DOM siap
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initBalance);
        } else {
            await initBalance();
        }
        
    } catch (error) {
        console.error("❌ [Balance] Error inisialisasi:", error);
    }
}

async function initBalance() {
    console.log("📦 [Balance] DOM siap, mulai setup...");
    
    try {
        // 1. Load pertama kali
        await updateSaldo();
        
        // 2. Setup auto-update setiap 1 menit
        updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
        console.log(`⏰ [Balance] Auto-update diatur (${UPDATE_INTERVAL/1000} detik)`);
        
        // 3. Update saat tab aktif kembali
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log("👁️ [Balance] Tab aktif, refresh...");
                updateSaldo();
            }
        });
        
        // 4. Update saat online kembali
        window.addEventListener('online', () => {
            console.log("🌐 [Balance] Online, refresh...");
            updateSaldo();
        });
        
        // 5. Error handling untuk fetch errors
        window.addEventListener('unhandledrejection', (event) => {
            if (event.reason && event.reason.message && 
                event.reason.message.includes('fetch')) {
                console.error("🌐 [Balance] Fetch error:", event.reason);
            }
        });
        
        isInitialized = true;
        console.log("✅ [Balance] Sistem siap!");
        
        // Kirim event bahwa balance.js siap
        const readyEvent = new CustomEvent('balanceReady', {
            detail: {
                timestamp: new Date().toISOString(),
                updateInterval: UPDATE_INTERVAL
            }
        });
        window.dispatchEvent(readyEvent);
        
    } catch (error) {
        console.error("❌ [Balance] Error inisialisasi:", error);
    }
}

// ==================== PUBLIC API ====================

// Ekspor fungsi yang bisa diakses script.js
window.BalanceSystem = {
    // Status
    isReady: () => isInitialized,
    isUpdating: () => isUpdating,
    
    // Data
    getCurrentSaldo: () => currentSaldo,
    getFormattedSaldo: () => {
        if (currentSaldo === null) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(currentSaldo);
    },
    getLastUpdateTime: () => lastUpdateTime,
    getLastUpdateDisplay: () => {
        if (!lastUpdateTime) return 'Belum ada data';
        return lastUpdateTime.toLocaleTimeString();
    },
    
    // Actions
    refresh: updateSaldo,
    forceRefresh: () => {
        console.log("🔧 [Balance] Manual refresh dipanggil");
        clearInterval(updateTimer);
        updateSaldo();
        updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
    },
    
    // Configuration
    setUpdateInterval: (newInterval) => {
        if (newInterval && typeof newInterval === 'number' && newInterval > 0) {
            clearInterval(updateTimer);
            UPDATE_INTERVAL = newInterval;
            updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
            console.log(`⏰ [Balance] Interval diubah menjadi ${UPDATE_INTERVAL/1000} detik`);
        }
    },
    
    // Debug
    debug: () => ({
        currentSaldo,
        lastUpdateTime: lastUpdateTime ? lastUpdateTime.toISOString() : null,
        lastUpdateDisplay: lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : null,
        isUpdating,
        isInitialized,
        isFirstLoad,
        updateInterval: UPDATE_INTERVAL
    })
};

// ==================== AUTO START ====================
// Tunggu sedikit sebelum mulai
setTimeout(() => {
    if (!isInitialized) {
        initialize().catch(console.error);
    }
}, 100);