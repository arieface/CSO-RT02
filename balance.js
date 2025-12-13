// ==================== KONFIGURASI UTAMA =====================
const CONFIG = {
    // URL Google Sheets (tanpa range parameter)
    SHEET_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&single=true&output=csv",
    
    // ⭐ INTERVAL OPTIMAL: 30 detik untuk real-time, 45 detik untuk balanced
    UPDATE_INTERVAL: 30000, // 30 detik
    
    // Validasi
    MAX_PERCENT_CHANGE: 50,    // Maksimal 50% perubahan langsung diterima
    REQUIRED_CONSECUTIVE: 2,   // Butuh 2x konfirmasi untuk perubahan drastis
    MAX_CONSECUTIVE_ERRORS: 3, // Maksimal error berturut-turut
    
    // Cache settings
    CACHE_TTL: 30000, // 30 detik cache lokal
    RETRY_DELAY: 2000, // 2 detik untuk retry
    MAX_RETRIES: 3,    // Maksimal 3x retry
};

// ==================== VARIABEL GLOBAL ====================
let currentBalance = null;
let lastUpdateTime = null;
let isFetching = false;
let updateTimer = null;
let isInitialized = false;
let consecutiveErrors = 0;
let changeConfirmation = {
    candidate: null,
    count: 0,
    timestamp: 0
};

// ==================== CACHE SYSTEM ====================
const balanceCache = {
    value: null,
    timestamp: 0,
    
    set: function(value) {
        this.value = value;
        this.timestamp = Date.now();
    },
    
    get: function() {
        if (this.value && (Date.now() - this.timestamp) < CONFIG.CACHE_TTL) {
            return this.value;
        }
        return null;
    },
    
    isValid: function() {
        return this.value && (Date.now() - this.timestamp) < CONFIG.CACHE_TTL;
    }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate cache-busting URL dengan multiple parameters
 */
function generateCacheBustUrl() {
    const params = new URLSearchParams({
        '_': Date.now(), // Timestamp utama
        't': Math.floor(Date.now() / 1000), // Unix timestamp
        'r': Math.random().toString(36).substring(2, 15), // Random string
        'v': '2.0' // Version
    });
    
    return `${CONFIG.SHEET_URL}&${params.toString()}`;
}

/**
 * Parse dan clean nilai dari CSV
 */
function parseAndCleanValue(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') return null;
    
    let cleaned = rawValue.trim();
    
    // 1. Remove currency symbols (case insensitive)
    cleaned = cleaned.replace(/Rp\s*|IDR\s*|USD\s*|€\s*|\$\s*/gi, '');
    
    // 2. Remove all spaces
    cleaned = cleaned.replace(/\s/g, '');
    
    // 3. Handle thousand separators and decimals
    // Case 1: Format Indonesia "1.234,56" → "1234.56"
    if (cleaned.includes('.') && cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, ''); // Remove thousand separators
        cleaned = cleaned.replace(',', '.');   // Replace comma with dot for decimal
    }
    // Case 2: Format US/International "1,234.56" → "1234.56"
    else if (cleaned.includes(',') && !cleaned.includes('.')) {
        // Check if comma is thousand separator or decimal
        const parts = cleaned.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
            // Probably "1234,56" (decimal with comma)
            cleaned = cleaned.replace(',', '.');
        } else {
            // Probably "1,234" (thousand separator)
            cleaned = cleaned.replace(/,/g, '');
        }
    }
    // Case 3: Only dots (thousand separators)
    else if (cleaned.includes('.')) {
        const parts = cleaned.split('.');
        if (parts.length > 1) {
            // Check if last part is 3 digits (probably thousand separator)
            if (parts[parts.length - 1].length === 3) {
                // Remove all dots (thousand separators)
                cleaned = cleaned.replace(/\./g, '');
            }
        }
    }
    
    // 4. Remove any remaining non-numeric characters except minus and dot
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    // 5. Handle empty or invalid
    if (!cleaned || cleaned === '-' || cleaned === '.') {
        return null;
    }
    
    // 6. Parse to float with rounding
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue) || !isFinite(numericValue)) {
        return null;
    }
    
    // Round to 2 decimal places
    return Math.round(numericValue * 100) / 100;
}

/**
 * Fetch dari Google Sheets dengan retry mechanism
 */
async function fetchFromGoogleSheets() {
    let lastError = null;
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            console.log(`📡 [Balance] Fetch attempt ${attempt}/${CONFIG.MAX_RETRIES}`);
            
            const url = generateCacheBustUrl();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-store',
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'Accept': 'text/csv'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const csvText = await response.text();
            
            if (!csvText || csvText.trim().length === 0) {
                throw new Error('Empty response from Google Sheets');
            }
            
            console.log(`✅ [Balance] Fetch successful (${csvText.length} chars)`);
            return csvText;
            
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [Balance] Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt < CONFIG.MAX_RETRIES) {
                const delay = CONFIG.RETRY_DELAY * attempt;
                console.log(`⏳ [Balance] Retrying in ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError || new Error('All fetch attempts failed');
}

/**
 * Extract cell A100 dari CSV data
 */
function extractCellA100(csvData) {
    try {
        // Split by lines and filter empty
        const rows = csvData.split(/\r?\n/)
            .map(row => row.trim())
            .filter(row => row.length > 0 && !row.startsWith('#'));
        
        if (rows.length === 0) {
            throw new Error('No data rows in CSV');
        }
        
        console.log(`📊 [Balance] Found ${rows.length} rows`);
        
        // Cari baris ke-100 (indeks 99)
        if (rows.length < 100) {
            console.warn(`⚠️ [Balance] Only ${rows.length} rows, using last row as A100`);
            const lastRow = rows[rows.length - 1];
            const columns = lastRow.split(',').map(col => col.trim());
            return columns[0] || '';
        }
        
        // Ambil baris ke-100
        const row100 = rows[99];
        console.log(`📍 [Balance] Row 100 raw: "${row100.substring(0, 100)}${row100.length > 100 ? '...' : ''}"`);
        
        // Parse CSV row dengan handle quotes
        const columns = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < row100.length; i++) {
            const char = row100[i];
            const nextChar = row100[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                columns.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        columns.push(current);
        
        // Kolom pertama adalah A100
        const cellA100 = columns[0] ? columns[0].trim() : '';
        console.log(`🎯 [Balance] Cell A100 extracted: "${cellA100}"`);
        
        return cellA100;
        
    } catch (error) {
        console.error('❌ [Balance] Error extracting A100:', error);
        throw error;
    }
}

/**
 * Validasi perubahan balance
 */
function validateBalanceChange(oldValue, newValue) {
    if (oldValue === null || newValue === null) {
        return { isValid: true, reason: 'First load or null value' };
    }
    
    // Hitung persentase perubahan
    const percentChange = Math.abs((newValue - oldValue) / oldValue) * 100;
    
    // Jika perubahan kecil (< MAX_PERCENT_CHANGE%), langsung terima
    if (percentChange <= CONFIG.MAX_PERCENT_CHANGE) {
        return { 
            isValid: true, 
            reason: `Normal change: ${percentChange.toFixed(1)}%` 
        };
    }
    
    // Perubahan drastis, butuh konfirmasi
    return { 
        isValid: false, 
        reason: `Drastic change: ${percentChange.toFixed(1)}% > ${CONFIG.MAX_PERCENT_CHANGE}%`,
        percentChange: percentChange
    };
}

/**
 * Handle perubahan yang butuh konfirmasi
 */
function handleChangeConfirmation(newValue) {
    const now = Date.now();
    const CONFIRMATION_TIMEOUT = 60000; // 60 detik timeout
    
    // Reset jika timeout
    if (now - changeConfirmation.timestamp > CONFIRMATION_TIMEOUT) {
        console.log('🔄 Reset change confirmation (timeout)');
        changeConfirmation.candidate = newValue;
        changeConfirmation.count = 1;
        changeConfirmation.timestamp = now;
        return { confirmed: false, value: null };
    }
    
    // Cek jika candidate sama (dalam toleransi 5%)
    if (changeConfirmation.candidate !== null) {
        const diff = Math.abs(newValue - changeConfirmation.candidate);
        const tolerance = changeConfirmation.candidate * 0.05;
        
        if (diff <= tolerance) {
            changeConfirmation.count++;
            console.log(`🔄 Confirmation ${changeConfirmation.count}/${CONFIG.REQUIRED_CONSECUTIVE}`);
            
            if (changeConfirmation.count >= CONFIG.REQUIRED_CONSECUTIVE) {
                console.log(`✅ Change confirmed: ${newValue}`);
                const confirmedValue = newValue;
                
                // Reset confirmation state
                changeConfirmation.candidate = null;
                changeConfirmation.count = 0;
                changeConfirmation.timestamp = 0;
                
                return { confirmed: true, value: confirmedValue };
            }
        } else {
            // Candidate berbeda, reset dengan nilai baru
            console.log('🔄 New candidate value, resetting confirmation');
            changeConfirmation.candidate = newValue;
            changeConfirmation.count = 1;
        }
    } else {
        // Pertama kali dapat candidate
        changeConfirmation.candidate = newValue;
        changeConfirmation.count = 1;
        changeConfirmation.timestamp = now;
    }
    
    return { confirmed: false, value: null };
}

// ==================== MAIN BALANCE FETCH FUNCTION ====================

async function fetchBalance() {
    // Cek cache lokal dulu
    const cachedValue = balanceCache.get();
    if (cachedValue !== null) {
        console.log('💾 [Balance] Using cached value');
        return cachedValue;
    }
    
    if (isFetching) {
        console.log('⏳ [Balance] Already fetching, returning last known value');
        return currentBalance;
    }
    
    isFetching = true;
    const fetchStartTime = Date.now();
    
    try {
        console.log('🚀 [Balance] Starting balance fetch...');
        
        // 1. Fetch data dari Google Sheets
        const csvData = await fetchFromGoogleSheets();
        
        // 2. Extract cell A100
        const cellA100 = extractCellA100(csvData);
        
        // 3. Parse dan clean nilai
        const rawValue = parseAndCleanValue(cellA100);
        
        if (rawValue === null) {
            throw new Error('Failed to parse cell A100 value');
        }
        
        console.log(`🔢 [Balance] Parsed value: ${rawValue}`);
        
        // 4. Validasi perubahan
        const validation = validateBalanceChange(currentBalance, rawValue);
        
        if (validation.isValid) {
            // Perubahan valid, update balance
            console.log(`✅ [Balance] ${validation.reason}`);
            currentBalance = rawValue;
            consecutiveErrors = 0;
            
            // Update cache
            balanceCache.set(rawValue);
            
        } else {
            // Perubahan drastis, butuh konfirmasi
            console.warn(`⚠️ [Balance] ${validation.reason}`);
            
            const confirmation = handleChangeConfirmation(rawValue);
            
            if (confirmation.confirmed) {
                // Perubahan dikonfirmasi
                currentBalance = confirmation.value;
                consecutiveErrors = 0;
                balanceCache.set(confirmation.value);
            } else {
                // Belum dikonfirmasi, keep old value
                console.log('⏳ [Balance] Waiting for confirmation, keeping previous value');
                if (currentBalance !== null) {
                    balanceCache.set(currentBalance); // Refresh cache dengan nilai lama
                }
            }
        }
        
        // 5. Update timestamp
        lastUpdateTime = new Date();
        
        const fetchTime = Date.now() - fetchStartTime;
        console.log(`✅ [Balance] Fetch completed in ${fetchTime}ms`);
        
        return currentBalance;
        
    } catch (error) {
        console.error('❌ [Balance] Fetch failed:', error.message);
        
        consecutiveErrors++;
        
        // Jika terlalu banyak error, coba reset
        if (consecutiveErrors >= CONFIG.MAX_CONSECUTIVE_ERRORS) {
            console.warn('🔄 [Balance] Too many errors, resetting state');
            consecutiveErrors = 0;
            changeConfirmation.candidate = null;
            changeConfirmation.count = 0;
        }
        
        // Return last known value atau null
        return currentBalance;
        
    } finally {
        isFetching = false;
    }
}

// ==================== UPDATE AND EVENT SYSTEM ====================

async function updateBalance() {
    try {
        const newBalance = await fetchBalance();
        
        if (newBalance !== null && newBalance !== currentBalance) {
            // Dispatch update event
            const eventDetail = {
                balance: newBalance,
                formatted: formatCurrency(newBalance),
                timestamp: lastUpdateTime ? lastUpdateTime.toISOString() : new Date().toISOString(),
                raw: newBalance,
                previous: currentBalance
            };
            
            const event = new CustomEvent('balanceUpdated', { detail: eventDetail });
            window.dispatchEvent(event);
            
            console.log(`📢 [Balance] Event dispatched: ${eventDetail.formatted}`);
            
            // Update current balance
            currentBalance = newBalance;
        }
        
        return newBalance;
        
    } catch (error) {
        console.error('❌ [Balance] Update failed:', error);
        
        // Dispatch error event
        const errorEvent = new CustomEvent('balanceError', {
            detail: {
                message: error.message,
                timestamp: new Date().toISOString(),
                consecutiveErrors: consecutiveErrors
            }
        });
        window.dispatchEvent(errorEvent);
        
        return null;
    }
}

function formatCurrency(value) {
    if (value === null || value === undefined) return 'Rp 0';
    
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

// ==================== SMART INTERVAL MANAGEMENT ====================

class SmartIntervalManager {
    constructor() {
        this.baseInterval = CONFIG.UPDATE_INTERVAL;
        this.currentInterval = CONFIG.UPDATE_INTERVAL;
        this.isTabActive = true;
        this.networkQuality = 'good';
        this.lastNetworkCheck = 0;
        
        this.initEventListeners();
    }
    
    initEventListeners() {
        // Tab visibility
        document.addEventListener('visibilitychange', () => {
            this.isTabActive = !document.hidden;
            this.adjustInterval();
        });
        
        // Network status
        window.addEventListener('online', () => {
            this.networkQuality = 'good';
            this.adjustInterval();
        });
        
        window.addEventListener('offline', () => {
            this.networkQuality = 'offline';
            this.adjustInterval();
        });
        
        // Network quality detection
        setInterval(() => this.checkNetworkQuality(), 60000);
    }
    
    async checkNetworkQuality() {
        if (Date.now() - this.lastNetworkCheck < 30000) return;
        
        this.lastNetworkCheck = Date.now();
        
        try {
            const startTime = Date.now();
            await fetch('https://www.google.com/favicon.ico', { 
                mode: 'no-cors',
                cache: 'no-store'
            });
            
            const latency = Date.now() - startTime;
            
            if (latency < 500) {
                this.networkQuality = 'excellent';
            } else if (latency < 2000) {
                this.networkQuality = 'good';
            } else {
                this.networkQuality = 'poor';
            }
            
        } catch (error) {
            this.networkQuality = 'poor';
        }
        
        this.adjustInterval();
    }
    
    adjustInterval() {
        let newInterval = this.baseInterval;
        
        if (!this.isTabActive) {
            // Tab tidak aktif, lebih lambat
            newInterval = Math.max(newInterval * 2, 120000); // Minimal 2 menit
        }
        
        if (this.networkQuality === 'poor') {
            // Network jelek, lebih lambat
            newInterval = Math.max(newInterval * 1.5, 90000); // Minimal 1.5 menit
        } else if (this.networkQuality === 'excellent') {
            // Network excellent, bisa lebih cepat
            newInterval = Math.max(newInterval * 0.75, 15000); // Minimal 15 detik
        }
        
        if (this.networkQuality === 'offline') {
            // Offline, sangat lambat
            newInterval = 300000; // 5 menit
        }
        
        if (consecutiveErrors > 0) {
            // Ada error, lebih lambat
            newInterval = Math.max(newInterval * (1 + consecutiveErrors * 0.5), 60000);
        }
        
        if (newInterval !== this.currentInterval) {
            console.log(`⏰ [Balance] Interval adjusted: ${this.currentInterval/1000}s → ${newInterval/1000}s`);
            this.currentInterval = newInterval;
            this.restartInterval();
        }
        
        return this.currentInterval;
    }
    
    restartInterval() {
        if (updateTimer) {
            clearInterval(updateTimer);
        }
        
        updateTimer = setInterval(async () => {
            await updateBalance();
            this.adjustInterval(); // Re-adjust setelah update
        }, this.currentInterval);
    }
    
    getCurrentInterval() {
        return this.currentInterval;
    }
}

// ==================== INITIALIZATION ====================

const intervalManager = new SmartIntervalManager();

async function initializeBalanceSystem() {
    if (isInitialized) {
        console.log('ℹ️ [Balance] Already initialized');
        return;
    }
    
    console.log('🚀 [Balance] Initializing system...');
    
    try {
        // Tunggu DOM ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        console.log('📦 [Balance] DOM ready, starting...');
        
        // Initial fetch
        await updateBalance();
        
        // Start smart interval
        intervalManager.restartInterval();
        
        // Add user activity detection
        let activityTimeout;
        
        function resetActivityTimeout() {
            clearTimeout(activityTimeout);
            activityTimeout = setTimeout(() => {
                console.log('😴 [Balance] User inactive, adjusting interval');
                intervalManager.adjustInterval();
            }, 120000); // 2 menit inactive
        }
        
        // Reset on user activity
        ['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
            document.addEventListener(event, () => {
                resetActivityTimeout();
                if (!intervalManager.isTabActive) {
                    console.log('👤 [Balance] User active again');
                    intervalManager.isTabActive = true;
                    intervalManager.adjustInterval();
                }
            }, { passive: true });
        });
        
        resetActivityTimeout();
        
        isInitialized = true;
        console.log('✅ [Balance] System initialized successfully');
        
        // Dispatch ready event
        window.dispatchEvent(new CustomEvent('balanceReady', {
            detail: {
                timestamp: new Date().toISOString(),
                interval: intervalManager.getCurrentInterval(),
                version: '2.0'
            }
        }));
        
    } catch (error) {
        console.error('❌ [Balance] Initialization failed:', error);
        throw error;
    }
}

// ==================== PUBLIC API ====================

window.BalanceSystem = {
    // Status
    isReady: () => isInitialized,
    isFetching: () => isFetching,
    
    // Data
    getBalance: () => currentBalance,
    getFormattedBalance: () => formatCurrency(currentBalance),
    getLastUpdate: () => lastUpdateTime,
    getLastUpdateFormatted: () => {
        if (!lastUpdateTime) return 'Never updated';
        return lastUpdateTime.toLocaleTimeString('id-ID');
    },
    
    // Actions
    refresh: async () => {
        console.log('🔧 [Balance] Manual refresh requested');
        return await updateBalance();
    },
    
    forceRefresh: async () => {
        console.log('⚡ [Balance] Force refresh with cache bust');
        balanceCache.value = null; // Clear cache
        consecutiveErrors = 0;
        return await updateBalance();
    },
    
    // Configuration
    setUpdateInterval: (ms) => {
        if (ms >= 10000 && ms <= 300000) { // Min 10s, max 5m
            CONFIG.UPDATE_INTERVAL = ms;
            intervalManager.baseInterval = ms;
            intervalManager.adjustInterval();
            console.log(`⏰ [Balance] Update interval set to ${ms/1000}s`);
        } else {
            console.warn('⚠️ [Balance] Interval must be between 10s and 5m');
        }
    },
    
    setMaxPercentChange: (percent) => {
        if (percent >= 1 && percent <= 1000) {
            CONFIG.MAX_PERCENT_CHANGE = percent;
            console.log(`📊 [Balance] Max percent change set to ${percent}%`);
        }
    },
    
    // Debug
    debug: () => ({
        currentBalance,
        formattedBalance: formatCurrency(currentBalance),
        lastUpdate: lastUpdateTime ? lastUpdateTime.toISOString() : null,
        lastUpdateLocal: lastUpdateTime ? lastUpdateTime.toLocaleString('id-ID') : null,
        isFetching,
        isInitialized,
        consecutiveErrors,
        cache: {
            value: balanceCache.value,
            age: balanceCache.timestamp ? Date.now() - balanceCache.timestamp : null,
            isValid: balanceCache.isValid()
        },
        confirmation: { ...changeConfirmation },
        config: { ...CONFIG },
        interval: intervalManager.getCurrentInterval(),
        networkQuality: intervalManager.networkQuality,
        tabActive: intervalManager.isTabActive
    }),
    
    // Export data
    exportData: () => ({
        value: currentBalance,
        formatted: formatCurrency(currentBalance),
        timestamp: lastUpdateTime ? lastUpdateTime.toISOString() : null,
        metadata: {
            version: '2.0',
            updated: new Date().toISOString(),
            source: 'Google Sheets A100',
            confidence: consecutiveErrors === 0 ? 'high' : 'low'
        }
    })
};

// ==================== AUTO START ====================

// Start dengan delay kecil
setTimeout(() => {
    if (!isInitialized) {
        initializeBalanceSystem().catch(error => {
            console.error('Failed to initialize balance system:', error);
        });
    }
}, 100);

// Auto-start saat page load (backup)
if (document.readyState !== 'loading') {
    setTimeout(initializeBalanceSystem, 500);
}

// Export untuk module system (jika ada)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BalanceSystem };
}