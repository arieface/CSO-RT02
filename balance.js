// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 60000; // 1 menit
const STABILITY_CHECK_COUNT = 3; // 3x fetch per attempt
const STABILITY_CHECK_DELAY = 1500; // Delay antar check (1.5 detik)
const MAX_STABILITY_ATTEMPTS = 5; // Maksimal berapa kali coba sampai dapat data stabil
const RETRY_DELAY = 2000; // Delay sebelum retry (2 detik)

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;
let fetchAttempts = 0;

// ==================== FUNGSI UTAMA ====================

async function fetchAndProcessSaldo() {
    try {
        fetchAttempts++;
        console.log(`📡 [Balance] Mengambil dari Google Sheets... (Attempt #${fetchAttempts})`);
        
        const timestamp = Date.now() + Math.random().toString(36).substring(7);
        
        const response = await fetch(`${SHEET_URL}&_=${timestamp}`, {
            cache: 'no-store',
            headers: { 
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah:", text);
        
        // PROSES DATA
        let cleaned = text;
        cleaned = cleaned.replace(/Rp\s*/i, '');
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
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

// FUNGSI: Verifikasi stabilitas data dengan multiple fetch
async function fetchWithStabilityCheck() {
    console.log(`🔍 [Balance] Memulai stability check (${STABILITY_CHECK_COUNT}x)...`);
    
    const values = [];
    
    // Fetch beberapa kali dengan delay
    for (let i = 0; i < STABILITY_CHECK_COUNT; i++) {
        if (i > 0) {
            console.log(`⏳ [Balance] Menunggu ${STABILITY_CHECK_DELAY/1000}s sebelum check ke-${i + 1}...`);
            await new Promise(resolve => setTimeout(resolve, STABILITY_CHECK_DELAY));
        }
        
        const value = await fetchAndProcessSaldo();
        if (value !== null) {
            values.push(value);
            console.log(`📊 [Balance] Check ${i + 1}/${STABILITY_CHECK_COUNT}: ${value}`);
        }
    }
    
    if (values.length === 0) {
        console.error("❌ [Balance] Semua fetch gagal");
        return { stable: false, value: null, values: [] };
    }
    
    // Cek apakah semua nilai sama (DATA STABIL)
    const allSame = values.every(v => v === values[0]);
    
    if (allSame) {
        console.log(`✅ [Balance] Data stabil! Nilai konsisten: ${values[0]}`);
        return { stable: true, value: values[0], values };
    } else {
        console.warn(`⚠️ [Balance] Data tidak stabil! Values: [${values.join(', ')}]`);
        return { stable: false, value: null, values };
    }
}

// FUNGSI BARU: Tunggu sampai data stabil
async function waitForStableData() {
    console.log(`🎯 [Balance] Menunggu data stabil (max ${MAX_STABILITY_ATTEMPTS} attempts)...`);
    
    for (let attempt = 1; attempt <= MAX_STABILITY_ATTEMPTS; attempt++) {
        console.log(`🔄 [Balance] Stability attempt ${attempt}/${MAX_STABILITY_ATTEMPTS}`);
        
        const result = await fetchWithStabilityCheck();
        
        if (result.stable) {
            console.log(`🎉 [Balance] Data stabil ditemukan pada attempt ke-${attempt}!`);
            return result.value;
        }
        
        // Jika belum stabil dan masih ada attempt tersisa
        if (attempt < MAX_STABILITY_ATTEMPTS) {
            console.log(`⏸️ [Balance] Retry dalam ${RETRY_DELAY/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
    
    // Jika setelah semua attempt masih tidak stabil, gunakan fallback
    console.warn(`⚠️ [Balance] Tidak dapat menemukan data stabil setelah ${MAX_STABILITY_ATTEMPTS} attempts`);
    console.log(`🔧 [Balance] Fallback: Menggunakan single fetch...`);
    
    return await fetchAndProcessSaldo();
}

async function updateSaldo() {
    if (isUpdating) {
        console.log("⏳ [Balance] Update sudah berjalan...");
        return;
    }
    
    isUpdating = true;
    console.log("🔄 [Balance] Memulai update...");
    
    try {
        // TUNGGU sampai data stabil
        const newSaldo = await waitForStableData();
        
        if (newSaldo !== null) {
            // Cek apakah nilai benar-benar berubah
            const isValueChanged = currentSaldo !== newSaldo;
            
            if (isValueChanged || currentSaldo === null) {
                const previousSaldo = currentSaldo;
                currentSaldo = newSaldo;
                lastUpdateTime = new Date().toISOString();
                
                console.log(`💾 [Balance] Saldo ${previousSaldo === null ? 'diinisialisasi' : 'diupdate'}: ${previousSaldo} → ${newSaldo}`);
                
                // KIRIM EVENT ke script.js
                const event = new CustomEvent('balanceUpdated', {
                    detail: {
                        saldo: newSaldo,
                        previousSaldo: previousSaldo,
                        timestamp: lastUpdateTime,
                        formatted: new Intl.NumberFormat('id-ID').format(newSaldo),
                        isChanged: isValueChanged
                    }
                });
                window.dispatchEvent(event);
                
            } else {
                console.log(`ℹ️ [Balance] Saldo tidak berubah: ${newSaldo}`);
            }
            
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
    
    // 2. Setup auto-update setiap 1 menit
    updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
    console.log(`⏰ [Balance] Auto-update diatur (${UPDATE_INTERVAL/60000} menit)`);
    
    // 3. Update saat tab aktif - DISABLED untuk mencegah looping
    // document.addEventListener('visibilitychange', () => {
    //     if (!document.hidden) {
    //         console.log("👁️ [Balance] Tab aktif, refresh...");
    //         setTimeout(updateSaldo, 2000);
    //     }
    // });
    
    // 4. Update saat online
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Online, refresh dalam 5 detik...");
        setTimeout(updateSaldo, 5000);
    });
    
    isInitialized = true;
    console.log("✅ [Balance] Sistem siap!");
    
    const readyEvent = new CustomEvent('balanceReady');
    window.dispatchEvent(readyEvent);
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
    refresh: updateSaldo,
    forceRefresh: () => {
        console.log("🔧 [Balance] Manual refresh");
        updateSaldo();
    },
    
    // Reset system
    reset: () => {
        console.log("🔄 [Balance] Reset sistem...");
        currentSaldo = null;
        lastUpdateTime = null;
        fetchAttempts = 0;
        console.log("✅ [Balance] Reset selesai");
    },
    
    // Debug
    debug: () => {
        const debugInfo = {
            currentSaldo,
            lastUpdateTime,
            isUpdating,
            isInitialized,
            fetchAttempts,
            updateInterval: `${UPDATE_INTERVAL/1000}s`,
            stabilityChecks: STABILITY_CHECK_COUNT,
            stabilityDelay: `${STABILITY_CHECK_DELAY/1000}s`,
            maxAttempts: MAX_STABILITY_ATTEMPTS,
            retryDelay: `${RETRY_DELAY/1000}s`
        };
        console.table(debugInfo);
        return debugInfo;
    },
    
    // Manual fetch untuk testing
    manualFetch: async () => {
        console.log("🧪 [Balance] Manual single fetch...");
        const result = await fetchAndProcessSaldo();
        console.log("🧪 [Balance] Hasil:", result);
        return result;
    },
    
    // Test stability check
    testStability: async () => {
        console.log("🧪 [Balance] Testing stability check...");
        const result = await fetchWithStabilityCheck();
        console.log("🧪 [Balance] Hasil:", result);
        return result;
    },
    
    // Test wait for stable data
    testWaitStable: async () => {
        console.log("🧪 [Balance] Testing wait for stable data...");
        const result = await waitForStableData();
        console.log("🧪 [Balance] Hasil:", result);
        return result;
    }
};

// ==================== AUTO START ====================
setTimeout(() => {
    initialize().catch(console.error);
}, 100);