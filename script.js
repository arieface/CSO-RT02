// ==================== KONFIGURASI ====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
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
window.addEventListener('balanceReady', (event) => {
    console.log("🎯 [Script] Balance.js siap!", event.detail);
    balanceSystemReady = true;
});

// Event 2: Data diupdate oleh balance.js - HANDLER UTAMA
window.addEventListener('balanceUpdated', (event) => {
    console.log("📬 [Script] Data baru diterima:", event.detail);
    
    if (event.detail && event.detail.saldo !== null && event.detail.saldo !== undefined) {
        const saldo = event.detail.saldo;
        
        const processedData = {
            raw: saldo.toString(),
            numeric: saldo,
            formatted: event.detail.formatted || 
                new Intl.NumberFormat('id-ID', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(saldo)
        };
        
        console.log("✅ [Script] Memproses saldo:", processedData);
        
        // Update UI
        updateSaldoDisplay(processedData);
        updateThemeBasedOnSaldo(processedData.numeric);
        lastSaldo = processedData.numeric;
        
        // Update status koneksi
        updateConnectionStatus('online');
        lastSuccessfulFetch = new Date();
        retryCount = 0;
        
        // Update waktu
        updateTime();
        
        console.log("🎨 [Script] UI berhasil diperbarui");
    } else {
        console.warn("⚠️ [Script] Data saldo tidak valid:", event.detail);
    }
});

// ==================== FUNGSI UTAMA ====================
async function fetchSaldo() {
    if (isRefreshing) {
        console.log("⏳ [Script] Fetch sudah berjalan...");
        return;
    }
    
    isRefreshing = true;
    updateConnectionStatus('connecting');
    console.log("📡 [Script] Memulai fetch saldo...");
    
    try {
        showLoadingState();
        
        // STRATEGI 1: Gunakan BalanceSystem (prioritas utama)
        if (balanceSystemReady && window.BalanceSystem) {
            console.log("🔄 [Script] Menggunakan BalanceSystem...");
            
            // Cek cache dulu
            const cachedSaldo = window.BalanceSystem.getCurrentSaldo();
            
            if (cachedSaldo !== null && cachedSaldo !== undefined) {
                console.log(`📊 [Script] Cache tersedia: ${cachedSaldo}`);
                
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
            }
            
            // Trigger refresh untuk data terbaru
            console.log("🔄 [Script] Meminta refresh dari BalanceSystem...");
            await window.BalanceSystem.refresh();
            
            // BalanceSystem akan mengirim event 'balanceUpdated' jika berhasil
            // UI akan otomatis update via event listener
            
            return; // SELESAI
        }
        
        // STRATEGI 2: Fallback langsung ke Google Sheets
        console.log("⚠️ [Script] BalanceSystem tidak siap, fallback ke direct fetch...");
        await fetchDirectFromGoogleSheets();
        
    } catch (error) {
        console.error("❌ [Script] Error fetch:", error);
        handleFetchError(error);
    } finally {
        setTimeout(() => {
            isRefreshing = false;
            console.log("✅ [Script] Fetch selesai");
        }, 1000);
    }
}

// ==================== FUNGSI FALLBACK ====================
async function fetchDirectFromGoogleSheets() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    try {
        console.log("📡 [Script] Direct fetch dari Google Sheets...");
        
        const timestamp = new Date().getTime();
        const randomParam = Math.random().toString(36).substring(7);
        
        const response = await fetch(`${SHEET_URL}&_=${timestamp}&rand=${randomParam}`, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
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
            
            console.log("✅ [Script] Direct fetch berhasil");
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
        cleaned = cleaned.replace(/Rp\s*/gi, '');
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(/,/g, '.');
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
    if (!saldoElement) {
        console.warn("⚠️ Element 'saldo' tidak ditemukan");
        return;
    }
    
    console.log("🎨 Updating display dengan:", data.formatted);
    
    saldoElement.className = 'amount';
    saldoElement.textContent = data.formatted;
    
    // Animasi update
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
    let statusText = ' ';
    
    if (saldo < 500000) {
        newTheme = 'red';
        statusText = 'Darurat!';
    } else if (saldo >= 500000 && saldo < 1000000) {
        newTheme = 'yellow-orange';
        statusText = 'Cukup';
    } else if (saldo >= 1000000) {
        newTheme = 'teal';
        statusText = 'Optimal';
    }
    
    updateStatusText(statusText);
    
    if (newTheme !== currentTheme) {
        console.log(`🎨 Changing theme: ${currentTheme} → ${newTheme}`);
        
        document.body.classList.add('changing-theme');
        
        setTimeout(() => {
            currentTheme = newTheme;
            document.body.setAttribute('data-theme', currentTheme);
            console.log(`✅ Theme changed: ${currentTheme} (Saldo: ${saldo.toLocaleString('id-ID')})`);
            
            setTimeout(() => {
                document.body.classList.remove('changing-theme');
            }, 2500);
        }, 100);
    }
}

function updateStatusText(status) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) {
        statusElement.textContent = status;
        
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
    
    if (saldoElement) {
        saldoElement.innerHTML = `
            <div class="loading-dots-container">
                <span></span><span></span><span></span>
            </div>
        `;
        saldoElement.className = 'amount';
    }
    
    if (statusElement) {
        statusElement.textContent = ' ';
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
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Tidak terhubung</span>';
            statusElement.classList.add('offline');
            break;
        case 'error':
            signalElement.classList.add('offline');
            signalText.textContent = 'Error';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Error • Mencoba lagi...</span>';
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
        if (!lastSuccessfulFetch || (Date.now() - lastSuccessfulFetch) > 300000) {
            fetchSaldo();
        }
    } else {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi');
    }
}

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 [Script] Aplikasi dimulai...");
    
    // Setup awal
    document.body.setAttribute('data-theme', 'default');
    checkConnection();
    
    // Event listeners
    window.addEventListener('online', () => {
        console.log("🌐 Online detected");
        checkConnection();
    });
    
    window.addEventListener('offline', () => {
        console.log("📴 Offline detected");
        checkConnection();
    });
    
    // Cek apakah balance.js sudah loaded
    if (window.BalanceSystem) {
        console.log("⚡ [Script] BalanceSystem sudah tersedia");
        balanceSystemReady = true;
    }
    
    // Tunggu balance.js siap, lalu fetch
    setTimeout(() => {
        console.log("⏰ [Script] Inisialisasi fetch pertama");
        fetchSaldo();
    }, 1000);
    
    // Update waktu
    updateTime();
    setInterval(updateTime, 1000);
    
    // Auto-refresh TIDAK diperlukan karena balance.js sudah handle
    // Tapi tetap ada sebagai backup
    setInterval(() => {
        if (isOnline && window.BalanceSystem) {
            console.log("🔄 [Script] Periodic check (backup)");
            window.BalanceSystem.refresh();
        }
    }, 300000); // 5 menit
});

// ==================== FUNGSI DEBUG ====================
window.debugFetch = function() {
    console.log("🔧 Debug: Manual fetch");
    fetchSaldo();
};

window.debugCheckData = function() {
    console.log("🔧 Debug: Data state");
    console.log("Balance System Ready:", balanceSystemReady);
    console.log("Is Refreshing:", isRefreshing);
    console.log("Retry Count:", retryCount);
    console.log("Last Fetch:", lastSuccessfulFetch);
    console.log("Is Online:", isOnline);
    console.log("Current Theme:", currentTheme);
    console.log("Last Saldo:", lastSaldo);
    
    if (window.BalanceSystem) {
        console.log("BalanceSystem Debug:", window.BalanceSystem.debug());
    } else {
        console.warn("BalanceSystem tidak tersedia");
    }
};

window.testTheme = function(saldo) {
    console.log("🎨 Testing theme dengan saldo:", saldo);
    updateThemeBasedOnSaldo(saldo);
    
    const formatted = new Intl.NumberFormat('id-ID').format(saldo);
    const saldoElement = document.getElementById('saldo');
    if (saldoElement) {
        saldoElement.textContent = formatted;
        saldoElement.className = 'amount';
        lastSaldo = saldo;
    }
};

window.forceBalanceUpdate = function() {
    if (window.BalanceSystem) {
        console.log("🔧 Force update BalanceSystem");
        window.BalanceSystem.forceRefresh();
    } else {
        console.warn("⚠️ BalanceSystem tidak tersedia");
    }
};
