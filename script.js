[file name]: script.js
[file content begin]
// ==================== KONFIGURASI ====================
// URL utama (cache server) - GANTI DENGAN URL ANDA
const CACHE_SERVER_URL = const CACHE_SERVER_URL = FALLBACK_SERVER_URL;

// URL fallback langsung ke sumber data
const FALLBACK_SERVER_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";

// ==================== VARIABEL GLOBAL ====================
let isRefreshing = false;
let retryCount = 0;
const MAX_RETRIES = 3;
let lastSuccessfulFetch = null;
let isOnline = navigator.onLine;
let currentTheme = 'default';
let lastSaldo = 0;
let currentServer = 'cache'; // 'cache' atau 'fallback'

// ==================== FUNGSI UBAH THEME ====================
function updateThemeBasedOnSaldo(saldo) {
    let newTheme = 'default';
    
    if (saldo < 500000) {
        newTheme = 'red';
    } else if (saldo >= 500000 && saldo < 1000000) {
        newTheme = 'yellow-orange';
    } else if (saldo >= 1000000) {
        newTheme = 'teal';
    }
    
    if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        document.body.setAttribute('data-theme', currentTheme);
        console.log(`🎨 Theme berubah ke: ${currentTheme} (Saldo: ${saldo})`);
    }
}

// ==================== FUNGSI UTAMA DENGAN FALLBACK ====================
async function fetchSaldo() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    updateConnectionStatus('connecting');
    
    try {
        console.log(`📡 Mencoba server: ${currentServer}`);
        
        showLoadingState();
        
        // Coba cache server terlebih dahulu
        if (currentServer === 'cache') {
            await fetchFromCacheServer();
        } else {
            // Jika sebelumnya gagal, coba fallback
            await fetchFromFallbackServer();
        }
        
    } catch (error) {
        console.error(`❌ Gagal dari server ${currentServer}:`, error);
        
        // Switch server jika gagal
        if (currentServer === 'cache') {
            console.log('🔄 Beralih ke server fallback...');
            currentServer = 'fallback';
            retryCount = 0;
            
            // Coba fetch dari fallback
            try {
                await fetchFromFallbackServer();
            } catch (fallbackError) {
                handleFetchError(fallbackError);
            }
        } else {
            // Jika fallback juga gagal
            handleFetchError(error);
        }
        
    } finally {
        setTimeout(() => {
            isRefreshing = false;
        }, 1000);
    }
}

// ==================== FUNGSI FETCH DARI CACHE SERVER ====================
async function fetchFromCacheServer() {
    console.log("🚀 Mengambil dari cache server...");
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${CACHE_SERVER_URL}?_=${Date.now()}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache'
        }
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
        throw new Error(`Cache server HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
        throw new Error(result.error || 'Cache server error');
    }
    
    console.log(`✅ Data dari cache server: ${result.data?.formatted}`);
    console.log(`📦 Cached: ${result.cached ? 'Ya' : 'Tidak'}`);
    
    updateDisplayWithData(result.data, 'cache');
}

// ==================== FUNGSI FETCH DARI FALLBACK SERVER ====================
async function fetchFromFallbackServer() {
    console.log("🌐 Mengambil dari server fallback...");
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const timestamp = new Date().getTime();
    const response = await fetch(`${FALLBACK_SERVER_URL}&_=${timestamp}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache'
        }
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
        throw new Error(`Fallback server HTTP ${response.status}`);
    }
    
    const text = await response.text();
    console.log("📄 Data mentah dari fallback:", text);
    
    const processedData = processSaldoData(text);
    updateDisplayWithData(processedData, 'fallback');
}

// ==================== FUNGSI UPDATE DISPLAY ====================
function updateDisplayWithData(data, source) {
    // Update saldo dan theme
    updateSaldoDisplay(data);
    updateThemeBasedOnSaldo(data.numeric);
    lastSaldo = data.numeric;
    
    // Update status berdasarkan sumber
    if (source === 'cache') {
        updateConnectionStatus('online');
        document.getElementById('signal-text').textContent = 'Online (Cache)';
    } else {
        updateConnectionStatus('online');
        document.getElementById('signal-text').textContent = 'Online (Direct)';
    }
    
    retryCount = 0;
    lastSuccessfulFetch = new Date();
    
    // Log sumber data
    console.log(`✅ Data berhasil diambil dari: ${source}`);
}

// ==================== FUNGSI PEMROSESAN DATA ====================
function processSaldoData(rawData) {
    console.log("🔧 Memproses data...");
    
    let cleaned = rawData.trim();
    
    if (!cleaned) {
        throw new Error('Data kosong dari server');
    }
    
    // Format 1: Rp 1.234.567 atau 1.234.567
    if (cleaned.includes('.')) {
        cleaned = cleaned.replace(/Rp\s*/i, '');
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
    }
    // Format 2: 1,234,567 (format internasional)
    else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(/,/g, '');
    }
    
    if (!/^-?\d*\.?\d*$/.test(cleaned)) {
        throw new Error('Format data tidak valid');
    }
    
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue)) {
        throw new Error('Tidak dapat mengkonversi data ke angka');
    }
    
    const formatted = new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(numericValue);
    
    return {
        raw: rawData,
        numeric: numericValue,
        formatted: formatted
    };
}

// ==================== FUNGSI UI ====================
function updateSaldoDisplay(data) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    saldoElement.className = 'amount';
    saldoElement.textContent = data.formatted;
    
    // Efek visual update
    saldoElement.style.transition = 'all 0.5s ease';
    saldoElement.style.transform = 'scale(1.05)';
    saldoElement.style.opacity = '0.8';
    
    setTimeout(() => {
        saldoElement.style.transform = 'scale(1)';
        saldoElement.style.opacity = '1';
    }, 300);
    
    updateTime();
}

function showLoadingState() {
    const saldoElement = document.getElementById('saldo');
    const statusElement = document.getElementById('connection-status');
    
    if (saldoElement) {
        saldoElement.innerHTML = `
            <div class="loading-dots-container">
                <span></span><span></span><span></span>
            </div>
        `;
        saldoElement.className = 'amount';
    }
    
    if (statusElement) {
        const sourceText = currentServer === 'cache' ? 'cache server' : 'server langsung';
        statusElement.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> <span>Mengambil data dari ${sourceText}...</span>`;
    }
}

function updateConnectionStatus(status) {
    const signalElement = document.getElementById('connection-signal');
    const signalText = document.getElementById('signal-text');
    const statusElement = document.getElementById('connection-status');
    
    if (!signalElement || !signalText || !statusElement) return;
    
    signalElement.className = 'connection-signal';
    statusElement.className = 'connection-status';
    
    switch(status) {
        case 'online':
            signalElement.classList.add('online');
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#10b981"></i> <span>Terhubung • Data real-time</span>';
            statusElement.classList.add('online');
            break;
            
        case 'connecting':
            signalText.textContent = 'Menghubungkan...';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#f59e0b"></i> <span>Menyambungkan ke server...</span>';
            break;
            
        case 'timeout':
            signalElement.classList.add('offline');
            signalText.textContent = 'Timeout';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#f59e0b"></i> <span>Server lambat • Mencoba lagi...</span>';
            statusElement.classList.add('offline');
            break;
            
        case 'offline':
            signalElement.classList.add('offline');
            signalText.textContent = 'Offline';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Server offline</span>';
            statusElement.classList.add('offline');
            break;
            
        case 'error':
            signalElement.classList.add('offline');
            signalText.textContent = 'Error';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Koneksi server terputus</span>';
            statusElement.classList.add('offline');
            break;
    }
}

function handleFetchError(error) {
    console.error("❌ Error detail:", error);
    
    if (error.name === 'AbortError') {
        updateConnectionStatus('timeout');
        showError('Coba lagi - server lambat');
    } else if (!navigator.onLine) {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi internet');
    } else if (error.message.includes('HTTP')) {
        updateConnectionStatus('error');
        showError('Server tidak dapat diakses');
    } else {
        updateConnectionStatus('offline');
        showError('Koneksi terputus • Menyambungkan...');
    }
    
    // Retry logic
    if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} dalam 3 detik...`);
        setTimeout(fetchSaldo, 3000);
    } else {
        // Reset ke cache server setelah beberapa retry
        console.log('🔄 Reset ke cache server...');
        currentServer = 'cache';
        retryCount = 0;
    }
}

function showError(message) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    saldoElement.textContent = message;
    saldoElement.className = 'amount error';
}

// ==================== FUNGSI UPDATE TIME ====================
function updateTime() {
    const now = new Date();
    const gmt7Time = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));

    const hari = gmt7Time.getDate();
    const bulanIndex = gmt7Time.getMonth();
    const tahun = gmt7Time.getFullYear();
    
    const jam = String(gmt7Time.getHours()).padStart(2, '0');
    const menit = String(gmt7Time.getMinutes()).padStart(2, '0');
    const detik = String(gmt7Time.getSeconds()).padStart(2, '0');
    
    const namaHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const namaHariSekarang = namaHari[gmt7Time.getDay()];
    
    const namaBulan = [
        "Januari", "Februari", "Maret", "April", 
        "Mei", "Juni", "Juli", "Agustus", 
        "September", "Oktober", "November", "Desember"
    ];
    const namaBulanSekarang = namaBulan[bulanIndex];
    
    const timeString = `${namaHariSekarang}, ${hari} ${namaBulanSekarang} ${tahun} • ${jam}:${menit}:${detik} WIB`;
    
    const waktuElement = document.getElementById('waktu');
    if (waktuElement) {
        waktuElement.textContent = timeString;
    }
}

// ==================== FUNGSI DETEKSI KONEKSI ====================
function checkConnection() {
    isOnline = navigator.onLine;
    
    if (isOnline) {
        updateConnectionStatus('online');
        if (!lastSuccessfulFetch || (Date.now() - lastSuccessfulFetch) > 300000) {
            fetchSaldo();
        }
    } else {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi internet');
    }
}

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Aplikasi Kas RT02-RW18 dimulai...");
    console.log("🌐 Cache Server URL:", CACHE_SERVER_URL);
    console.log("🔄 Fallback Server URL:", FALLBACK_SERVER_URL);
    
    document.body.setAttribute('data-theme', 'default');
    updateStatsDisplay();
    checkConnection();
    
    // Event listeners
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    // Fetch pertama dengan delay kecil
    setTimeout(fetchSaldo, 500);
    
    // Update waktu setiap detik
    updateTime();
    setInterval(updateTime, 1000);
    
    // Auto-refresh setiap 5 menit
    setInterval(() => {
        if (isOnline) {
            fetchSaldo();
        }
    }, 300000);
    
    // Cek koneksi berkala
    setInterval(checkConnection, 30000);
});

// ==================== FUNGSI TAMBAHAN ====================
function updateStatsDisplay() {
    const statItems = document.querySelectorAll('.stat-item');
    if (statItems.length >= 2) {
        const timeStat = statItems[1];
        const statValue = timeStat.querySelector('.stat-value');
        const statLabel = timeStat.querySelector('.stat-label');
        
        if (statValue && statLabel) {
            statValue.textContent = '24 Jam';
            statLabel.textContent = 'Akses Server';
        }
    }
}

// ==================== DEBUG FUNCTIONS ====================
window.debugFetch = function() {
    console.log("🔧 Debug: Manual fetch");
    console.log("Current server:", currentServer);
    console.log("Retry count:", retryCount);
    fetchSaldo();
};

window.switchServer = function(serverType) {
    if (serverType === 'cache' || serverType === 'fallback') {
        currentServer = serverType;
        console.log(`🔄 Switch ke server: ${serverType}`);
        fetchSaldo();
    }
};

window.showServerInfo = function() {
    console.log("📊 Server Information:");
    console.log("Current server:", currentServer);
    console.log("Cache URL:", CACHE_SERVER_URL);
    console.log("Fallback URL:", FALLBACK_SERVER_URL);
    console.log("Last successful fetch:", lastSuccessfulFetch);
    console.log("Last saldo:", lastSaldo);
};
[file content end]
