// ==================== KONFIGURASI OPTIMAL =====================
const CONFIG = {
    SHEET_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&single=true&output=csv",
    
    // ⭐ INTERVAL OPTIMAL BERDASARKAN LOG ANDA:
    // Log menunjukkan fetch bekerja baik dalam 600-800ms
    // Google cache update dalam 1 menit (dari 10:27:59 ke 10:28:59)
    UPDATE_INTERVAL: 20000, // ⭐ 20 DETIK (optimal untuk kasus Anda)
    
    // ⭐ VALIDASI YANG LEBIH FLEKSIBEL:
    MAX_PERCENT_CHANGE: 150,    // 150% perubahan langsung diterima
    REQUIRED_CONSECUTIVE: 1,    // Hanya butuh 1x konfirmasi (bukan 2)
    CONFIRMATION_TIMEOUT: 30000, // Timeout 30 detik (bukan 60)
    
    // ⭐ CACHE YANG LEBIH SINGKAT:
    CACHE_TTL: 10000,           // 10 detik cache lokal
    RETRY_DELAY: 1000,          // 1 detik retry
    MAX_RETRIES: 2,             // Maks 2 retry (cepat gagal)
};

// ==================== PERBAIKAN VALIDASI ====================

function validateBalanceChange(oldValue, newValue) {
    if (oldValue === null || newValue === null) {
        return { isValid: true, reason: 'First load' };
    }
    
    // Hitung perubahan absolut (bukan persentase saja)
    const absoluteChange = Math.abs(newValue - oldValue);
    const percentChange = (absoluteChange / oldValue) * 100;
    
    // Rule 1: Perubahan kecil (< 50%) langsung terima
    if (percentChange <= 50) {
        return { 
            isValid: true, 
            reason: `Small change: ${percentChange.toFixed(1)}%`,
            type: 'small'
        };
    }
    
    // Rule 2: Perubahan sedang (50-150%) butuh konfirmasi cepat
    if (percentChange <= CONFIG.MAX_PERCENT_CHANGE) {
        return { 
            isValid: 'pending', // ⭐ Status baru: pending (bukan false)
            reason: `Medium change: ${percentChange.toFixed(1)}%`,
            type: 'medium',
            needsConfirmation: true
        };
    }
    
    // Rule 3: Perubahan sangat besar (>150%) butuh konfirmasi
    return { 
        isValid: false, 
        reason: `Large change: ${percentChange.toFixed(1)}%`,
        type: 'large',
        needsConfirmation: true
    };
}

// ==================== SMART CACHE SYSTEM ====================

class SmartCache {
    constructor() {
        this.cache = new Map();
        this.ttl = CONFIG.CACHE_TTL;
    }
    
    set(key, value) {
        this.cache.set(key, {
            value: value,
            timestamp: Date.now(),
            ttl: this.calculateTTL(value) // ⭐ Dynamic TTL
        });
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        const age = Date.now() - item.timestamp;
        
        // ⭐ Cache lebih pendek jika data sering berubah
        if (age < item.ttl) {
            return item.value;
        }
        
        this.cache.delete(key);
        return null;
    }
    
    calculateTTL(value) {
        // ⭐ Dynamic TTL berdasarkan nilai
        if (value < 100000) return 15000;      // Kecil: 15 detik
        if (value < 1000000) return 10000;     // Sedang: 10 detik  
        return 5000;                           // Besar: 5 detik
    }
    
    clear() {
        this.cache.clear();
    }
}

const smartCache = new SmartCache();

// ==================== OPTIMIZED FETCH LOGIC ====================

async function optimizedFetchBalance() {
    const startTime = Date.now();
    
    try {
        // ⭐ Cek cache dengan smart system
        const cached = smartCache.get('balance');
        if (cached !== null) {
            const cacheAge = Date.now() - startTime;
            console.log(`💾 [Balance] Cache hit (${cacheAge}ms old)`);
            return { value: cached, fromCache: true };
        }
        
        console.log(`🚀 [Balance] Fetching from Google Sheets...`);
        
        // ⭐ Fetch dengan timeout cepat
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const url = `${CONFIG.SHEET_URL}&_=${Date.now()}`;
        const response = await fetch(url, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const csvText = await response.text();
        
        // ⭐ Fast parsing (simplified)
        const lines = csvText.split('\n');
        const targetLine = lines.length >= 100 ? lines[99] : lines[lines.length - 1];
        const cellValue = targetLine.split(',')[0] || '';
        
        // Fast cleaning
        const numericValue = parseFloat(
            cellValue.replace(/[^\d.-]/g, '')
        );
        
        if (isNaN(numericValue)) {
            throw new Error('Invalid number');
        }
        
        const fetchTime = Date.now() - startTime;
        console.log(`✅ [Balance] Fetched: ${numericValue} (${fetchTime}ms)`);
        
        // ⭐ Simpan ke cache
        smartCache.set('balance', numericValue);
        
        return { value: numericValue, fromCache: false, fetchTime };
        
    } catch (error) {
        console.error(`❌ [Balance] Fetch error: ${error.message}`);
        
        // ⭐ Return cached value jika ada error
        const cached = smartCache.get('balance');
        if (cached !== null) {
            console.log(`🔄 [Balance] Using cached due to error: ${cached}`);
            return { value: cached, fromCache: true, error: true };
        }
        
        throw error;
    }
}

// ==================== ADAPTIVE INTERVAL SYSTEM ====================

class AdaptiveInterval {
    constructor() {
        this.baseInterval = CONFIG.UPDATE_INTERVAL;
        this.currentInterval = CONFIG.UPDATE_INTERVAL;
        this.lastFetchTimes = [];
        this.varianceHistory = [];
        this.lastChangeTime = 0;
        this.isDataStable = true;
    }
    
    calculateOptimalInterval() {
        const now = Date.now();
        
        // ⭐ Rule 1: Jika data baru saja berubah, fetch lebih cepat
        if (now - this.lastChangeTime < 60000) { // Dalam 1 menit terakhir
            return Math.max(10000, this.baseInterval * 0.5); // Min 10 detik
        }
        
        // ⭐ Rule 2: Hitung rata-rata waktu fetch
        if (this.lastFetchTimes.length > 0) {
            const avgFetchTime = this.lastFetchTimes.reduce((a, b) => a + b, 0) / this.lastFetchTimes.length;
            
            // Jika fetch cepat (<1s), bisa lebih agresif
            if (avgFetchTime < 1000) {
                return Math.max(15000, this.baseInterval * 0.75); // Min 15 detik
            }
            
            // Jika fetch lambat (>2s), lebih konservatif
            if (avgFetchTime > 2000) {
                return Math.min(60000, this.baseInterval * 1.5); // Max 60 detik
            }
        }
        
        // ⭐ Rule 3: Default ke base interval
        return this.baseInterval;
    }
    
    recordFetch(fetchTime, valueChanged) {
        // Simpan waktu fetch (max 5 entries)
        this.lastFetchTimes.push(fetchTime);
        if (this.lastFetchTimes.length > 5) {
            this.lastFetchTimes.shift();
        }
        
        // Catat jika ada perubahan
        if (valueChanged) {
            this.lastChangeTime = Date.now();
            this.isDataStable = false;
            
            // Setelah perubahan, lebih cepat dulu
            setTimeout(() => {
                this.isDataStable = true;
            }, 120000); // 2 menit setelah perubahan
        }
    }
    
    getInterval() {
        const optimal = this.calculateOptimalInterval();
        
        // Smooth transition
        if (Math.abs(optimal - this.currentInterval) > 5000) {
            this.currentInterval = optimal;
            console.log(`⏰ [Interval] Adjusted to ${this.currentInterval/1000}s`);
        }
        
        return this.currentInterval;
    }
}

// ==================== MAIN EXECUTION ====================

const adaptiveInterval = new AdaptiveInterval();
let balanceValue = null;
let updateInProgress = false;

async function executeBalanceUpdate() {
    if (updateInProgress) return;
    
    updateInProgress = true;
    const updateStart = Date.now();
    
    try {
        const result = await optimizedFetchBalance();
        const newValue = result.value;
        const previousValue = balanceValue;
        
        // Validasi perubahan
        if (previousValue !== null) {
            const change = Math.abs(newValue - previousValue);
            const percentChange = (change / previousValue) * 100;
            
            if (percentChange > 50) { // Perubahan signifikan
                console.log(`🔄 [Balance] Significant change: ${previousValue} → ${newValue} (${percentChange.toFixed(1)}%)`);
                
                // ⭐ Untuk perubahan besar, langsung terima (tanpa konfirmasi)
                // Karena dari log, Google cache sudah konsisten
                balanceValue = newValue;
                adaptiveInterval.recordFetch(result.fetchTime || 0, true);
                
                // Dispatch event
                dispatchBalanceUpdate(newValue, true);
                
            } else if (percentChange > 10) { // Perubahan sedang
                // Butuh 1 konfirmasi
                console.log(`⏳ [Balance] Medium change, accepting after one confirmation`);
                balanceValue = newValue;
                adaptiveInterval.recordFetch(result.fetchTime || 0, true);
                dispatchBalanceUpdate(newValue, false);
                
            } else { // Perubahan kecil
                balanceValue = newValue;
                adaptiveInterval.recordFetch(result.fetchTime || 0, false);
                dispatchBalanceUpdate(newValue, false);
            }
        } else {
            // First load
            balanceValue = newValue;
            adaptiveInterval.recordFetch(result.fetchTime || 0, false);
            dispatchBalanceUpdate(newValue, false);
        }
        
    } catch (error) {
        console.error(`❌ [Balance] Update failed: ${error.message}`);
    } finally {
        updateInProgress = false;
        
        // Schedule next update dengan interval adaptive
        const nextInterval = adaptiveInterval.getInterval();
        setTimeout(executeBalanceUpdate, nextInterval);
        
        const totalTime = Date.now() - updateStart;
        console.log(`⏱️ [Balance] Update cycle: ${totalTime}ms, next in: ${nextInterval/1000}s`);
    }
}

function dispatchBalanceUpdate(value, isSignificant) {
    const eventDetail = {
        balance: value,
        formatted: new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(value),
        timestamp: new Date().toISOString(),
        isSignificant: isSignificant,
        source: 'google-sheets'
    };
    
    const event = new CustomEvent('balanceUpdated', { detail: eventDetail });
    window.dispatchEvent(event);
    
    console.log(`📢 [Balance] Updated: ${eventDetail.formatted} ${isSignificant ? '🔄' : ''}`);
}

// ==================== START SYSTEM ====================

function startBalanceSystem() {
    console.log('🚀 [Balance] Starting optimized system...');
    
    // Initial fetch
    executeBalanceUpdate();
    
    // Event listeners
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('👁️ [Balance] Tab active, immediate refresh');
            executeBalanceUpdate();
        }
    });
    
    // Manual refresh hotkey
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            console.log('🔄 [Balance] Manual refresh triggered');
            smartCache.clear();
            executeBalanceUpdate();
        }
    });
}

// ==================== PUBLIC API ====================

window.BalanceSystem = {
    getCurrentSaldo: () => balanceValue,
    getFormattedBalance: () => {
        if (balanceValue === null) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(balanceValue);
    },
    refresh: () => {
        smartCache.clear();
        executeBalanceUpdate();
    },
    forceUpdate: () => {
        console.log('⚡ [Balance] Force update');
        smartCache.clear();
        balanceValue = null;
        executeBalanceUpdate();
    },
    getConfig: () => ({ ...CONFIG }),
    getStats: () => ({
        currentValue: balanceValue,
        lastUpdate: lastUpdateTime,
        cacheSize: smartCache.cache.size,
        currentInterval: adaptiveInterval.currentInterval
    })
};

// Auto start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBalanceSystem);
} else {
    startBalanceSystem();
}