require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const pool = require('./config/db');

// Express - framework to build web servers easily
const app = express();
app.use(cors());

// Create actual web server - express runs on top of http
const server = http.createServer(app);

// Socket.io is the library that makes websockets easy to use
// Initialize it and connect to React
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

/**
 * Fetch the last traded close price from Upstox historical candle API.
 * Uses a 1-day candle for the most recent trading day.
 */
async function fetchLastPrice(instrumentKey) {
    const today = new Date();
    const toDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // from_date = 7 days back to account for weekends / holidays
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 7);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    const encodedKey = encodeURIComponent(instrumentKey);
    const url = `https://api.upstox.com/v3/historical-candle/${encodedKey}/days/1/${toDate}/${fromDateStr}`;

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    // Attach bearer token if available
    if (process.env.UPSTOX_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`;
    }

    const response = await axios.get(url, { headers });
    const candles = response.data?.data?.candles;

    if (!candles || candles.length === 0) {
        throw new Error(`No candle data returned for ${instrumentKey}`);
    }

    // candles are sorted most-recent first; pick the latest close price (index 4)
    const latestCandle = candles[0];
    return latestCandle[4]; // close price
}

// Incoming websocket connections - this runs everytime frontend is accessed
io.on('connection', (socket) => {
    console.log(`New frontend client connected: ${socket.id}`);

    let dummyDataInterval;

    // Which company to track
    socket.on('subscribe', async (companySymbol) => {
        console.log(`Starting live feed for: ${companySymbol}`);

        // Clear old data stream if user changes companies
        if (dummyDataInterval) clearInterval(dummyDataInterval);

        try {
            // 1. Query the companies table for instrument_key & tick_size
            const dbResult = await pool.query(
                'SELECT instrument_key, tick_size FROM companies WHERE symbol = $1 LIMIT 1',
                [companySymbol]
            );

            if (dbResult.rows.length === 0) {
                socket.emit('error_message', `Company not found for symbol: ${companySymbol}`);
                return;
            }

            const { instrument_key, tick_size } = dbResult.rows[0];
            console.log(`Found instrument_key: ${instrument_key}, tick_size: ${tick_size}`);

            // 2. Fetch the last real stock price from Upstox
            let currentPrice;
            try {
                currentPrice = await fetchLastPrice(instrument_key);
                console.log(`Fetched last close price for ${companySymbol}: ${currentPrice}`);
            } catch (apiErr) {
                console.error(`Upstox API error: ${apiErr.message}`);
                socket.emit('error_message', `Could not fetch price from Upstox for ${companySymbol}`);
                return;
            }

            // 3. Generate dummy ticks using real base price & tick_size
            dummyDataInterval = setInterval(() => {
                // Fluctuate price by a random number of ticks (up to ±5 ticks)
                const ticks = Math.floor(Math.random() * 11) - 5; // -5 to +5
                const priceChange = ticks * tick_size;
                currentPrice = parseFloat((currentPrice + priceChange).toFixed(2));

                const liveTick = {
                    time: new Date().toISOString(),
                    symbol: companySymbol,
                    open: currentPrice,
                    high: parseFloat((currentPrice + 2 * tick_size).toFixed(2)),
                    low: parseFloat((currentPrice - 2 * tick_size).toFixed(2)),
                    close: currentPrice
                };

                // Emit the tick to the frontend
                socket.emit('live_data', liveTick);
            }, 1000);

        } catch (err) {
            console.error(`Error during subscribe: ${err.message}`);
            socket.emit('error_message', 'Internal server error while setting up live feed.');
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        if (dummyDataInterval) clearInterval(dummyDataInterval);
    });
});

const PORT = 4000;
server.listen(PORT, () => {
    console.log(`Real-Time WebSocket Server running on http://localhost:${PORT}`);
});
