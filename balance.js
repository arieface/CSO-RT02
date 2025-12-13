/* ==================== BALANCE.JS - SISTEM PEMANTAUAN SALDO DENGAN VOTING ==================== */

/* ==================== KONFIGURASI ==================== */
const BALANCE_ENDPOINT = 'https://api.indolinknetwork.co.id/balance';
const UPDATE_INTERVAL = 15000;
const BALANCE_MAX_READINGS = 5;
const BALANCE_REQUIRED_CONSECUTIVE = 2;
const BALANCE_SIGNIFICANT_CHANGE = 0.5;

/* ==================== VARIABEL STATE ==================== */
// Gunakan namespace unik untuk menghindari konflik
const BalanceSystem = {
    stickyValue: null,
    stickyCounter: 0,
    readings: [],
    currentCandidate: null,
    lastDisplayedBalance: null,
    updateTimer: null,
    isFetching: false,
    retryCount: 0,
    MAX_RETRIES: 3
};

/* ==================== FUNGSI UTILITAS ==================== */

/**
 * Format angka menjadi format Rupiah
 */
function formatBalance(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return 'Error';
    }
    
    if (amount >= 1000000) {
        const juta = (amount / 1000000).toFixed(3);
        return `${juta.replace('.', ',')} Jt`;
    }
    
    return amount.toLocaleString('id-ID');
}

/**
 * Deteksi tema berdasarkan saldo
 */
function detectThemeFromBalance(balance) {
    if (!document.body) return;
    
    let theme = 'default';
    
    if (balance < 500000) {
        theme = 'red';
    } else if (balance >= 500000 && balance <= 1000000) {
        theme = 'yellow-orange';
    } else if (balance > 1000000) {
        theme = 'teal';
    }
    
    const body = document.body;
    body.classList.add('changing-theme');
    body.setAttribute('data-theme', theme);
    
    setTimeout(() => {
        body.classList.remove('changing-theme');
    }, 2500);
}

/**
 * Update tampilan saldo
 */
function updateBalanceDisplay(balance) {
    const balanceElement = document.getElementById('balance');
    const statusElement = document.getElementById('balance-status');
    
    if (!balanceElement || !statusElement) {
        console.error('❌ [Display] Balance elements not found');
        return;
    }
    
    if (typeof balance !== 'number' || isNaN(balance) || balance < 0) {
        console.error('❌ [Display] Invalid balance value:', balance);
        balanceElement.textContent = 'Error';
        balanceElement.className = 'amount error';
        statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error loading balance';
        return;
    }
    
    const formattedBalance = formatBalance(balance);
    balanceElement.textContent = formattedBalance;
    balanceElement.className = 'amount';
    
    // Update status
    if (balance < 50000) {
        statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Saldo Rendah';
        statusElement.style.color = 'var(--danger-color)';
    } else if (balance < 500000) {
        statusElement.innerHTML = '<i class="fas fa-info-circle"></i> Saldo Menengah';
        statusElement.style.color = 'var(--warning-color)';
    } else {
        statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Saldo Aman';
        statusElement.style.color = 'var(--success-color)';
    }
    
    // Update tema
    detectThemeFromBalance(balance);
    
    console.log(`🖥️ [Display] Updated to: ${balance} (${formattedBalance})`);
}

/**
 * Reset state voting
 */
function resetBalanceVoting() {
    console.log('🔄 [Balance] Resetting voting state');
    BalanceSystem.readings = [];
    BalanceSystem.currentCandidate = null;
    BalanceSystem.stickyCounter = 0;
}

/**
 * Cek apakah perubahan signifikan
 */
function isBalanceChangeSignificant(newValue, oldValue) {
    if (oldValue === null || oldValue === 0) return false;
    
    const changePercentage = Math.abs(newValue - oldValue) / oldValue;
    return changePercentage > BALANCE_SIGNIFICANT_CHANGE;
}

/**
 * Algoritma voting untuk balance
 */
function processBalanceVoting(newValue) {
    if (typeof newValue !== 'number' || isNaN(newValue)) {
        console.error('❌ [Balance] Invalid value for voting:', newValue);
        return BalanceSystem.stickyValue;
    }
    
    // Cek perubahan signifikan
    if (BalanceSystem.stickyValue !== null && 
        isBalanceChangeSignificant(newValue, BalanceSystem.stickyValue)) {
        console.log(`⚠️ [Balance] Significant change detected (${BalanceSystem.stickyValue} -> ${newValue})`);
        resetBalanceVoting();
    }
    
    // Tambahkan ke readings
    BalanceSystem.readings.push(newValue);
    
    // Batasi ukuran readings
    if (BalanceSystem.readings.length > BALANCE_MAX_READINGS) {
        BalanceSystem.readings.shift();
    }
    
    console.log('📊 [Balance] Readings:', BalanceSystem.readings);
    
    // Analisis frekuensi
    const valueCounts = {};
    BalanceSystem.readings.forEach(value => {
        valueCounts[value] = (valueCounts[value] || 0) + 1;
    });
    
    // Temukan nilai paling sering muncul
    let mostCommonValue = null;
    let highestCount = 0;
    
    for (const [value, count] of Object.entries(valueCounts)) {
        const numValue = parseInt(value);
        if (count > highestCount) {
            highestCount = count;
            mostCommonValue = numValue;
        } else if (count === highestCount && numValue !== mostCommonValue) {
            const lastIndexNew = BalanceSystem.readings.lastIndexOf(numValue);
            const lastIndexCurrent = BalanceSystem.readings.lastIndexOf(mostCommonValue);
            
            if (lastIndexNew > lastIndexCurrent) {
                mostCommonValue = numValue;
            }
        }
    }
    
    // Jika tidak ada konsensus
    if (!mostCommonValue || highestCount < 2) {
        console.log('📊 [Balance] No clear consensus yet');
        return BalanceSystem.stickyValue;
    }
    
    // Proses konfirmasi
    if (mostCommonValue === BalanceSystem.currentCandidate) {
        BalanceSystem.stickyCounter++;
        console.log(`🔼 [Balance] Same candidate: ${mostCommonValue}, counter: ${BalanceSystem.stickyCounter}/${BALANCE_REQUIRED_CONSECUTIVE}`);
        
        if (BalanceSystem.stickyCounter >= BALANCE_REQUIRED_CONSECUTIVE) {
            console.log(`🎯 [Balance] Confirmation ${BalanceSystem.stickyCounter}/${BALANCE_REQUIRED_CONSECUTIVE} for ${mostCommonValue}`);
            
            if (BalanceSystem.stickyValue !== mostCommonValue) {
                console.log(`🔄 [Balance] Updating sticky value from ${BalanceSystem.stickyValue} to ${mostCommonValue}`);
                BalanceSystem.stickyValue = mostCommonValue;
                resetBalanceVoting();
                return BalanceSystem.stickyValue;
            }
        }
    } else {
        console.log(`🔄 [Balance] New candidate: ${mostCommonValue} (was: ${BalanceSystem.currentCandidate})`);
        BalanceSystem.currentCandidate = mostCommonValue;
        BalanceSystem.stickyCounter = 1;
        
        if (highestCount >= BALANCE_REQUIRED_CONSECUTIVE) {
            console.log(`🎯 [Balance] Quick confirmation for ${mostCommonValue}`);
            BalanceSystem.stickyValue = mostCommonValue;
            resetBalanceVoting();
            return BalanceSystem.stickyValue;
        }
    }
    
    return BalanceSystem.stickyValue;
}

/* ==================== FUNGSI FETCH & UPDATE ==================== */

/**
 * Fetch saldo (simulasi)
 */
async function fetchBalanceData() {
    if (BalanceSystem.isFetching) {
        console.log('⏳ [Balance] Already fetching, skipping...');
        throw new Error('Already fetching');
    }
    
    BalanceSystem.isFetching = true;
    
    try {
        // Simulasi API call
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        
        const testBalances = [613000, 1300000, 750000, 200000, 950000];
        const randomBalance = testBalances[Math.floor(Math.random() * testBalances.length)];
        
        return randomBalance;
        
    } finally {
        BalanceSystem.isFetching = false;
    }
}

/**
 * Update status koneksi untuk balance
 */
function updateBalanceConnectionStatus(isOnline) {
    const connectionSignal = document.querySelector('.connection-signal');
    if (!connectionSignal) return;
    
    if (isOnline) {
        connectionSignal.classList.remove('offline');
        connectionSignal.innerHTML = `
            <div class="signal-bars">
                <div class="signal-bar"></div>
                <div class="signal-bar"></div>
                <div class="signal-bar"></div>
                <div class="signal-bar"></div>
            </div>
            <span>Online</span>
        `;
    } else {
        connectionSignal.classList.add('offline');
        connectionSignal.innerHTML = `
            <div class="signal-bars">
                <div class="signal-bar"></div>
                <div class="signal-bar"></div>
                <div class="signal-bar"></div>
                <div class="signal-bar"></div>
            </div>
            <span>Offline</span>
        `;
    }
}

/**
 * Handle error state untuk balance
 */
function handleBalanceError() {
    BalanceSystem.retryCount++;
    
    if (BalanceSystem.retryCount >= BalanceSystem.MAX_RETRIES) {
        console.error('❌ [Balance] Max retries reached');
        const balanceElement = document.getElementById('balance');
        const statusElement = document.getElementById('balance-status');
        
        if (balanceElement) {
            balanceElement.textContent = 'Error';
            balanceElement.className = 'amount error';
        }
        
        if (statusElement) {
            statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Connection Error';
        }
        
        updateBalanceConnectionStatus(false);
    } else {
        console.log(`🔄 [Balance] Retrying... (${BalanceSystem.retryCount}/${BalanceSystem.MAX_RETRIES})`);
    }
}

/**
 * Reset error state untuk balance
 */
function resetBalanceError() {
    BalanceSystem.retryCount = 0;
    updateBalanceConnectionStatus(true);
}

/**
 * Update saldo utama
 */
async function updateBalanceMain() {
    if (BalanceSystem.isFetching) {
        console.log('⏳ [Balance] Already fetching, skipping this cycle');
        scheduleBalanceUpdate();
        return;
    }
    
    console.log('📡 [Balance] Fetching...');
    const startTime = performance.now();
    
    try {
        const newBalance = await fetchBalanceData();
        const fetchTime = performance.now() - startTime;
        console.log(`✅ [Balance] Fetched: ${newBalance} (${Math.round(fetchTime)}ms)`);
        
        resetBalanceError();
        
        const votedValue = processBalanceVoting(newBalance);
        
        if (votedValue !== null && votedValue !== BalanceSystem.lastDisplayedBalance) {
            console.log(`🎨 [Balance] Updating display to: ${votedValue}`);
            updateBalanceDisplay(votedValue);
            BalanceSystem.lastDisplayedBalance = votedValue;
        } else if (votedValue === null && BalanceSystem.stickyValue !== null) {
            console.log(`🔒 [Balance] Using sticky value: ${BalanceSystem.stickyValue}`);
            updateBalanceDisplay(BalanceSystem.stickyValue);
            BalanceSystem.lastDisplayedBalance = BalanceSystem.stickyValue;
        } else {
            console.log(`⏸️ [Balance] No change needed (display: ${BalanceSystem.lastDisplayedBalance}, voted: ${votedValue}, sticky: ${BalanceSystem.stickyValue})`);
        }
        
    } catch (error) {
        console.error('❌ [Balance] Error:', error);
        handleBalanceError();
    } finally {
        scheduleBalanceUpdate();
    }
}

/**
 * Jadwalkan update berikutnya
 */
function scheduleBalanceUpdate() {
    if (BalanceSystem.updateTimer) {
        clearTimeout(BalanceSystem.updateTimer);
    }
    
    BalanceSystem.updateTimer = setTimeout(() => {
        console.log('⏰ [Balance] Next update scheduled');
        updateBalanceMain();
    }, UPDATE_INTERVAL);
}

/* ==================== FUNGSI DEBUG & TEST ==================== */

/**
 * Fungsi debug untuk testing
 */
function debugBalanceSystem() {
    console.log('🔧 [Balance Debug] System State:', {
        stickyValue: BalanceSystem.stickyValue,
        stickyCounter: BalanceSystem.stickyCounter,
        readings: BalanceSystem.readings,
        currentCandidate: BalanceSystem.currentCandidate,
        lastDisplayedBalance: BalanceSystem.lastDisplayedBalance,
        retryCount: BalanceSystem.retryCount,
        isFetching: BalanceSystem.isFetching
    });
}

/**
 * Manual update balance
 */
function forceBalanceUpdate() {
    console.log('🔧 [Balance] Manual update triggered');
    updateBalanceMain();
}

/**
 * Test tema dengan saldo tertentu
 */
function testBalanceTheme(balance) {
    console.log(`🎨 [Balance] Testing theme for balance: ${balance}`);
    updateBalanceDisplay(balance);
}

/* ==================== INISIALISASI ==================== */

/**
 * Inisialisasi balance system
 */
function initializeBalanceSystem() {
    console.log('🚀 [Balance] Initializing...');
    
    // Cek elemen DOM
    const balanceElement = document.getElementById('balance');
    if (!balanceElement) {
        console.error('❌ [Balance] Balance element not found, waiting for DOM...');
        setTimeout(initializeBalanceSystem, 100);
        return;
    }
    
    // Set initial connection status
    updateBalanceConnectionStatus(navigator.onLine);
    
    // Event listeners untuk koneksi
    window.addEventListener('online', () => {
        console.log('🌐 [Balance] Online event detected');
        updateBalanceConnectionStatus(true);
        if (BalanceSystem.retryCount > 0) {
            console.log('🔄 [Balance] Reconnecting after offline');
            updateBalanceMain();
        }
    });
    
    window.addEventListener('offline', () => {
        console.log('🔌 [Balance] Offline event detected');
        updateBalanceConnectionStatus(false);
    });
    
    // Tambahkan button refresh manual (jika belum ada)
    if (!document.querySelector('.balance-refresh-button')) {
        const refreshButton = document.createElement('button');
        refreshButton.className = 'balance-refresh-button';
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshButton.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 16px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            transition: all 0.3s ease;
        `;
        
        refreshButton.addEventListener('mouseenter', () => {
            refreshButton.style.transform = 'scale(1.1)';
        });
        
        refreshButton.addEventListener('mouseleave', () => {
            refreshButton.style.transform = 'scale(1)';
        });
        
        refreshButton.addEventListener('click', () => {
            console.log('🔄 [Balance] Manual refresh');
            refreshButton.style.transform = 'rotate(360deg)';
            setTimeout(() => refreshButton.style.transform = '', 300);
            forceBalanceUpdate();
        });
        
        document.body.appendChild(refreshButton);
    }
    
    // Start pertama kali
    console.log('⏳ [Balance] Starting first update...');
    updateBalanceMain();
    
    // Set loading state
    balanceElement.innerHTML = '<span class="loading-dots-container"><span></span><span></span><span></span></span>';
    balanceElement.className = 'amount';
}

/* ==================== EXPORT FUNGSI UNTUK GLOBAL ACCESS ==================== */
// Buat namespace global untuk balance system
window.BalanceSystem = {
    debug: debugBalanceSystem,
    forceUpdate: forceBalanceUpdate,
    testTheme: testBalanceTheme,
    getState: () => BalanceSystem,
    reset: resetBalanceVoting
};

/* ==================== START BALANCE SYSTEM ==================== */
// Tunggu DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBalanceSystem);
} else {
    setTimeout(initializeBalanceSystem, 100); // Kasih delay kecil
}

// Auto-cleanup
window.addEventListener('beforeunload', () => {
    if (BalanceSystem.updateTimer) {
        clearTimeout(BalanceSystem.updateTimer);
    }
    console.log('👋 [Balance] Cleaning up...');
});