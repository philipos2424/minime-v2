
const express = require('express');
const app = express();
const config = require('./config/environment');

app.use(express.json());

app.get('/health', (req, res) => res.send('OK'));

app.post('/webhook/telegram', (req, res) => {
    console.log('Telegram Webhook Received');
    res.sendStatus(200);
});

app.listen(config.port, () => {
    console.log(`MiniMe V2 Backend running on port ${config.port}`);
});
