//============ script.js
// ==================== KONFIGURASI ====================
let DATABASE_URL = null;
let balanceSystemReady = false;

// ==================== VARIABEL GLOBAL ====================
let isRefreshing = false;
let retryCount = 0;
const MAX_RETRIES = 3;
let lastSuccessfulFetch = null;
let isOnline = navigator.onLine;
let currentTheme = 'default';
let lastSaldo = 0;

// ==================== EVENT LISTENERS ====================

// Event 1: Balance.js siap
window.addEventListener('balanceReady', () => {
    console.log("🎯 [Script] Balance.js siap!");
    balanceSystemReady = true;
    
    // Set URL
    if (window.BalanceSystem && window.BalanceSystem.getCurrentSaldo()) {
        DATABASE_URL = "data_from_balance"; // Flag khusus
    }
    
    // Fetch data pertama
    setTimeout(fetchSaldo, 500);
});

// Event 2: Data diupdate oleh balance.js
window.addEventListener('balanceUpdated', (event) => {
    console.log("📬 [Script] Data baru dari balance.js:", event.detail);
    
    if (event.detail && event.detail.saldo) {
        const processedData = {
            raw: event.detail.saldo.toString(),
            numeric: event.detail.saldo,
            formatted: event.detail.formatted || 
                new Intl.NumberFormat('id-ID', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(event.detail.saldo)
        };
        
        updateSaldoDisplay(processedData);
        updateThemeBasedOnSaldo(processedData.numeric);
        lastSaldo = processedData.numeric;
        
        updateConnectionStatus('online');
        lastSuccessfulFetch = new Date();
        
        // Update waktu
        updateTime();
        
        console.log("✅ [Script] Tampilan diperbarui dari balance.js");
    }
});

// ==================== FUNGSI UTAMA ====================
async function fetchSaldo() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    updateConnectionStatus('connecting');
    
    try {
        console.log("📡 [Script] Memulai fetch saldo...");
        showLoadingState();
        
        // STRATEGI 1: Gunakan data dari balance.js jika siap
        if (balanceSystemReady && window.BalanceSystem) {
            const cachedSaldo = window.BalanceSystem.getCurrentSaldo();
            
            if (cachedSaldo !== null && cachedSaldo !== undefined) {
                console.log(`📊 [Script] Pakai cache: ${cachedSaldo}`);
                
                const processedData = {
                    raw: cachedSaldo.toString(),
                    numeric: cachedSaldo,
                    formatted: new Intl.NumberFormat('id-ID', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(cachedSaldo)
                };
                
                updateSaldoDisplay(processedData);
                updateThemeBasedOnSaldo(processedData.numeric);
                lastSaldo = processedData.numeric;
                
                updateConnectionStatus('online');
                lastSuccessfulFetch = new Date();
                
                return; // SELESAI
            }
        }
        
        // STRATEGI 2: Minta balance.js refresh
        if (window.BalanceSystem && window.BalanceSystem.refresh) {
            console.log("🔄 [Script] Minta balance.js refresh...");
            window.BalanceSystem.refresh();
            
            // Tunggu 3 detik untuk balance.js merespons
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Cek lagi
            if (window.BalanceSystem.getCurrentSaldo()) {
                const newSaldo = window.BalanceSystem.getCurrentSaldo();
                const processedData = {
                    raw: newSaldo.toString(),
                    numeric: newSaldo,
                    formatted: new Intl.NumberFormat('id-ID', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(newSaldo)
                };
                
                updateSaldoDisplay(processedData);
                updateThemeBasedOnSaldo(processedData.numeric);
                lastSaldo = processedData.numeric;
                
                updateConnectionStatus('online');
                lastSuccessfulFetch = new Date();
                
                return; // SELESAI
            }
        }
        
        // STRATEGY 3: Fallback langsung ke Google Sheets
        console.log("⚠️ [Script] Fallback ke Google Sheets langsung...");
        await fetchDirectFromGoogleSheets();
        
    } catch (error) {
        console.error("❌ [Script] Error fetch:", error);
        handleFetchError(error);
    } finally {
        setTimeout(() => {
            isRefreshing = false;
        }, 1000);
    }
}

// ==================== FUNGSI FALLBACK ====================
async function fetchDirectFromGoogleSheets() {
    const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    try {
        const response = await fetch(`${SHEET_URL}&_=${Date.now()}`, {
            signal: controller.signal,
            cache: 'no-store'
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        console.log("📄 [Script] Data langsung:", text);
        
        const processedData = processSaldoData(text);
        
        if (processedData) {
            updateSaldoDisplay(processedData);
            updateThemeBasedOnSaldo(processedData.numeric);
            lastSaldo = processedData.numeric;
            
            updateConnectionStatus('online');
            retryCount = 0;
            lastSuccessfulFetch = new Date();
        } else {
            throw new Error('Data tidak valid');
        }
        
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

function processSaldoData(rawData) {
    try {
        if (!rawData || rawData.trim() === '') {
            return null;
        }
        
        let cleaned = rawData.trim();
        
        // Bersihkan data
        cleaned = cleaned.replace(/Rp\s*/i, '');
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
        cleaned = cleaned.replace(/[^\d.-]/g, '');
        
        if (!cleaned) return null;
        
        const numericValue = parseFloat(cleaned);
        if (isNaN(numericValue)) return null;
        
        const formatted = new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(numericValue);
        
        return {
            raw: rawData,
            numeric: numericValue,
            formatted: formatted
        };
    } catch (error) {
        console.error("❌ Error process data:", error);
        return null;
    }
}

// ==================== FUNGSI UI ====================
function updateSaldoDisplay(data) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    saldoElement.className = 'amount';
    saldoElement.textContent = data.formatted;
    
    saldoElement.style.transition = 'all 0.5s ease';
    saldoElement.style.transform = 'scale(1.05)';
    saldoElement.style.opacity = '0.8';
    
    setTimeout(() => {
        saldoElement.style.transform = 'scale(1)';
        saldoElement.style.opacity = '1';
    }, 300);
    
    updateTime();
}

function updateThemeBasedOnSaldo(saldo) {
    let newTheme = 'default';
    let statusText = ' '; // Default status
    
    if (saldo < 500000) {
        newTheme = 'red';
        statusText = 'Darurat!';
    } else if (saldo >= 500000 && saldo < 1000000) {
        newTheme = 'yellow-orange';
        statusText = 'Terbatas';
    } else if (saldo >= 1000000) {
        newTheme = 'teal';
        statusText = 'Optimal';
    }
    
    // Update status text
    updateStatusText(statusText);
    
    if (newTheme !== currentTheme) {
        // Tambahkan kelas changing-theme untuk efek transisi
        document.body.classList.add('changing-theme');
        
        // Setelah sedikit delay, ubah tema
        setTimeout(() => {
            currentTheme = newTheme;
            document.body.setAttribute('data-theme', currentTheme);
            console.log(`🎨 Theme: ${currentTheme} (Saldo: ${saldo})`);
            
            // Setelah transisi selesai, hapus kelas changing-theme
            setTimeout(() => {
                document.body.classList.remove('changing-theme');
            }, 2500); // Sesuaikan dengan --transition-speed-bg
        }, 100);
    }
}

// Fungsi untuk memperbarui teks status
function updateStatusText(status) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) {
        statusElement.textContent = status;
        
        // Tambahkan animasi saat status berubah
        statusElement.style.transition = 'all 0.5s ease';
        statusElement.style.transform = 'scale(1.05)';
        statusElement.style.opacity = '0.8';
        
        setTimeout(() => {
            statusElement.style.transform = 'scale(1)';
            statusElement.style.opacity = '1';
        }, 300);
    }
}

function handleFetchError(error) {
    if (error.name === 'AbortError') {
        updateConnectionStatus('timeout');
        showError('Timeout - coba lagi');
    } else if (!navigator.onLine) {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi');
    } else {
        updateConnectionStatus('error');
        showError('Memuat data');
    }
    
    if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES}...`);
        setTimeout(fetchSaldo, 3000);
    }
}

function showLoadingState() {
    const saldoElement = document.getElementById('saldo');
    const statusElement = document.getElementById('status-text');
    const connectionStatusElement = document.getElementById('connection-status');
    
    if (saldoElement) {
        saldoElement.innerHTML = `
            <div class="loading-dots-container">
                <span></span><span></span><span></span>
            </div>
        `;
        saldoElement.className = 'amount';
    }
    
    // Update status ke "Memuat" saat loading
    if (statusElement) {
        statusElement.textContent = ' ';
    }
    
    if (connectionStatusElement) {
        connectionStatusElement.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span>Memuat data...</span>';
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
            signalText.textContent = 'Offline';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Offline • Menyambungkan...</span>';
            statusElement.classList.add('offline');
            break;
    }
}

function showError(message) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    saldoElement.textContent = message;
    saldoElement.className = 'amount error';
}

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
    const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    const timeString = `${namaHari[gmt7Time.getDay()]}, ${hari} ${namaBulan[bulanIndex]} ${tahun} • ${jam}:${menit}:${detik} WIB`;
    
    const waktuElement = document.getElementById('waktu');
    if (waktuElement) {
        waktuElement.textContent = timeString;
    }
}

function checkConnection() {
    isOnline = navigator.onLine;
    
    if (isOnline) {
        updateConnectionStatus('online');
        if (!lastSuccessfulFetch || (Date.now() - lastSuccessfulFetch) > 60000) {
            fetchSaldo();
        }
    } else {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi');
    }
}

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

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 [Script] Aplikasi dimulai...");
    
    // Setup awal
    document.body.setAttribute('data-theme', 'default');
    updateStatsDisplay();
    checkConnection();
    
    // Event listeners
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    // Cek apakah balance.js sudah ada
    if (window.BalanceSystem) {
        console.log("⚡ [Script] Balance.js sudah loaded");
        balanceSystemReady = true;
    }
    
    // Tunggu 2 detik baru fetch pertama
    setTimeout(() => {
        fetchSaldo();
    }, 2000);
    
    // Update waktu
    updateTime();
    setInterval(updateTime, 1000);
    
    // Auto-refresh
    setInterval(() => {
        if (isOnline) {
            fetchSaldo();
        }
    }, 60000);
});

// ==================== FUNGSI DEBUG ====================
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
    console.log("Current Theme:", currentTheme);
    console.log("Last Saldo:", lastSaldo);
    console.log("Balance System Ready:", balanceSystemReady);
    
    if (window.BalanceSystem && window.BalanceSystem.debug) {
        console.log("Balance System Debug:", window.BalanceSystem.debug());
    }
};

window.testTheme = function(saldo) {
    console.log("🎨 Testing theme dengan saldo:", saldo);
    updateThemeBasedOnSaldo(saldo);
    
    const saldoElement = document.getElementById('saldo');
    if (saldoElement) {
        const formatted = new Intl.NumberFormat('id-ID').format(saldo);
        saldoElement.textContent = formatted;
        saldoElement.className = 'amount';
        lastSaldo = saldo;
    }
};

window.forceBalanceUpdate = function() {
    if (window.BalanceSystem && window.BalanceSystem.forceRefresh) {
        window.BalanceSystem.forceRefresh();
        console.log("🔧 Manual update balance.js dipanggil");
    } else {
        console.warn("⚠️ BalanceSystem tidak tersedia");
    }
};