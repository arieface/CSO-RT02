// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 60000; // 1 menit (diubah dari 5 menit)

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;

// ==================== FUNGSI UTAMA ====================

async function fetchAndProcessSaldo() {
    try {
        console.log("📡 [Balance] Mengambil dari Google Sheets...");
        
        const timestamp = new Date().getTime();
        const response = await fetch(`${SHEET_URL}&_=${timestamp}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah:", text);
        
        // PROSES DATA dengan berbagai format
        let cleaned = text;
        
        // 1. Hapus "Rp" jika ada
        cleaned = cleaned.replace(/Rp\s*/i, '');
        
        // 2. Hapus titik (ribuan separator)
        cleaned = cleaned.replace(/\./g, '');
        
        // 3. Ganti koma dengan titik untuk desimal
        cleaned = cleaned.replace(',', '.');
        
        // 4. Hapus karakter non-numerik
        cleaned = cleaned.replace(/[^\d.-]/g, '');
        
        console.log("🧹 [Balance] Setelah cleaning:", cleaned);
        
        if (!cleaned || cleaned === '') {
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
            lastUpdateTime = new Date().toISOString();
            
            console.log(`💾 [Balance] Saldo disimpan: ${newSaldo}`);
            
            // KIRIM EVENT ke script.js
            const event = new CustomEvent('balanceUpdated', {
                detail: {
                    saldo: newSaldo,
                    timestamp: lastUpdateTime,
                    formatted: new Intl.NumberFormat('id-ID').format(newSaldo)
                }
            });
            window.dispatchEvent(event);
            
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
        // Tunggu DOM siap
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
    
    // 2. Setup auto-update setiap 1 menit
    updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
    console.log(`⏰ [Balance] Auto-update diatur (${UPDATE_INTERVAL/60000} menit)`);
    
    // 3. Update saat tab aktif
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ [Balance] Tab aktif, refresh...");
            updateSaldo();
        }
    });
    
    // 4. Update saat online
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Online, refresh...");
        updateSaldo();
    });
    
    isInitialized = true;
    console.log("✅ [Balance] Sistem siap!");
    
    // Kirim event bahwa balance.js siap
    const readyEvent = new CustomEvent('balanceReady');
    window.dispatchEvent(readyEvent);
}

// ==================== PUBLIC API ====================

// Ekspor fungsi yang bisa diakses script.js
window.BalanceSystem = {
    // Status
    isReady: () => isInitialized,
    
    // Data
    getCurrentSaldo: () => currentSaldo,
    getLastUpdateTime: () => lastUpdateTime,
    
    // Actions
    refresh: updateSaldo,
    forceRefresh: () => {
        console.log("🔧 [Balance] Manual refresh");
        updateSaldo();
    },
    
    // Debug
    debug: () => ({
        currentSaldo,
        lastUpdateTime,
        isUpdating,
        isInitialized
    })
};

// ==================== AUTO START ====================
// Tunggu sedikit sebelum mulai
setTimeout(() => {
    initialize().catch(console.error);
}, 100);