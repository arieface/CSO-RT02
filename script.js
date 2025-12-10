// ==================== KONFIGURASI ====================
// GANTI DENGAN LINK PUBLIKASI GOOGLE SHEETS ANDA
const DATABASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";

// ==================== VARIABEL GLOBAL ====================
let isRefreshing = false;
let retryCount = 0;
const MAX_RETRIES = 3;
let lastSuccessfulFetch = null;
let isOnline = navigator.onLine;

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

// MODIFIKASI: Fungsi untuk menerapkan tema berdasarkan saldo
function applyTheme(balance) {
    const body = document.body;
    
    // Hapus semua kelas tema yang ada
    body.classList.remove('theme-red', 'theme-yellow-orange', 'theme-teal');
    
    // Terapkan kelas tema berdasarkan saldo
    if (balance < 500000) {
        body.classList.add('theme-red');
        console.log("Tema Merah Diterapkan: Saldo < 500.000");
    } else if (balance >= 500000 && balance < 1000000) {
        body.classList.add('theme-yellow-orange');
        console.log("Tema Kuning-Orange Diterapkan: 500.000 ≤ Saldo < 1.000.000");
    } else {
        body.classList.add('theme-teal');
        console.log("Tema Teal Diterapkan: Saldo ≥ 1.000.000");
    }
}

// MODIFIKASI: Panggil fungsi applyTheme di dalam updateSaldoDisplay
function updateSaldoDisplay(data) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    // Hapus semua class
    saldoElement.className = 'amount';
    
    // Update teks
    saldoElement.textContent = data.formatted;
    
    // Terapkan tema berdasarkan saldo
    applyTheme(data.numeric);
    
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
        showError('Offline - cek koneksi server');
    }
}

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Aplikasi Kas RT02-RW18 dimulai...");
    
    updateStatsDisplay();
    
    checkConnection();
    
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    setTimeout(fetchSaldo, 500);
    
    updateTime();
    setInterval(updateTime, 1000);
    
    setInterval(() => {
        if (isOnline) {
            fetchSaldo();
        }
    }, 300000);
    
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
            statLabel.textContent = 'Akses';
        }
    }
}

// ==================== FUNGSI DEBUG (untuk console) ====================
window.debugFetch = function() {
    console.log("🔧 Debug: Manual fetch");
    fetchSaldo();
};

window.debugCheckData = function() {
    console.log("🔧 Debug: Check data state");
    console.log("Is Refreshing:", isRefreshing);
    console.log("Retry Count:", retryCount);
    console.log("Last Fetch:", lastSuccessfulFetch);
    console.log("Is Online:", isOnline);
    console.log("Database URL:", DATABASE_URL);
};

window.manualUpdateTime = function() {
    console.log("🔧 Debug: Manual update time");
    updateTime();
};

// MODIFIKASI: Fungsi untuk testing tema dan transisi
window.testTheme = function(balance) {
    const data = {
        raw: `Rp ${balance}`,
        numeric: balance,
        formatted: new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(balance)
    };
    
    updateSaldoDisplay(data);
    console.log(`Tema diuji dengan saldo: ${balance}`);
};
