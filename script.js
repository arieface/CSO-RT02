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
let lastUISaldo = 0;
let lastUIUpdate = 0;
const MIN_UI_UPDATE_INTERVAL = 5000; // Minimal 5 detik antara update UI
let pendingUpdates = []; // Queue untuk update yang tertunda
let isProcessingQueue = false;

// ==================== EVENT LISTENERS ====================

// Event 1: Balance.js siap
window.addEventListener('balanceReady', () => {
    console.log("🎯 [Script] Balance.js siap!");
    balanceSystemReady = true;
    
    // Set URL
    if (window.BalanceSystem && window.BalanceSystem.getCurrentSaldo()) {
        DATABASE_URL = "data_from_balance";
    }
    
    // Fetch data pertama
    setTimeout(fetchSaldo, 1000);
});

// Event 2: Data diupdate oleh balance.js - DIPERBAIKI
window.addEventListener('balanceUpdated', (event) => {
    if (!event.detail || event.detail.balance === undefined) {
        console.warn("⚠️ [Script] Event detail tidak valid");
        return;
    }
    
    console.log("📬 [Script] Data baru dari balance.js:", {
        balance: event.detail.balance,
        formatted: event.detail.formatted,
        isSignificant: event.detail.isSignificant,
        source: event.detail.source
    });
    
    // Tambahkan ke pending queue dengan prioritas
    const priority = event.detail.isSignificant ? 1 : 2;
    addToUpdateQueue(event.detail, priority);
    
    // Proses queue jika belum diproses
    if (!isProcessingQueue) {
        processUpdateQueue();
    }
});

// ==================== UPDATE QUEUE SYSTEM ====================

function addToUpdateQueue(data, priority) {
    const update = {
        data: data,
        priority: priority,
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9)
    };
    
    pendingUpdates.push(update);
    
    // Urutkan berdasarkan prioritas (1 = tinggi, 2 = rendah)
    pendingUpdates.sort((a, b) => a.priority - b.priority);
    
    // Batasi queue maksimal 5 item
    if (pendingUpdates.length > 5) {
        pendingUpdates = pendingUpdates.slice(0, 5);
    }
    
    console.log(`📥 [Queue] Added update #${update.id}, queue size: ${pendingUpdates.length}`);
}

async function processUpdateQueue() {
    if (isProcessingQueue || pendingUpdates.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    try {
        while (pendingUpdates.length > 0) {
            const update = pendingUpdates.shift();
            const now = Date.now();
            
            // ⭐ RATE LIMITING: Minimal 5 detik antara update UI yang signifikan
            if (update.priority === 1) { // Update signifikan
                if (now - lastUIUpdate < MIN_UI_UPDATE_INTERVAL) {
                    console.log(`⏳ [Queue] Skipping significant update (too soon)`);
                    continue;
                }
            }
            
            // ⭐ DEBOUNCING: Cek jika nilai benar-benar berubah
            const newValue = update.data.balance;
            const changeThreshold = lastUISaldo * 0.01; // 1% threshold
            
            if (lastUISaldo !== 0 && Math.abs(newValue - lastUISaldo) < changeThreshold) {
                console.log(`⚖️ [Queue] Change too small (${Math.abs(newValue - lastUISaldo)}), skipping`);
                continue;
            }
            
            // ⭐ STALENESS CHECK: Abaikan update yang terlalu lama (>10 detik)
            if (now - update.timestamp > 10000) {
                console.log(`🧹 [Queue] Discarding stale update (${Math.round((now - update.timestamp)/1000)}s old)`);
                continue;
            }
            
            // Proses update
            await processBalanceUpdate(update.data);
            
            // Update timestamp
            lastUIUpdate = now;
            
            // Tunggu 100ms antara setiap update
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        console.error("❌ [Queue] Error processing updates:", error);
    } finally {
        isProcessingQueue = false;
        
        // Cek lagi jika ada update baru yang masuk saat proses
        if (pendingUpdates.length > 0) {
            setTimeout(processUpdateQueue, 1000);
        }
    }
}

async function processBalanceUpdate(detail) {
    try {
        const processedData = {
            raw: detail.balance.toString(),
            numeric: detail.balance,
            formatted: detail.formatted || formatCurrency(detail.balance)
        };
        
        // Update tampilan
        updateSaldoDisplay(processedData);
        
        // Update tema berdasarkan saldo
        updateThemeBasedOnSaldo(processedData.numeric);
        
        // Simpan nilai UI terakhir
        lastUISaldo = processedData.numeric;
        lastSaldo = processedData.numeric;
        
        // Update status koneksi
        updateConnectionStatus('online');
        lastSuccessfulFetch = new Date();
        
        // Update waktu
        updateTime();
        
        console.log("✅ [Script] UI diperbarui:", {
            saldo: processedData.numeric,
            change: lastUISaldo !== 0 ? 
                `${((processedData.numeric - lastUISaldo) / lastUISaldo * 100).toFixed(1)}%` : 'first',
            significant: detail.isSignificant
        });
        
    } catch (error) {
        console.error("❌ [Script] Error processing update:", error);
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

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
                console.log(`📊 [Script] Pakai balance.js cache: ${cachedSaldo}`);
                
                const processedData = {
                    raw: cachedSaldo.toString(),
                    numeric: cachedSaldo,
                    formatted: formatCurrency(cachedSaldo)
                };
                
                // ⭐ Hanya update UI jika nilai benar-benar berubah
                if (Math.abs(cachedSaldo - lastUISaldo) > (lastUISaldo * 0.01)) {
                    updateSaldoDisplay(processedData);
                    updateThemeBasedOnSaldo(processedData.numeric);
                    lastUISaldo = processedData.numeric;
                }
                
                lastSaldo = processedData.numeric;
                updateConnectionStatus('online');
                lastSuccessfulFetch = new Date();
                
                return;
            }
        }
        
        // STRATEGI 2: Minta balance.js refresh jika ada perubahan signifikan
        if (window.BalanceSystem && window.BalanceSystem.refresh) {
            const lastBalance = window.BalanceSystem.getCurrentSaldo();
            
            // Hanya refresh jika sudah lama atau belum ada data
            const shouldRefresh = !lastBalance || 
                (Date.now() - (lastSuccessfulFetch?.getTime() || 0)) > 30000;
            
            if (shouldRefresh) {
                console.log("🔄 [Script] Minta balance.js refresh...");
                window.BalanceSystem.refresh();
                
                // Tunggu 2 detik untuk balance.js merespons
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Cek lagi
                const newSaldo = window.BalanceSystem.getCurrentSaldo();
                if (newSaldo !== null && newSaldo !== undefined) {
                    const processedData = {
                        raw: newSaldo.toString(),
                        numeric: newSaldo,
                        formatted: formatCurrency(newSaldo)
                    };
                    
                    // Update jika ada perubahan
                    if (Math.abs(newSaldo - lastUISaldo) > (lastUISaldo * 0.01)) {
                        updateSaldoDisplay(processedData);
                        updateThemeBasedOnSaldo(processedData.numeric);
                        lastUISaldo = processedData.numeric;
                    }
                    
                    lastSaldo = processedData.numeric;
                    updateConnectionStatus('online');
                    lastSuccessfulFetch = new Date();
                    
                    return;
                }
            }
        }
        
        // STRATEGY 3: Fallback langsung ke Google Sheets (jarang digunakan)
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
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    try {
        const response = await fetch(`${SHEET_URL}&_=${Date.now()}`, {
            signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        console.log("📄 [Script] Data langsung:", text.substring(0, 100));
        
        const processedData = processSaldoData(text);
        
        if (processedData) {
            // Hanya update jika ada perubahan signifikan
            if (Math.abs(processedData.numeric - lastUISaldo) > (lastUISaldo * 0.05)) {
                updateSaldoDisplay(processedData);
                updateThemeBasedOnSaldo(processedData.numeric);
                lastUISaldo = processedData.numeric;
            }
            
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
        
        return {
            raw: rawData,
            numeric: numericValue,
            formatted: formatCurrency(numericValue)
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
    
    // ⭐ DEBOUNCING: Cek jika nilai sudah sama
    const currentText = saldoElement.textContent.replace(/[^\d]/g, '');
    const newText = data.numeric.toString();
    
    if (currentText === newText) {
        console.log(`⚖️ [UI] Nilai sama, skip update: ${data.numeric}`);
        return;
    }
    
    saldoElement.className = 'amount';
    saldoElement.textContent = data.formatted;
    
    // Animasi halus
    saldoElement.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    saldoElement.style.transform = 'translateY(-5px) scale(1.02)';
    saldoElement.style.opacity = '0.7';
    
    setTimeout(() => {
        saldoElement.style.transform = 'translateY(0) scale(1)';
        saldoElement.style.opacity = '1';
    }, 300);
    
    // Update waktu tampilan
    updateTime();
    
    console.log(`🎯 [UI] Saldo ditampilkan: ${data.formatted}`);
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
        console.log(`🎨 [Theme] Changing: ${currentTheme} → ${newTheme} (Saldo: ${saldo})`);
        
        // Tambahkan kelas changing-theme untuk efek transisi
        document.body.classList.add('changing-theme');
        
        // Setelah sedikit delay, ubah tema
        setTimeout(() => {
            currentTheme = newTheme;
            document.body.setAttribute('data-theme', currentTheme);
            
            // Setelah transisi selesai, hapus kelas changing-theme
            setTimeout(() => {
                document.body.classList.remove('changing-theme');
            }, 2500);
        }, 100);
    }
}

// Fungsi untuk memperbarui teks status
function updateStatusText(status) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) {
        const currentStatus = statusElement.textContent;
        if (currentStatus === status) return;
        
        statusElement.textContent = status;
        
        // Animasi perubahan status
        statusElement.style.transition = 'all 0.5s ease';
        statusElement.style.transform = 'scale(1.05)';
        statusElement.style.opacity = '0.8';
        
        setTimeout(() => {
            statusElement.style.transform = 'scale(1)';
            statusElement.style.opacity = '1';
        }, 300);
        
        console.log(`📊 [Status] Updated: ${status}`);
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
        saldoElement.className = 'amount loading';
    }
    
    // Update status ke "Memuat" saat loading
    if (statusElement) {
        statusElement.textContent = 'Memuat...';
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
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#10b981"></i> <span>Terhubung • Data Server</span>';
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
    
    console.log(`📡 [Connection] Status: ${status}`);
}

function showError(message) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    // Jangan tampilkan error jika nilai terakhir masih valid
    if (lastUISaldo > 0 && Date.now() - (lastSuccessfulFetch?.getTime() || 0) < 60000) {
        return;
    }
    
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
        // Cek jika perlu fetch ulang
        const timeSinceLastFetch = Date.now() - (lastSuccessfulFetch?.getTime() || 0);
        if (timeSinceLastFetch > 120000) { // 2 menit
            console.log("🔄 [Connection] Online after offline, fetching...");
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
        
        // Cek jika ada data cached
        const cachedSaldo = window.BalanceSystem.getCurrentSaldo();
        if (cachedSaldo) {
            console.log(`📊 [Script] Initial cached saldo: ${cachedSaldo}`);
            lastSaldo = cachedSaldo;
            lastUISaldo = cachedSaldo;
        }
    }
    
    // Initial fetch dengan delay
    setTimeout(() => {
        fetchSaldo();
    }, 1500);
    
    // Update waktu
    updateTime();
    setInterval(updateTime, 1000);
    
    // ⭐ OPTIMIZED AUTO-REFRESH: Hanya jika perlu
    setInterval(() => {
        if (isOnline && balanceSystemReady) {
            // Cek jika sudah lama tidak ada update
            const timeSinceUpdate = Date.now() - (lastSuccessfulFetch?.getTime() || 0);
            if (timeSinceUpdate > 180000) { // 3 menit
                console.log("🔄 [Auto-Refresh] Periodic check");
                fetchSaldo();
            }
        }
    }, 60000); // Cek setiap 1 menit
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
    console.log("Last UI Saldo:", lastUISaldo);
    console.log("Last UI Update:", new Date(lastUIUpdate).toLocaleTimeString());
    console.log("Balance System Ready:", balanceSystemReady);
    console.log("Pending Updates:", pendingUpdates.length);
    
    if (window.BalanceSystem && window.BalanceSystem.debug) {
        console.log("Balance System Debug:", window.BalanceSystem.debug());
    }
};

window.testTheme = function(saldo) {
    console.log("🎨 Testing theme dengan saldo:", saldo);
    updateThemeBasedOnSaldo(saldo);
    
    const saldoElement = document.getElementById('saldo');
    if (saldoElement) {
        const formatted = formatCurrency(saldo);
        saldoElement.textContent = formatted;
        saldoElement.className = 'amount';
        lastUISaldo = saldo;
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

window.clearUpdateQueue = function() {
    pendingUpdates = [];
    console.log("🧹 Update queue cleared");
};

window.simulateBalanceUpdate = function(saldo, isSignificant = false) {
    const testEvent = new CustomEvent('balanceUpdated', {
        detail: {
            balance: saldo,
            formatted: formatCurrency(saldo),
            isSignificant: isSignificant,
            timestamp: new Date().toISOString(),
            source: 'test'
        }
    });
    window.dispatchEvent(testEvent);
    console.log(`🧪 Simulated update: ${saldo} (significant: ${isSignificant})`);
};

// ⭐ NEW: Fungsi untuk mendapatkan status sistem
window.getSystemStatus = function() {
    return {
        saldo: {
            current: lastUISaldo,
            formatted: formatCurrency(lastUISaldo),
            lastUpdate: lastSuccessfulFetch
        },
        connection: {
            online: isOnline,
            status: document.getElementById('connection-status')?.textContent || 'unknown'
        },
        balanceSystem: {
            ready: balanceSystemReady,
            hasSystem: !!window.BalanceSystem
        },
        queue: {
            pending: pendingUpdates.length,
            processing: isProcessingQueue
        },
        performance: {
            lastUIUpdate: lastUIUpdate,
            timeSinceLastUpdate: Date.now() - lastUIUpdate
        }
    };
};