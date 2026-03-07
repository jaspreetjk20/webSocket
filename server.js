const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');

//Express - framework to build web servers easily
const app = express();
app.use(cors());

//Create actual web server - express runs on top of http
const server = http.createServer(app);

//Socket.io is the library that makes websockets easy to use
//Initialize it and connect to React
const io = new Server(server, {
    cors:{
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

//Incoming websocket connections - this runs everytime frontend is accessed
io.on('connection', (socket) => {
    console.log(`New frontend client connected: ${socket.id}`);

    let dummyDataInterval;

    //Which company to track
    socket.on('subscribe', (companySymbol) => {
        console.log(`Starting live feed for: ${companySymbol}`);
    
    //Clear old data stream if user changes companies
    if (dummyDataInterval) clearInterval(dummyDataInterval);
    
    //Hardcoded base price
    let currentPrice = 2500;

    //Generates a new live tick every 1 second
    dummyDataInterval = setInterval(() => {
            // Fluctuate the price randomly by 5 up or down
            const priceChange = (Math.random() * 10) - 5; 
            currentPrice = currentPrice + priceChange;

            const liveTick = {
                time: new Date().toISOString(), 
                symbol: companySymbol,
                open: currentPrice, 
                high: currentPrice + 2, 
                low: currentPrice - 2,
                close: currentPrice 
            };

            // Emit the tick to the frontend
            socket.emit('live_data', liveTick);
}, 1000);
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
