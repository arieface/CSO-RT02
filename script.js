// ==================== KONFIGURASI ====================
// GANTI DENGAN LINK PUBLIKASI GOOGLE SHEETS ANDA
const DATABASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";

// ==================== TEMA WARNA ====================
const THEMES = {
    red: {
        name: 'Red Theme',
        gradientStart: '#dc2626',
        gradientEnd: '#991b1b',
        primary: '#dc2626',
        primaryLight: 'rgba(220, 38, 38, 0.3)',
        shimmerMid: '#fca5a5',
        iconShadow: 'rgba(220, 38, 38, 0.3)'
    },
    orange: {
        name: 'Orange Theme',
        gradientStart: '#f97316',
        gradientEnd: '#ea580c',
        primary: '#f97316',
        primaryLight: 'rgba(249, 115, 22, 0.3)',
        shimmerMid: '#fdba74',
        iconShadow: 'rgba(249, 115, 22, 0.3)'
    },
    teal: {
        name: 'Teal Theme',
        gradientStart: '#14b8a6',
        gradientEnd: '#0d9488',
        primary: '#14b8a6',
        primaryLight: 'rgba(20, 184, 166, 0.3)',
        shimmerMid: '#5eead4',
        iconShadow: 'rgba(20, 184, 166, 0.3)'
    }
};

// ==================== VARIABEL GLOBAL ====================
let isRefreshing = false;
let retryCount = 0;
const MAX_RETRIES = 3;
let lastSuccessfulFetch = null;
let isOnline = navigator.onLine;
let currentTheme = 'teal';

// ==================== FUNGSI TEMA ====================
function applyTheme(themeName) {
    const theme = THEMES[themeName];
    if (!theme) return;
    
    const root = document.documentElement;
    root.style.setProperty('--theme-gradient-start', theme.gradientStart);
    root.style.setProperty('--theme-gradient-end', theme.gradientEnd);
    root.style.setProperty('--theme-primary', theme.primary);
    root.style.setProperty('--theme-primary-light', theme.primaryLight);
    root.style.setProperty('--theme-shimmer-mid', theme.shimmerMid);
    root.style.setProperty('--theme-icon-shadow', theme.iconShadow);
    
    currentTheme = themeName;
    
    // Update theme badge
    const themeBadge = document.getElementById('theme-indicator');
    if (themeBadge) {
        themeBadge.textContent = theme.name;
        themeBadge.style.color = theme.primary;
    }
    
    console.log(`🎨 Tema berubah ke: ${theme.name}`);
}

function determineTheme(saldoValue) {
    if (saldoValue < 500000) {
        return 'red';
    } else if (saldoValue >= 500000 && saldoValue < 1000000) {
        return 'orange';
    } else {
        return 'teal';
    }
}

// ==================== FUNGSI UTAMA ====================
async function fetchSaldo() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    updateConnectionStatus('connecting');
    
    try {
        console.log("📡 Mengambil data dari server...");
        
        // Update UI ke loading state
        showLoadingState();
        
        // Fetch data dengan timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const timestamp = new Date().getTime();
        const response = await fetch(`${DATABASE_URL}&_=${timestamp}`, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        console.log("✅ Data diterima:", text);
        
        // Process data
        const processedData = processSaldoData(text);
        
        // ✨ APPLY THEME BERDASARKAN SALDO
        const newTheme = determineTheme(processedData.numeric);
        if (newTheme !== currentTheme) {
            applyTheme(newTheme);
        }
        
        // Update display
        updateSaldoDisplay(processedData);
        updateConnectionStatus('online');
        retryCount = 0;
        lastSuccessfulFetch = new Date();
        
    } catch (error) {
        console.error("❌ Error:", error);
        
        if (error.name === 'AbortError') {
            updateConnectionStatus('timeout');
            showError('Coba lagi - server lambat');
        } else if (!navigator.onLine) {
            updateConnectionStatus('offline');
            showError('Offline - cek koneksi');
        } else if (error.message.includes('HTTP')) {
            updateConnectionStatus('error');
            showError('Database tidak dapat diakses');
        } else {
            updateConnectionStatus('offline');
            showError('Offline • Menyambungkan...');
        }
        
        // Retry logic
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} dalam 3 detik...`);
            setTimeout(fetchSaldo, 3000);
        }
        
    } finally {
        setTimeout(() => {
            isRefreshing = false;
        }, 1000);
    }
}

// ==================== FUNGSI PEMROSESAN DATA ====================
function processSaldoData(rawData) {
    console.log("🔧 Memproses data:", rawData);
    
    // Trim dan bersihkan data
    let cleaned = rawData.trim();
    
    // Cek jika data kosong
    if (!cleaned) {
        throw new Error('Data kosong');
    }
    
    // Coba berbagai format angka
    let numericValue;
    
    // Format 1: Rp 1.234.567 atau 1.234.567
    if (cleaned.includes('.')) {
        // Hapus Rp jika ada
        cleaned = cleaned.replace(/Rp\s*/i, '');
        // Hapus semua titik (pemisah ribuan)
        cleaned = cleaned.replace(/\./g, '');
        // Ganti koma dengan titik untuk desimal
        cleaned = cleaned.replace(',', '.');
    }
    // Format 2: 1,234,567 (format internasional)
    else if (cleaned.includes(',')) {
        // Hapus semua koma
        cleaned = cleaned.replace(/,/g, '');
    }
    
    // Cek jika ada karakter non-numerik selain minus dan titik
    if (!/^-?\d*\.?\d*$/.test(cleaned)) {
        throw new Error('Format data tidak valid');
    }
    
    // Konversi ke number
    numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue)) {
        throw new Error('Tidak dapat mengkonversi ke angka');
    }
    
    // Format ke Rupiah
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
    
    // Hapus semua class
    saldoElement.className = 'amount';
    
    // Update teks
    saldoElement.textContent = data.formatted;
    
    // Efek update halus
    saldoElement.style.opacity = '0.8';
    setTimeout(() => {
        saldoElement.style.opacity = '1';
    }, 300);
    
    // Update waktu
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
        statusElement.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span>Mengambil data terbaru...</span>';
    }
}

function updateConnectionStatus(status) {
    const signalElement = document.getElementById('connection-signal');
    const signalText = document.getElementById('signal-text');
    const statusElement = document.getElementById('connection-status');
    
    if (!signalElement || !signalText || !statusElement) return;
    
    // Reset class
    signalElement.className = 'connection-signal';
    statusElement.className = 'connection-status';
    
    switch(status) {
        case 'online':
            signalElement.classList.add('online');
            signalText.textContent = 'Online';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#10b981"></i> <span>Terhubung • Data real-time</span>';
            statusElement.classList.add('online');
            break;
            
        case 'connecting':
            signalText.textContent = 'Menghubungkan...';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#f59e0b"></i> <span>Menyambungkan...</span>';
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
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Offline • Menyambungkan...</span>';
            statusElement.classList.add('offline');
            break;
    }
}

function showError(message) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    // Ganti "Gagal" dengan "Coba" dan "Error" dengan "Offline"
    let displayMessage = message;
    
    if (message.includes('Gagal')) {
        displayMessage = message.replace('Gagal', 'Coba');
    }
    if (message.includes('Error')) {
        displayMessage = message.replace('Error', 'Offline');
    }
    if (message.includes('gagal')) {
        displayMessage = message.replace('gagal', 'coba');
    }
    if (message.includes('error')) {
        displayMessage = message.replace('error', 'offline');
    }
    
    saldoElement.textContent = displayMessage;
    saldoElement.className = 'amount error';
}

// ==================== FUNGSI UPDATE TIME ====================
function updateTime() {
    const now = new Date();
    const gmt7Time = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));

    // Format hari
    const hari = gmt7Time.getDate();
    const bulanIndex = gmt7Time.getMonth();
    const tahun = gmt7Time.getFullYear();
    
    // Format waktu
    const jam = String(gmt7Time.getHours()).padStart(2, '0');
    const menit = String(gmt7Time.getMinutes()).padStart(2, '0');
    const detik = String(gmt7Time.getSeconds()).padStart(2, '0');
    
    // Nama hari dalam bahasa Indonesia
    const namaHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const namaHariSekarang = namaHari[gmt7Time.getDay()];
    
    // Nama bulan dalam bahasa Indonesia
    const namaBulan = [
        "Januari", "Februari", "Maret", "April", 
        "Mei", "Juni", "Juli", "Agustus", 
        "September", "Oktober", "November", "Desember"
    ];
    const namaBulanSekarang = namaBulan[bulanIndex];
    
    // Format: Selasa, 10 Desember 2024 ~ 14:30:45 WIB
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
        // Jika baru online, fetch data
        if (!lastSuccessfulFetch || (Date.now() - lastSuccessfulFetch) > 300000) {
            fetchSaldo();
        }
    } else {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi server');
    }
}

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Aplikasi Kas RT02-RW18 dimulai...");
    
    // Set tema default
    applyTheme('teal');
    
    // Cek koneksi awal
    checkConnection();
    
    // Setup event listeners untuk koneksi
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    // Fetch data pertama
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
    
    // Cek koneksi secara berkala
    setInterval(checkConnection, 30000);
});

// ==================== FUNGSI DEBUG (untuk console) ====================
window.debugFetch = function() {
    console.log("🔧 Debug: Manual fetch");
    fetchSaldo();
};

window.testTheme = function(saldo) {
    console.log("🎨 Testing theme with saldo:", saldo);
    const theme = determineTheme(saldo);
    applyTheme(theme);
};

window.debugCheckData = function() {
    console.log("🔧 Debug: Check data state");
    console.log("Is Refreshing:", isRefreshing);
    console.log("Retry Count:", retryCount);
    console.log("Last Fetch:", lastSuccessfulFetch);
    console.log("Is Online:", isOnline);
    console.log("Current Theme:", currentTheme);
    console.log("Database URL:", DATABASE_URL);
};

// Fungsi untuk testing tema
window.testAllThemes = function() {
    console.log("🎨 Testing all themes...");
    console.log("Red Theme (< 500k):");
    testTheme(300000);
    
    setTimeout(() => {
        console.log("Orange Theme (500k - 1jt):");
        testTheme(750000);
    }, 2000);
    
    setTimeout(() => {
        console.log("Teal Theme (> 1jt):");
        testTheme(1500000);
    }, 4000);
};
