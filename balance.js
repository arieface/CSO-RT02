/* ==================== BALANCE.JS - SISTEM PEMANTAUAN SALDO DENGAN VOTING ==================== */

/* ==================== KONFIGURASI ==================== */
const BALANCE_ENDPOINT = 'https://api.indolinknetwork.co.id/balance'; // Ganti dengan endpoint yang sesuai
const UPDATE_INTERVAL = 15000; // 15 detik
const MAX_READINGS = 5; // Window readings
const REQUIRED_CONSECUTIVE = 2; // Konfirmasi berturut-turut yang dibutuhkan
const SIGNIFICANT_CHANGE_THRESHOLD = 0.5; // 50% perubahan dianggap signifikan

/* ==================== VARIABEL STATE ==================== */
let stickyValue = null; // Nilai yang saat ini ditampilkan
let stickyCounter = 0; // Counter untuk konfirmasi berturut-turut
let readings = []; // Array untuk menyimpan pembacaan terakhir
let currentCandidate = null; // Kandidat nilai yang sedang diproses
let lastDisplayedBalance = null; // Nilai terakhir yang ditampilkan
let updateTimer = null; // Timer untuk update interval
let isFetching = false; // Flag untuk mencegah fetch bersamaan
let retryCount = 0; // Counter untuk retry
const MAX_RETRIES = 3; // Maksimal retry

/* ==================== ELEMEN DOM ==================== */
const balanceElement = document.getElementById('balance');
const currencyElement = document.getElementById('currency');
const statusElement = document.getElementById('balance-status');
const connectionSignal = document.querySelector('.connection-signal');
const signalBars = document.querySelectorAll('.signal-bar');
const body = document.body;

/* ==================== FUNGSI UTILITAS ==================== */

/**
 * Format angka menjadi format Rupiah
 * @param {number} amount - Jumlah yang akan diformat
 * @returns {string} String yang sudah diformat
 */
function formatRupiah(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return 'Error';
    }
    
    // Untuk saldo besar, tampilkan dalam jutaan
    if (amount >= 1000000) {
        const juta = (amount / 1000000).toFixed(3);
        return `${juta.replace('.', ',')} Jt`;
    }
    
    // Format biasa dengan pemisah ribuan
    return amount.toLocaleString('id-ID');
}

/**
 * Deteksi tema berdasarkan saldo
 * @param {number} balance - Saldo untuk menentukan tema
 */
function detectTheme(balance) {
    let theme = 'default'; // Default: silver theme
    
    if (balance < 500000) {
        theme = 'red';
    } else if (balance >= 500000 && balance <= 1000000) {
        theme = 'yellow-orange';
    } else if (balance > 1000000) {
        theme = 'teal';
    }
    
    // Terapkan tema dengan transisi halus
    body.classList.add('changing-theme');
    body.setAttribute('data-theme', theme);
    
    // Hapus class setelah transisi selesai
    setTimeout(() => {
        body.classList.remove('changing-theme');
    }, 2500);
}

/**
 * Update tampilan saldo
 * @param {number} balance - Saldo yang akan ditampilkan
 */
function updateDisplay(balance) {
    // Validasi input
    if (typeof balance !== 'number' || isNaN(balance) || balance < 0) {
        console.error('❌ [Display] Invalid balance value:', balance);
        balanceElement.textContent = 'Error';
        balanceElement.className = 'amount error';
        statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error loading balance';
        return;
    }
    
    // Format dan update saldo
    const formattedBalance = formatRupiah(balance);
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
    
    // Update tema berdasarkan saldo
    detectTheme(balance);
    
    console.log(`🖥️ [Display] Updated to: ${balance} (${formattedBalance})`);
}

/**
 * Reset state voting
 */
function resetVotingState() {
    console.log('🔄 [Voting] Resetting voting state');
    readings = [];
    currentCandidate = null;
    stickyCounter = 0;
}

/**
 * Cek apakah perubahan signifikan
 * @param {number} newValue - Nilai baru
 * @param {number} oldValue - Nilai lama
 * @returns {boolean} True jika perubahan signifikan
 */
function isSignificantChange(newValue, oldValue) {
    if (oldValue === null || oldValue === 0) return false;
    
    const changePercentage = Math.abs(newValue - oldValue) / oldValue;
    return changePercentage > SIGNIFICANT_CHANGE_THRESHOLD;
}

/**
 * Algoritma voting yang lebih responsif
 * @param {number} newValue - Nilai baru dari fetch
 * @returns {number|null} Nilai yang sudah divoting atau null
 */
function processVoting(newValue) {
    // Validasi input
    if (typeof newValue !== 'number' || isNaN(newValue)) {
        console.error('❌ [Voting] Invalid value for voting:', newValue);
        return stickyValue;
    }
    
    // Cek perubahan signifikan
    if (stickyValue !== null && isSignificantChange(newValue, stickyValue)) {
        console.log(`⚠️ [Voting] Significant change detected (${stickyValue} -> ${newValue}), resetting voting`);
        resetVotingState();
    }
    
    // Tambahkan nilai baru ke readings
    readings.push(newValue);
    
    // Batasi ukuran readings
    if (readings.length > MAX_READINGS) {
        readings.shift();
    }
    
    console.log('📊 [Voting] Readings:', readings);
    
    // Analisis frekuensi nilai dalam readings
    const valueCounts = {};
    readings.forEach(value => {
        valueCounts[value] = (valueCounts[value] || 0) + 1;
    });
    
    // Temukan nilai dengan frekuensi tertinggi
    let mostCommonValue = null;
    let highestCount = 0;
    
    for (const [value, count] of Object.entries(valueCounts)) {
        const numValue = parseInt(value);
        if (count > highestCount) {
            highestCount = count;
            mostCommonValue = numValue;
        } else if (count === highestCount && numValue !== mostCommonValue) {
            // Jika ada nilai dengan frekuensi sama, pilih yang terbaru
            const lastIndexNew = readings.lastIndexOf(numValue);
            const lastIndexCurrent = readings.lastIndexOf(mostCommonValue);
            
            if (lastIndexNew > lastIndexCurrent) {
                mostCommonValue = numValue;
            }
        }
    }
    
    // Jika tidak ada nilai yang memadai, return stickyValue yang ada
    if (!mostCommonValue || highestCount < 2) {
        console.log('📊 [Voting] No clear consensus yet');
        return stickyValue;
    }
    
    // Proses konfirmasi nilai
    if (mostCommonValue === currentCandidate) {
        // Nilai sama dengan kandidat saat ini
        stickyCounter++;
        console.log(`🔼 [Voting] Same candidate: ${mostCommonValue}, counter: ${stickyCounter}/${REQUIRED_CONSECUTIVE}`);
        
        if (stickyCounter >= REQUIRED_CONSECUTIVE) {
            // Konfirmasi tercapai
            console.log(`🎯 [Voting] Confirmation ${stickyCounter}/${REQUIRED_CONSECUTIVE} for ${mostCommonValue}`);
            
            if (stickyValue !== mostCommonValue) {
                console.log(`🔄 [Voting] Updating sticky value from ${stickyValue} to ${mostCommonValue}`);
                stickyValue = mostCommonValue;
                resetVotingState(); // Reset untuk nilai berikutnya
                return stickyValue;
            }
        }
    } else {
        // Nilai baru yang berbeda
        console.log(`🔄 [Voting] New candidate: ${mostCommonValue} (was: ${currentCandidate})`);
        currentCandidate = mostCommonValue;
        stickyCounter = 1;
        
        // Jika nilai baru langsung muncul beberapa kali, konfirmasi cepat
        if (highestCount >= REQUIRED_CONSECUTIVE) {
            console.log(`🎯 [Voting] Quick confirmation for ${mostCommonValue}`);
            stickyValue = mostCommonValue;
            resetVotingState();
            return stickyValue;
        }
    }
    
    // Return nilai saat ini jika belum ada perubahan
    return stickyValue;
}

/* ==================== FUNGSI FETCH & UPDATE ==================== */

/**
 * Fetch saldo dari server
 * @returns {Promise<number>} Promise yang mengembalikan saldo
 */
async function fetchBalance() {
    if (isFetching) {
        console.log('⏳ [Fetch] Already fetching, skipping...');
        throw new Error('Already fetching');
    }
    
    isFetching = true;
    
    try {
        // Simulasi API call - GANTI DENGAN FETCH ASLI
        // const response = await fetch(BALANCE_ENDPOINT);
        // if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // const data = await response.json();
        // return data.balance;
        
        // SIMULASI: Random balance untuk testing
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        
        const balances = [613000, 1300000, 750000, 200000, 950000];
        const randomBalance = balances[Math.floor(Math.random() * balances.length)];
        
        return randomBalance;
        
    } catch (error) {
        console.error('❌ [Fetch] Error fetching balance:', error);
        throw error;
    } finally {
        isFetching = false;
    }
}

/**
 * Update status koneksi
 * @param {boolean} isOnline - Status koneksi
 */
function updateConnectionStatus(isOnline) {
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
 * Handle error state
 */
function handleErrorState() {
    retryCount++;
    
    if (retryCount >= MAX_RETRIES) {
        console.error('❌ [Error] Max retries reached');
        balanceElement.textContent = 'Error';
        balanceElement.className = 'amount error';
        statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Connection Error';
        updateConnectionStatus(false);
    } else {
        console.log(`🔄 [Error] Retrying... (${retryCount}/${MAX_RETRIES})`);
    }
}

/**
 * Reset error state saat berhasil
 */
function resetErrorState() {
    retryCount = 0;
    updateConnectionStatus(true);
}

/**
 * Update saldo dengan mekanisme voting
 */
async function updateBalance() {
    if (isFetching) {
        console.log('⏳ [Balance] Already fetching, skipping this cycle');
        scheduleNextUpdate();
        return;
    }
    
    console.log('📡 [Balance] Fetching...');
    const startTime = performance.now();
    
    try {
        const newBalance = await fetchBalance();
        const fetchTime = performance.now() - startTime;
        console.log(`✅ [Balance] Fetched: ${newBalance} (${Math.round(fetchTime)}ms)`);
        
        // Reset error state jika berhasil
        resetErrorState();
        
        // Proses voting
        const votedValue = processVoting(newBalance);
        
        // Update display jika ada perubahan
        if (votedValue !== null && votedValue !== lastDisplayedBalance) {
            console.log(`🎨 [Balance] Updating display to: ${votedValue}`);
            updateDisplay(votedValue);
            lastDisplayedBalance = votedValue;
        } else if (votedValue === null && stickyValue !== null) {
            // Pertama kali atau saat startup
            console.log(`🔒 [Balance] Using sticky value: ${stickyValue}`);
            updateDisplay(stickyValue);
            lastDisplayedBalance = stickyValue;
        } else {
            console.log(`⏸️ [Balance] No change needed (display: ${lastDisplayedBalance}, voted: ${votedValue}, sticky: ${stickyValue})`);
        }
        
    } catch (error) {
        console.error('❌ [Balance] Error:', error);
        handleErrorState();
    } finally {
        scheduleNextUpdate();
    }
}

/**
 * Jadwalkan update berikutnya
 */
function scheduleNextUpdate() {
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
    
    updateTimer = setTimeout(() => {
        console.log('⏰ [Schedule] Next update');
        updateBalance();
    }, UPDATE_INTERVAL);
    
    // Update countdown display (opsional)
    updateCountdownDisplay(UPDATE_INTERVAL);
}

/**
 * Update countdown display (opsional)
 * @param {number} milliseconds - Waktu dalam milidetik
 */
function updateCountdownDisplay(milliseconds) {
    const seconds = Math.round(milliseconds / 1000);
    // Implementasi countdown display jika diperlukan
}

/* ==================== INISIALISASI ==================== */

/**
 * Inisialisasi aplikasi
 */
function initializeApp() {
    console.log('🚀 [App] Initializing...');
    
    // Set initial state
    updateConnectionStatus(navigator.onLine);
    
    // Event listener untuk online/offline
    window.addEventListener('online', () => {
        console.log('🌐 [App] Online event');
        updateConnectionStatus(true);
        if (retryCount > 0) {
            console.log('🔄 [App] Reconnecting...');
            updateBalance();
        }
    });
    
    window.addEventListener('offline', () => {
        console.log('🔌 [App] Offline event');
        updateConnectionStatus(false);
    });
    
    // Manual refresh button (opsional)
    const refreshButton = document.createElement('button');
    refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
    refreshButton.className = 'refresh-button';
    refreshButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--primary-color);
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 1000;
        transition: all 0.3s ease;
    `;
    refreshButton.addEventListener('click', () => {
        console.log('🔄 [App] Manual refresh');
        refreshButton.style.transform = 'rotate(360deg)';
        setTimeout(() => refreshButton.style.transform = '', 300);
        updateBalance();
    });
    
    // Tambahkan ke body
    document.body.appendChild(refreshButton);
    
    // Start pertama kali
    console.log('⏳ [App] Starting first update...');
    updateBalance();
    
    // Tambahkan animasi loading untuk feedback visual
    balanceElement.innerHTML = '<span class="loading-dots-container"><span></span><span></span><span></span></span>';
    balanceElement.className = 'amount';
}

/* ==================== EXPORT FUNGSI (UNTUK TESTING) ==================== */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatRupiah,
        processVoting,
        fetchBalance,
        updateDisplay,
        resetVotingState,
        isSignificantChange
    };
}

/* ==================== START APLIKASI ==================== */
// Tunggu sampai DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Auto-cleanup saat window ditutup
window.addEventListener('beforeunload', () => {
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
    console.log('👋 [App] Cleaning up...');
});