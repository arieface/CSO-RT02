// ==================== KONFIGURASI OPTIMAL =====================
const CONFIG = {
    SHEET_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&single=true&output=csv",
    
    // ⭐ INTERVAL OPTIMAL: JANGAN terlalu cepat (20-30 detik)
    UPDATE_INTERVAL: 30000, // 30 detik
    
    // ⭐ CACHE DAN VALIDASI
    LOCAL_CACHE_TTL: 15000, // 15 detik cache lokal
    MAX_RETRIES: 2,
    
    // ⭐ MAJORITY VOTING SYSTEM
    VOTING_WINDOW: 5, // Simpan 5 pembacaan terakhir
    REQUIRED_CONSENSUS: 3, // Butuh 3x nilai sama untuk konfirmasi
    STICKY_THRESHOLD: 2, // Minimal 2x nilai sama untuk "sticky"
};

// ==================== VARIABEL GLOBAL ====================
let currentBalance = null;
let lastUpdateTime = null;
let isFetching = false;
let updateTimer = null;
let consecutiveStableReads = 0;
let votingHistory = [];
let lastStableValue = null;
let isValueSticky = false;

// ==================== MAJORITY VOTING SYSTEM ====================

class MajorityVotingSystem {
    constructor() {
        this.readings = [];
        this.maxReadings = CONFIG.VOTING_WINDOW;
        this.consensusThreshold = CONFIG.REQUIRED_CONSENSUS;
    }
    
    addReading(value) {
        const timestamp = Date.now();
        const reading = { value, timestamp };
        
        // Tambahkan ke history
        this.readings.push(reading);
        
        // Hapus yang terlama jika melebihi batas
        if (this.readings.length > this.maxReadings) {
            this.readings.shift();
        }
        
        console.log(`📊 [Voting] Readings: ${this.readings.map(r => r.value).join(', ')}`);
        
        return this.getConsensus();
    }
    
    getConsensus() {
        if (this.readings.length === 0) return null;
        
        // Hitung frekuensi setiap nilai
        const frequency = {};
        this.readings.forEach(reading => {
            const key = reading.value.toString();
            frequency[key] = (frequency[key] || 0) + 1;
        });
        
        // Cari nilai dengan frekuensi tertinggi
        let maxCount = 0;
        let consensusValue = null;
        
        Object.entries(frequency).forEach(([valueStr, count]) => {
            if (count > maxCount) {
                maxCount = count;
                consensusValue = parseFloat(valueStr);
            }
        });
        
        // Cek apakah mencapai consensus
        const hasConsensus = maxCount >= this.consensusThreshold;
        
        return {
            value: consensusValue,
            confidence: maxCount / this.readings.length,
            hasConsensus: hasConsensus,
            totalReadings: this.readings.length
        };
    }
    
    clear() {
        this.readings = [];
    }
}

const votingSystem = new MajorityVotingSystem();

// ==================== STICKY VALUE SYSTEM ====================

class StickyValueSystem {
    constructor() {
        this.stickyValue = null;
        this.stickySince = null;
        this.confirmationCount = 0;
        this.requiredConfirmations = CONFIG.STICKY_THRESHOLD;
    }
    
    checkSticky(newValue) {
        if (this.stickyValue === null) {
            // First time, set as sticky candidate
            this.stickyValue = newValue;
            this.stickySince = Date.now();
            this.confirmationCount = 1;
            return { isSticky: false, shouldChange: true };
        }
        
        // Check if value is the same as sticky
        if (Math.abs(newValue - this.stickyValue) < (this.stickyValue * 0.01)) {
            // Same value, increase confirmation
            this.confirmationCount++;
            
            console.log(`🎯 [Sticky] Confirmation ${this.confirmationCount}/${this.requiredConfirmations}`);
            
            if (this.confirmationCount >= this.requiredConfirmations) {
                // Value is now officially sticky
                return { isSticky: true, shouldChange: false };
            }
            
            return { isSticky: false, shouldChange: false };
        } else {
            // Different value, check if we should break stickiness
            const timeSticky = Date.now() - this.stickySince;
            const timeThreshold = 60000; // 1 menit
            
            if (timeSticky > timeThreshold) {
                // Sudah cukup lama, bisa ganti nilai
                console.log(`🔄 [Sticky] Breaking stickiness after ${Math.round(timeSticky/1000)}s`);
                this.stickyValue = newValue;
                this.stickySince = Date.now();
                this.confirmationCount = 1;
                return { isSticky: false, shouldChange: true };
            } else {
                // Masih dalam periode sticky, pertahankan nilai lama
                console.log(`🔒 [Sticky] Maintaining sticky value: ${this.stickyValue}`);
                return { isSticky: true, shouldChange: false };
            }
        }
    }
    
    getValue() {
        return this.stickyValue;
    }
    
    reset() {
        this.stickyValue = null;
        this.stickySince = null;
        this.confirmationCount = 0;
    }
}

const stickySystem = new StickyValueSystem();

// ==================== SMART FETCH SYSTEM ====================

async function smartFetch() {
    const startTime = Date.now();
    
    try {
        console.log(`📡 [Balance] Fetching...`);
        
        // Cache busting yang minimal
        const url = `${CONFIG.SHEET_URL}&_=${Date.now()}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const csvText = await response.text();
        
        // Simple parsing untuk A100
        const lines = csvText.split('\n');
        let targetLine;
        
        if (lines.length >= 100) {
            targetLine = lines[99];
        } else {
            targetLine = lines[lines.length - 1];
        }
        
        const cellValue = targetLine.split(',')[0] || '';
        
        // Clean and parse
        let cleaned = cellValue.replace(/[^\d.-]/g, '');
        if (cleaned.includes(',') && cleaned.includes('.')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (cleaned.includes(',')) {
            cleaned = cleaned.replace(',', '.');
        }
        
        const numericValue = parseFloat(cleaned);
        
        if (isNaN(numericValue)) {
            throw new Error('Invalid number');
        }
        
        const fetchTime = Date.now() - startTime;
        console.log(`✅ [Balance] Fetched: ${numericValue} (${fetchTime}ms)`);
        
        return numericValue;
        
    } catch (error) {
        console.error(`❌ [Balance] Fetch error: ${error.message}`);
        throw error;
    }
}

// ==================== MAIN UPDATE LOGIC ====================

async function updateBalance() {
    if (isFetching) return;
    
    isFetching = true;
    const updateStart = Date.now();
    
    try {
        // 1. Fetch data baru
        const newValue = await smartFetch();
        
        // 2. Tambahkan ke voting system
        const voteResult = votingSystem.addReading(newValue);
        
        // 3. Cek sticky system
        const stickyCheck = stickySystem.checkSticky(newValue);
        
        let finalValue = null;
        let shouldUpdateUI = false;
        let isSignificant = false;
        
        // 4. DECISION MAKING LOGIC
        if (stickyCheck.isSticky) {
            // Nilai masih sticky, pertahankan
            finalValue = stickySystem.getValue();
            console.log(`🔒 [Balance] Using sticky value: ${finalValue}`);
            shouldUpdateUI = false; // Jangan update UI karena sama
        } 
        else if (voteResult.hasConsensus && voteResult.confidence >= 0.6) {
            // Ada consensus yang kuat (>60%)
            finalValue = voteResult.value;
            shouldUpdateUI = true;
            isSignificant = true;
            console.log(`🎯 [Balance] Consensus reached: ${finalValue} (${(voteResult.confidence*100).toFixed(0)}% confidence)`);
        }
        else if (stickyCheck.shouldChange) {
            // Boleh ganti nilai (sticky period sudah lewat)
            finalValue = newValue;
            shouldUpdateUI = true;
            console.log(`🔄 [Balance] Changing value to: ${finalValue}`);
        }
        else {
            // Belum ada consensus dan belum boleh ganti
            finalValue = stickySystem.getValue() || currentBalance;
            shouldUpdateUI = false;
            console.log(`⏳ [Balance] Waiting for consensus/stickiness`);
        }
        
        // 5. Update jika perlu
        if (finalValue !== null && shouldUpdateUI) {
            // Cek jika benar-benar berbeda dari nilai saat ini
            if (currentBalance === null || 
                Math.abs(finalValue - currentBalance) > (currentBalance * 0.01)) {
                
                currentBalance = finalValue;
                lastUpdateTime = new Date();
                
                // Dispatch event dengan informasi lengkap
                dispatchBalanceUpdate(finalValue, isSignificant, {
                    voting: voteResult,
                    sticky: stickyCheck,
                    newValue: newValue
                });
            }
        }
        
    } catch (error) {
        console.error(`❌ [Balance] Update failed: ${error.message}`);
        
        // Jika error, coba gunakan nilai terakhir yang valid
        if (currentBalance !== null) {
            console.log(`🔄 [Balance] Using last known value due to error: ${currentBalance}`);
        }
    } finally {
        isFetching = false;
        
        // Schedule next update
        scheduleNextUpdate();
        
        const totalTime = Date.now() - updateStart;
        console.log(`⏱️ [Balance] Cycle: ${totalTime}ms`);
    }
}

// ==================== SCHEDULING ====================

function scheduleNextUpdate() {
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
    
    // Adaptive interval berdasarkan stability
    let nextInterval = CONFIG.UPDATE_INTERVAL;
    
    if (consecutiveStableReads > 3) {
        // Data stabil, bisa lebih lama
        nextInterval = Math.min(nextInterval * 1.5, 60000); // Max 60 detik
    } else if (consecutiveStableReads === 0) {
        // Data tidak stabil, lebih sering
        nextInterval = Math.max(nextInterval * 0.5, 10000); // Min 10 detik
    }
    
    updateTimer = setTimeout(() => {
        updateBalance();
    }, nextInterval);
    
    console.log(`⏰ [Balance] Next update in ${nextInterval/1000}s`);
}

// ==================== EVENT DISPATCH ====================

function dispatchBalanceUpdate(value, isSignificant, metadata = {}) {
    const formatted = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
    
    const eventDetail = {
        balance: value,
        formatted: formatted,
        timestamp: new Date().toISOString(),
        isSignificant: isSignificant,
        source: 'google-sheets',
        metadata: metadata
    };
    
    const event = new CustomEvent('balanceUpdated', { detail: eventDetail });
    window.dispatchEvent(event);
    
    console.log(`📢 [Balance] Updated: ${formatted} ${isSignificant ? '🔄' : ''}`);
}

// ==================== PUBLIC API ====================

window.BalanceSystem = {
    // Data
    getCurrentSaldo: () => currentBalance,
    getFormattedBalance: () => {
        if (currentBalance === null) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(currentBalance);
    },
    getLastUpdateTime: () => lastUpdateTime,
    
    // Actions
    refresh: () => {
        console.log('🔧 [Balance] Manual refresh');
        updateBalance();
    },
    forceRefresh: () => {
        console.log('⚡ [Balance] Force refresh - resetting systems');
        votingSystem.clear();
        stickySystem.reset();
        currentBalance = null;
        updateBalance();
    },
    
    // Configuration
    setUpdateInterval: (ms) => {
        if (ms >= 10000 && ms <= 120000) {
            CONFIG.UPDATE_INTERVAL = ms;
            console.log(`⏰ [Balance] Interval set to ${ms/1000}s`);
        }
    },
    
    // Debug
    debug: () => ({
        currentBalance,
        lastUpdate: lastUpdateTime,
        voting: votingSystem.getConsensus(),
        sticky: stickySystem.getValue(),
        config: { ...CONFIG }
    }),
    
    // Reset systems
    resetSystems: () => {
        votingSystem.clear();
        stickySystem.reset();
        console.log('🔄 [Balance] Systems reset');
    }
};

// ==================== INITIALIZATION ====================

function initialize() {
    console.log('🚀 [Balance] Initializing with voting system...');
    
    // Initial fetch
    updateBalance();
    
    // Event listeners
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('👁️ [Balance] Tab active, refreshing...');
            updateBalance();
        }
    });
    
    console.log('✅ [Balance] System ready');
    
    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('balanceReady'));
}

// Auto start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    setTimeout(initialize, 1000);
}