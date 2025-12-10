// ==================== KONFIGURASI ====================
const CONFIG = {
    DATA_FILE: 'balance.json',                // File data di repo
    GOOGLE_SHEETS_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv',
    REFRESH_INTERVAL: 30000,                  // Refresh setiap 30 detik
    CACHE_DURATION: 5 * 60 * 1000,           // Cache 5 menit
    MAX_RETRIES: 3
};

// ==================== STATE VARIABLES ====================
let currentTheme = 'default';
let isLoading = false;
let retryCount = 0;
let lastUpdateTime = null;

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Dashboard Kas RT02-RW18 dimulai');
    
    // 1. Tampilkan data dari localStorage dulu (instant)
    displayCachedData();
    
    // 2. Ambil data terbaru dari server
    fetchData();
    
    // 3. Setup auto refresh
    setInterval(fetchData, CONFIG.REFRESH_INTERVAL);
    
    // 4. Update waktu real-time
    updateTime();
    setInterval(updateTime, 1000);
    
    // 5. Event listeners
    setupEventListeners();
});

// ==================== FUNGSI UTAMA: FETCH DATA ====================
async function fetchData() {
    if (isLoading) return;
    
    isLoading = true;
    updateStatus('Mengambil data...', 'connecting');
    
    try {
        console.log('📡 Fetching data dari GitHub...');
        
        // Fetch dari balance.json di repo
        const response = await fetch(`${CONFIG.DATA_FILE}?t=${Date.now()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Data diterima:', data);
        
        // Validasi data
        if (!data || !data.saldo) {
            throw new Error('Data tidak valid');
        }
        
        // Process dan tampilkan data
        processAndDisplayData(data);
        
        // Simpan ke cache
        saveToCache(data);
        
        // Update status
        updateStatus(`Data: ${formatTime(data.timestamp)}`, 'online');
        
        // Reset retry count
        retryCount = 0;
        
    } catch (error) {
        console.error('❌ Error fetch data:', error);
        
        // Fallback ke Google Sheets langsung
        if (retryCount < CONFIG.MAX_RETRIES) {
            retryCount++;
            console.log(`🔄 Retry ${retryCount}/${CONFIG.MAX_RETRIES}...`);
            await fetchFromGoogleSheets();
        } else {
            updateStatus('Gagal mengambil data', 'offline');
            showError('Data tidak tersedia');
        }
        
    } finally {
        isLoading = false;
    }
}

// ==================== FALLBACK: AMBIL DARI GOOGLE SHEETS ====================
async function fetchFromGoogleSheets() {
    try {
        console.log('🌐 Fallback ke Google Sheets...');
        
        const response = await fetch(CONFIG.GOOGLE_SHEETS_URL);
        const text = await response.text();
        
        const numeric = processNumber(text);
        const formatted = formatRupiah(numeric);
        
        const data = {
            saldo: formatted,
            numeric: numeric,
            timestamp: new Date().toISOString(),
            source: 'google_sheets_direct'
        };
        
        processAndDisplayData(data);
        updateStatus('Online (Direct)', 'online');
        
        console.log('✅ Data dari Google Sheets:', formatted);
        
    } catch (error) {
        console.error('❌ Google Sheets juga gagal:', error);
        throw error;
    }
}

// ==================== PROCESS & DISPLAY DATA ====================
function processAndDisplayData(data) {
    // Update saldo display
    const saldoElement = document.getElementById('saldo');
    if (saldoElement) {
        saldoElement.textContent = data.saldo || formatRupiah(data.numeric);
        saldoElement.className = 'amount';
    }
    
    // Update theme berdasarkan saldo
    const saldoNumeric = data.numeric || processNumber(data.saldo);
    updateTheme(saldoNumeric);
    
    // Update last update time
    lastUpdateTime = data.timestamp ? new Date(data.timestamp) : new Date();
    updateTime();
    
    // Log untuk debugging
    console.log(`💰 Saldo: ${data.saldo}, Theme: ${currentTheme}`);
}

// ==================== CACHE SYSTEM ====================
function displayCachedData() {
    try {
        const cached = localStorage.getItem('kas_rt_cache');
        if (cached) {
            const data = JSON.parse(cached);
            const cacheTime = new Date(data.timestamp).getTime();
            const now = Date.now();
            
            // Gunakan cache jika kurang dari 5 menit
            if (now - cacheTime < CONFIG.CACHE_DURATION) {
                console.log('⚡ Menggunakan data cached');
                processAndDisplayData(data);
                updateStatus(`Cached: ${formatTime(data.timestamp)}`, 'online');
                return true;
            }
        }
    } catch (error) {
        console.error('Error reading cache:', error);
    }
    return false;
}

function saveToCache(data) {
    try {
        localStorage.setItem('kas_rt_cache', JSON.stringify(data));
        console.log('💾 Data disimpan ke cache');
    } catch (error) {
        console.error('Error saving cache:', error);
    }
}

// ==================== THEME MANAGEMENT ====================
function updateTheme(saldo) {
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
        console.log(`🎨 Theme berubah ke: ${currentTheme}`);
    }
}

// ==================== TIME FUNCTIONS ====================
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }) + ' WIB';
    
    const waktuElement = document.getElementById('waktu');
    if (waktuElement) {
        // Jika ada lastUpdateTime, tambahkan info
        if (lastUpdateTime) {
            const diff = Math.floor((now - lastUpdateTime) / 1000);
            const diffText = diff < 60 ? `${diff} detik lalu` : 
                           diff < 3600 ? `${Math.floor(diff/60)} menit lalu` : 
                           `${Math.floor(diff/3600)} jam lalu`;
            
            waktuElement.textContent = `${timeString} (Update: ${diffText})`;
        } else {
            waktuElement.textContent = timeString;
        }
    }
}

function formatTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== STATUS & UI UPDATES ====================
function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('connection-status');
    const signalElement = document.getElementById('connection-signal');
    const signalText = document.getElementById('signal-text');
    
    if (!statusElement || !signalElement || !signalText) return;
    
    // Update signal
    signalElement.className = 'connection-signal';
    if (type === 'online') signalElement.classList.add('online');
    if (type === 'offline') signalElement.classList.add('offline');
    
    // Update signal text
    signalText.textContent = type === 'online' ? 'Online' : 
                            type === 'offline' ? 'Offline' : 'Connecting';
    
    // Update status message
    statusElement.className = 'connection-status';
    statusElement.classList.add(type);
    
    let iconColor = '#f59e0b'; // default yellow
    if (type === 'online') iconColor = '#10b981';
    if (type === 'offline') iconColor = '#ef4444';
    
    statusElement.innerHTML = `<i class="fas fa-circle" style="color:${iconColor}"></i> <span>${message}</span>`;
}

function showError(message) {
    const saldoElement = document.getElementById('saldo');
    if (saldoElement) {
        saldoElement.textContent = message;
        saldoElement.className = 'amount error';
    }
}

// ==================== HELPER FUNCTIONS ====================
function processNumber(text) {
    if (!text) return 0;
    
    let cleaned = text.toString().trim();
    
    // Remove Rp, dots, and convert comma to dot
    cleaned = cleaned.replace(/Rp\s*/gi, '');
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(',', '.');
    
    // Remove any non-numeric characters except dot and minus
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    const result = parseFloat(cleaned);
    return isNaN(result) ? 0 : result;
}

function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID').format(number);
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Refresh ketika tab aktif kembali
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            console.log('🔄 Tab aktif, refresh data...');
            fetchData();
        }
    });
    
    // Refresh ketika online kembali
    window.addEventListener('online', function() {
        console.log('🌐 Koneksi online kembali');
        fetchData();
    });
    
    window.addEventListener('offline', function() {
        console.log('📴 Koneksi offline');
        updateStatus('Anda sedang offline', 'offline');
    });
    
    // Manual refresh dengan klik saldo
    document.getElementById('saldo')?.addEventListener('click', function() {
        if (!isLoading) {
            fetchData();
        }
    });
}

// ==================== DEBUG FUNCTIONS ====================
window.debugRefresh = function() {
    console.log('🔧 Manual refresh triggered');
    fetchData();
};

window.showDataInfo = function() {
    console.log('📊 Data Information:');
    console.log('Current Theme:', currentTheme);
    console.log('Is Loading:', isLoading);
    console.log('Retry Count:', retryCount);
    console.log('Last Update:', lastUpdateTime);
    console.log('Cache:', localStorage.getItem('kas_rt_cache'));
};
