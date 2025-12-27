const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const axios = require('axios'); // Tambahkan axios (npm install axios)
const path = require('path');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const daftarKoin = [
    "BTC_USDT", "ETH_USDT", "SOL_USDT", "BNB_USDT", "NEAR_USDT", 
    "RENDER_USDT", "ARB_USDT", "LINK_USDT", "FET_USDT", "SUI_USDT"
];

// --- FUNGSI AMBIL DATA AWAL (HTTP) ---
async function fetchInitialPrices() {
    try {
        console.log('📡 Fetching initial prices...');
        const response = await axios.get('https://api.gateio.ws/api/v4/spot/tickers');
        const allTickers = response.data;

        // Filter hanya koin yang ada di daftar kita
        allTickers.forEach(tick => {
            if (daftarKoin.includes(tick.currency_pair)) {
                const formattedData = {
                    symbol: tick.currency_pair.replace('_', ''),
                    price: parseFloat(tick.last).toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    high: parseFloat(tick.high_24h).toLocaleString('en-US'),
                    low: parseFloat(tick.low_24h).toLocaleString('en-US'),
                    changePercent: parseFloat(tick.change_percentage).toFixed(2) + "%",
                    timestamp: "Initial Load"
                };
                io.emit('allPrices', formattedData);
            }
        });
        console.log('✅ Initial prices loaded.');
    } catch (error) {
        console.error('⚠️ Initial fetch error:', error.message);
    }
}

// --- FUNGSI WEBSOCKET (LIVE UPDATE) ---
function connectGateIO() {
    const ws = new WebSocket('wss://api.gateio.ws/ws/v4/');

    ws.on('open', () => {
        console.log('✅ Connected to Gate.io WebSocket');
        
        // Subscribe
        ws.send(JSON.stringify({
            time: Math.floor(Date.now() / 1000),
            channel: "spot.tickers",
            event: "subscribe",
            payload: daftarKoin
        }));

        // Ambil data lewat HTTP tepat setelah WS terhubung
        fetchInitialPrices();

        // Heartbeat
        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ time: Math.floor(Date.now() / 1000), channel: "spot.ping" }));
            }
        }, 20000);
    });

    ws.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            if (response.event === 'update' && response.channel === 'spot.tickers') {
                const tick = response.result;
                const formattedData = {
                    symbol: tick.currency_pair.replace('_', ''), 
                    price: parseFloat(tick.last).toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    high: parseFloat(tick.high_24h).toLocaleString('en-US'),
                    low: parseFloat(tick.low_24h).toLocaleString('en-US'),
                    changePercent: parseFloat(tick.change_percentage).toFixed(2) + "%",
                    timestamp: new Date().toLocaleTimeString()
                };
                io.emit('allPrices', formattedData);
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        console.log('❌ Connection lost. Reconnecting...');
        setTimeout(connectGateIO, 5000);
    });
}

connectGateIO();


// Ganti 4000 menjadi 5000
server.listen(4000, () => console.log('🚀 API Running: http://localhost:4000'));