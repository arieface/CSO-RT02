// ==================== KONFIGURASI ====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const STORAGE_KEY = 'kas_rt02_rw18_saldo_data';
const UPDATE_INTERVAL = 300000; // 5 menit dalam milidetik

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let isUpdating = false;
let updateTimer = null;

// ==================== FUNGSI UTAMA ====================

/**
 * Mengambil data saldo dari Google Sheets
 * @returns {Promise<number|null>} Nilai saldo atau null jika gagal
 */
async function fetchSaldoFromSheet() {
    try {
        console.log("📡 Mengambil data saldo dari Google Sheets...");
        
        const timestamp = new Date().getTime();
        const response = await fetch(`${SHEET_URL}&_=${timestamp}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        console.log("✅ Data mentah diterima:", text);
        
        // Proses data mentah menjadi angka
        const saldo = processSaldoData(text);
        
        if (saldo !== null) {
            console.log(`💰 Saldo berhasil diproses: ${saldo}`);
            return saldo;
        } else {
            throw new Error('Gagal memproses data saldo');
        }
        
    } catch (error) {
        console.error("❌ Error mengambil data:", error.message);
        return null;
    }
}

/**
 * Memproses data mentah dari sheet menjadi angka
 * @param {string} rawData - Data mentah dari sheet
 * @returns {number|null} Nilai saldo yang sudah diproses
 */
function processSaldoData(rawData) {
    if (!rawData || rawData.trim() === '') {
        console.warn("⚠️ Data kosong dari sheet");
        return null;
    }
    
    let cleaned = rawData.trim();
    
    // Hapus karakter non-numerik kecuali titik, koma, dan minus
    // Format 1: Rp 1.234.567
    if (cleaned.toLowerCase().includes('rp')) {
        cleaned = cleaned.replace(/rp\s*/i, '');
    }
    
    // Hapus semua titik (pemisah ribuan)
    cleaned = cleaned.replace(/\./g, '');
    
    // Ganti koma dengan titik untuk desimal (format Indonesia)
    cleaned = cleaned.replace(',', '.');
    
    // Hapus karakter non-numerik selain minus dan titik desimal
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    // Konversi ke number
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue)) {
        console.error("❌ Tidak dapat mengkonversi ke angka:", cleaned);
        return null;
    }
    
    return numericValue;
}

/**
 * Menyimpan saldo ke localStorage
 * @param {number} saldo - Nilai saldo yang akan disimpan
 */
function saveSaldoToStorage(saldo) {
    try {
        const saldoData = {
            value: saldo,
            timestamp: new Date().toISOString(),
            lastUpdated: Date.now()
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saldoData));
        console.log(`💾 Saldo disimpan: ${saldo} pada ${saldoData.timestamp}`);
        
        // Update variabel global
        currentSaldo = saldo;
        
        // Dispatch event untuk memberi tahu script.js bahwa ada data baru
        const event = new CustomEvent('saldoUpdated', { 
            detail: { saldo: saldo, timestamp: saldoData.timestamp } 
        });
        window.dispatchEvent(event);
        
        return true;
    } catch (error) {
        console.error("❌ Error menyimpan ke localStorage:", error);
        return false;
    }
}

/**
 * Mengambil saldo dari localStorage
 * @returns {object|null} Data saldo yang tersimpan
 */
function getSaldoFromStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return null;
        
        const saldoData = JSON.parse(data);
        
        // Validasi data
        if (typeof saldoData.value !== 'number' || 
            !saldoData.timestamp || 
            !saldoData.lastUpdated) {
            console.warn("⚠️ Data di localStorage tidak valid");
            return null;
        }
        
        return saldoData;
    } catch (error) {
        console.error("❌ Error membaca dari localStorage:", error);
        return null;
    }
}

/**
 * Memperbarui saldo dari Google Sheets dan menyimpannya
 */
async function updateSaldo() {
    if (isUpdating) {
        console.log("⏳ Update sedang berjalan, tunggu...");
        return;
    }
    
    isUpdating = true;
    console.log("🔄 Memulai proses update saldo...");
    
    try {
        const newSaldo = await fetchSaldoFromSheet();
        
        if (newSaldo !== null) {
            const storedData = getSaldoFromStorage();
            
            // Cek apakah ada perubahan nilai
            if (!storedData || storedData.value !== newSaldo) {
                console.log(`🔄 Nilai berubah dari ${storedData ? storedData.value : 'null'} ke ${newSaldo}`);
                saveSaldoToStorage(newSaldo);
            } else {
                console.log("✅ Nilai tidak berubah, tidak perlu update");
                // Tetap update timestamp untuk menandakan data masih fresh
                saveSaldoToStorage(newSaldo);
            }
        } else {
            console.warn("⚠️ Gagal mendapatkan saldo baru, tetap gunakan data lama");
        }
    } catch (error) {
        console.error("❌ Error dalam proses update:", error);
    } finally {
        isUpdating = false;
        console.log("✅ Proses update selesai");
    }
}

/**
 * Mendapatkan URL untuk diakses oleh script.js
 * @returns {string} URL dengan data terbaru
 */
function getSaldoDataURL() {
    const storedData = getSaldoFromStorage();
    
    if (storedData) {
        // Format data sebagai CSV sederhana
        const csvData = storedData.value.toString();
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        // Clean up URL sebelumnya jika ada
        if (window.previousSaldoURL) {
            URL.revokeObjectURL(window.previousSaldoURL);
        }
        
        window.previousSaldoURL = url;
        return url;
    }
    
    // Fallback ke Google Sheets jika tidak ada data di localStorage
    console.warn("⚠️ Tidak ada data di localStorage, menggunakan Google Sheets langsung");
    return SHEET_URL;
}

/**
 * Mendapatkan saldo terkini
 * @returns {number|null} Nilai saldo saat ini
 */
function getCurrentSaldo() {
    return currentSaldo;
}

/**
 * Mendapatkan timestamp terakhir update
 * @returns {string|null} Timestamp
 */
function getLastUpdateTime() {
    const data = getSaldoFromStorage();
    return data ? data.timestamp : null;
}

// ==================== INISIALISASI ====================

/**
 * Inisialisasi sistem penyimpanan saldo
 */
async function initBalanceSystem() {
    console.log("🚀 Inisialisasi sistem penyimpanan saldo...");
    
    // Muat data dari localStorage jika ada
    const storedData = getSaldoFromStorage();
    if (storedData) {
        currentSaldo = storedData.value;
        console.log(`📂 Data ditemukan di localStorage: ${currentSaldo} (${storedData.timestamp})`);
    }
    
    // Lakukan update pertama
    await updateSaldo();
    
    // Setup auto-update setiap 5 menit
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    
    updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
    console.log(`⏰ Auto-update diatur setiap ${UPDATE_INTERVAL / 60000} menit`);
    
    // Setup auto-update saat tab/window aktif kembali
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ Tab aktif, cek update...");
            updateSaldo();
        }
    });
    
    // Setup online/offline detection
    window.addEventListener('online', () => {
        console.log("🌐 Koneksi online, cek update...");
        updateSaldo();
    });
    
    console.log("✅ Sistem penyimpanan saldo siap!");
}

/**
 * Membersihkan resources
 */
function cleanup() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
    }
    
    if (window.previousSaldoURL) {
        URL.revokeObjectURL(window.previousSaldoURL);
        window.previousSaldoURL = null;
    }
    
    console.log("🧹 Resources dibersihkan");
}

// ==================== EKSPOR FUNGSI UNTUK GLOBAL ACCESS ====================
window.BalanceSystem = {
    init: initBalanceSystem,
    update: updateSaldo,
    getCurrentSaldo: getCurrentSaldo,
    getLastUpdateTime: getLastUpdateTime,
    getDataURL: getSaldoDataURL,
    cleanup: cleanup,
    
    // Fungsi debug
    debug: function() {
        const stored = getSaldoFromStorage();
        return {
            currentSaldo: currentSaldo,
            storedData: stored,
            isUpdating: isUpdating,
            storageKey: STORAGE_KEY
        };
    },
    
    // Fungsi testing
    testUpdate: function(testValue) {
        console.log("🧪 Testing dengan nilai:", testValue);
        saveSaldoToStorage(testValue);
    },
    
    // Fungsi untuk manual refresh
    forceRefresh: function() {
        console.log("🔧 Manual refresh dipanggil");
        updateSaldo();
    }
};

// Auto-init ketika halaman dimuat
document.addEventListener('DOMContentLoaded', function() {
    // Tunggu sebentar untuk memastikan script.js sudah siap
    setTimeout(() => {
        initBalanceSystem();
    }, 1000);
});

// Cleanup ketika window/tab ditutup
window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);
