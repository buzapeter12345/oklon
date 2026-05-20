const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// A Render a PORT környezeti változón keresztül mondja meg, hova kell hallgatózni
const port = process.env.PORT || 5001;

// 1. HTTP szerver létrehozása az index.html kiszolgálásához
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                return res.end('Hiba az index.html betoltesekor');
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Nem talalhato');
    }
});

// 2. A WebSocket szervert ráakasztjuk ugyanarra a HTTP szerverre, amin az oldal betölt
const wss = new WebSocketServer({ server });

let waitingUser = null;
const activeMatches = new Map(); // ws -> partner_ws

console.log(`🚀 Integrált Omegle szerver indul a ${port}-es porton...`);

wss.on('connection', (ws) => {
    console.log("📱 Új felhasználó csatlakozott.");

    // Megpróbáljuk párba állítani a csatlakozót
    matchUser(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const partner = activeMatches.get(ws);

            if (!partner) return;

            // Továbbítjuk a WebRTC jelzéseket vagy chat üzeneteket a partnernek
            if (['offer', 'answer', 'candidate'].includes(data.type)) {
                partner.send(JSON.stringify(data));
            } else if (data.type === 'chat') {
                partner.send(JSON.stringify({ type: 'chat', text: data.text }));
            }
        } catch (err) {
            console.error("Hiba az üzenetfeldolgozás során:", err);
        }
    });

    ws.on('close', () => {
        console.log("❌ Felhasználó lecsatlakozott.");
        if (waitingUser === ws) waitingUser = null;

        const partner = activeMatches.get(ws);
        if (partner) {
            partner.send(JSON.stringify({ type: 'status', text: "A partner kilépett. Kattints a Next gombra!" }));
            activeMatches.delete(partner);
            activeMatches.delete(ws);
        }
    });
});

function matchUser(ws) {
    if (waitingUser && waitingUser !== ws && waitingUser.readyState === 1) {
        const partner = waitingUser;
        waitingUser = null;

        activeMatches.set(ws, partner);
        activeMatches.set(partner, ws);

        // Elsőként csatlakozó indítja a hívást (initRTC: true)
        partner.send(JSON.stringify({ type: 'status', text: "Sikeres párosítás! Kamera indítása...", initRTC: true }));
        ws.send(JSON.stringify({ type: 'status', text: "Sikeres párosítás! Várakozás a partner kamerájára..." }));
        
        console.log("🤝 Videós párba állítás sikeres!");
    } else {
        waitingUser = ws;
        ws.send(JSON.stringify({ type: 'status', text: "Idegen keresése..." }));
    }
}

server.listen(port, () => {
    console.log(`📡 Szerver aktív a ${port}-es porton.`);
});