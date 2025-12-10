<?php
// ==================== KONFIGURASI ====================
$GOOGLE_SHEETS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
$DATA_FILE = "balance.json";
$LOG_FILE = "update-log.txt";

// ==================== FUNGSI AMBIL DATA ====================
function fetchFromGoogleSheets() {
    global $GOOGLE_SHEETS_URL;
    
    $timestamp = time();
    $url = $GOOGLE_SHEETS_URL . "&_=" . $timestamp;
    
    // Menggunakan cURL untuk fetch data
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Kas-RT02-Updater/1.0');
    
    $data = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code !== 200 || !$data) {
        throw new Exception("Gagal mengambil data dari Google Sheets. HTTP Code: $http_code");
    }
    
    return trim($data);
}

// ==================== FUNGSI PROSES DATA ====================
function processSaldoData($rawData) {
    // Validasi data kosong
    if (empty($rawData)) {
        throw new Exception("Data kosong dari Google Sheets");
    }
    
    $cleaned = $rawData;
    
    // Bersihkan format Rupiah
    $cleaned = preg_replace('/Rp\s*/i', '', $cleaned);
    $cleaned = str_replace('.', '', $cleaned);
    
    // Handle koma
    if (strpos($cleaned, ',') !== false) {
        // Jika format ribuan: 1,234,567
        if (preg_match('/^\d{1,3}(,\d{3})*(\.\d+)?$/', $cleaned)) {
            $cleaned = str_replace(',', '', $cleaned);
        } else {
            // Jika koma sebagai pemisah desimal
            $cleaned = str_replace(',', '.', $cleaned);
        }
    }
    
    // Validasi numeric
    if (!preg_match('/^-?\d*\.?\d*$/', $cleaned)) {
        throw new Exception("Format data tidak valid: " . substr($cleaned, 0, 50));
    }
    
    $numericValue = floatval($cleaned);
    
    if ($numericValue === 0.0 && $cleaned !== '0' && $cleaned !== '0.0') {
        throw new Exception("Tidak bisa konversi ke angka: " . substr($cleaned, 0, 50));
    }
    
    // Format ke Rupiah Indonesia
    $formatted = number_format($numericValue, 0, ',', '.');
    
    return [
        'raw' => $rawData,
        'numeric' => $numericValue,
        'formatted' => $formatted
    ];
}

// ==================== FUNGSI SIMPAN DATA ====================
function saveBalanceData($data) {
    global $DATA_FILE, $LOG_FILE;
    
    $result = [
        'success' => true,
        'data' => $data,
        'timestamp' => date('Y-m-d H:i:s'),
        'timestamp_unix' => time(),
        'server' => 'Kas RT02-RW18'
    ];
    
    // Simpan ke balance.json
    $json_data = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
    if (file_put_contents($DATA_FILE, $json_data) === false) {
        throw new Exception("Gagal menyimpan data ke $DATA_FILE");
    }
    
    // Log aktivitas
    $log_entry = date('Y-m-d H:i:s') . " | Saldo: Rp " . $data['formatted'] . " | Numeric: " . $data['numeric'] . "\n";
    file_put_contents($LOG_FILE, $log_entry, FILE_APPEND);
    
    return $result;
}

// ==================== FUNGSI UTAMA ====================
function main() {
    global $DATA_FILE;
    
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    
    try {
        // 1. Ambil data dari Google Sheets
        $raw_data = fetchFromGoogleSheets();
        
        // 2. Proses data
        $processed_data = processSaldoData($raw_data);
        
        // 3. Simpan ke file
        $result = saveBalanceData($processed_data);
        
        // 4. Response success
        echo json_encode([
            'status' => 'success',
            'message' => 'Data berhasil diupdate',
            'data' => $result['data'],
            'timestamp' => $result['timestamp']
        ], JSON_PRETTY_PRINT);
        
    } catch (Exception $e) {
        // Error handling
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => $e->getMessage(),
            'timestamp' => date('Y-m-d H:i:s')
        ], JSON_PRETTY_PRINT);
    }
}

// ==================== JALANKAN PROGRAM ====================
main();
?>
