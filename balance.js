// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 300000; // 5 menit

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;

// ==================== FUNGSI UTAMA ====================

async function fetchAndProcessSaldo() {
    try {
        console.log("📡 [Balance] Mengambil data FRESH dari Google Sheets...");
        
        // STRATEGI ANTI-CACHE YANG SANGAT AGRESIF
        const timestamp = new Date().getTime();
        const randomParam = Math.random().toString(36).substring(2, 15);
        const randomParam2 = Math.random().toString(36).substring(2, 15);
        
        // Tambahkan multiple random parameters untuk bypass cache
        const finalUrl = `${SHEET_URL}&_t=${timestamp}&_r=${randomParam}&_x=${randomParam2}`;
        
        console.log("🔗 [Balance] URL:", finalUrl);
        
        const response = await fetch(finalUrl, {
            method: 'GET',
            cache: 'no-store',
            headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah dari server:", text);
        
        if (!text || text === '') {
            console.warn("⚠️ [Balance] Data kosong dari server");
            return null;
        }
        
        // PROSES DATA dengan berbagai format
        let cleaned = text;
        
        // 1. Hapus "Rp" jika ada
        cleaned = cleaned.replace(/Rp\s*/gi, '');
        
        // 2. Hapus titik (ribuan separator)
        cleaned = cleaned.replace(/\./g, '');
        
        // 3. Ganti koma dengan titik untuk desimal
        cleaned = cleaned.replace(/,/g, '.');
        
        // 4. Hapus karakter non-numerik kecuali titik dan minus
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
        
        console.log(`✅ [Balance] Berhasil parse: Rp ${numericValue.toLocaleString('id-ID')}`);
        return numericValue;
        
    } catch (error) {
        console.error("❌ [Balance] Error fetch:", error.message);
        return null;
    }
}

async function updateSaldo() {
    if (isUpdating) {
        console.log("⏳ [Balance] Update sedang berjalan, skip...");
        return;
    }
    
    isUpdating = true;
    const updateStartTime = new Date().toISOString();
    console.log(`🔄 [Balance] Memulai update saldo (${updateStartTime})...`);
    
    try {
        const newSaldo = await fetchAndProcessSaldo();
        
        if (newSaldo !== null && newSaldo !== undefined) {
            // Cek apakah ada perubahan nilai
            const hasChanged = currentSaldo !== newSaldo;
            const oldSaldo = currentSaldo;
            
            // Simpan ke variabel global
            currentSaldo = newSaldo;
            lastUpdateTime = new Date().toISOString();
            
            if (hasChanged) {
                console.log(`💾 [Balance] Saldo BERUBAH: ${oldSaldo ? 'Rp ' + oldSaldo.toLocaleString('id-ID') : 'null'} → Rp ${newSaldo.toLocaleString('id-ID')}`);
            } else {
                console.log(`💾 [Balance] Saldo tetap: Rp ${newSaldo.toLocaleString('id-ID')}`);
            }
            
            // KIRIM EVENT ke script.js - SELALU kirim untuk memastikan UI update
            const event = new CustomEvent('balanceUpdated', {
                detail: {
                    saldo: newSaldo,
                    timestamp: lastUpdateTime,
                    formatted: new Intl.NumberFormat('id-ID', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(newSaldo),
                    changed: hasChanged,
                    oldSaldo: oldSaldo
                }
            });
            window.dispatchEvent(event);
            console.log("📤 [Balance] Event 'balanceUpdated' dikirim dengan data:", {
                saldo: newSaldo,
                changed: hasChanged
            });
            
        } else {
            console.warn("⚠️ [Balance] Gagal mendapatkan saldo baru dari server");
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
        console.log("ℹ️ [Balance] Sudah diinisialisasi sebelumnya");
        return;
    }
    
    console.log("🚀 [Balance] Inisialisasi sistem balance...");
    
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
    console.log("📦 [Balance] DOM siap, mulai setup balance system...");
    
    // 1. Load pertama kali - CRITICAL
    console.log("🎬 [Balance] Melakukan fetch pertama kali...");
    await updateSaldo();
    
    // 2. Setup auto-update setiap 5 menit
    if (updateTimer) {
        console.log("🔄 [Balance] Membersihkan timer lama...");
        clearInterval(updateTimer);
    }
    
    updateTimer = setInterval(() => {
        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        console.log(`⏰ [Balance] Auto-update triggered (${now})`);
        updateSaldo();
    }, UPDATE_INTERVAL);
    
    console.log(`⏰ [Balance] Auto-update diatur setiap ${UPDATE_INTERVAL/60000} menit`);
    
    // 3. Update saat tab aktif kembali
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ [Balance] Tab aktif kembali, refresh data...");
            updateSaldo();
        }
    });
    
    // 4. Update saat koneksi kembali online
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Koneksi online kembali, refresh data...");
        updateSaldo();
    });
    
    isInitialized = true;
    console.log("✅ [Balance] Sistem balance siap dan berjalan!");
    
    // Kirim event bahwa balance.js siap
    const readyEvent = new CustomEvent('balanceReady', {
        detail: {
            ready: true,
            timestamp: new Date().toISOString(),
            updateInterval: UPDATE_INTERVAL
        }
    });
    window.dispatchEvent(readyEvent);
    console.log("📢 [Balance] Event 'balanceReady' dikirim");
}

// ==================== PUBLIC API ====================

window.BalanceSystem = {
    // Status
    isReady: () => isInitialized,
    isUpdating: () => isUpdating,
    
    // Data
    getCurrentSaldo: () => currentSaldo,
    getLastUpdateTime: () => lastUpdateTime,
    
    // Actions
    refresh: async () => {
        console.log("🔄 [BalanceSystem API] Manual refresh dipanggil");
        await updateSaldo();
    },
    
    forceRefresh: async () => {
        console.log("🔧 [BalanceSystem API] Force refresh (reset flag)");
        isUpdating = false; // Reset flag
        await updateSaldo();
    },
    
    // Debug
    debug: () => {
        const debugInfo = {
            currentSaldo,
            lastUpdateTime,
            isUpdating,
            isInitialized,
            updateInterval: UPDATE_INTERVAL,
            formattedSaldo: currentSaldo ? `Rp ${currentSaldo.toLocaleString('id-ID')}` : 'null'
        };
        console.table(debugInfo);
        return debugInfo;
    }
};

// ==================== AUTO START ====================
console.log("🎬 [Balance] Script loaded, starting in 100ms...");
setTimeout(() => {
    initialize().catch(error => {
        console.error("❌ [Balance] Initialize failed:", error);
    });
}, 100);
