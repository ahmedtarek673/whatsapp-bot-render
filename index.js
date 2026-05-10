import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import Groq from 'groq-sdk';
import fs from 'fs';
import pino from 'pino';

// ── ENV ──
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AI_MODEL = 'llama-3.3-70b-versatile';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const CHATLOGS_DB = process.env.NOTION_CHATLOGS_DB;
const APPOINTMENTS_DB = process.env.NOTION_APPOINTMENTS_DB;

// ── Groq setup ──
const groq = new Groq({ apiKey: GROQ_API_KEY });

const SYSTEM_PROMPT = `You are MinDrive's expert AI assistant. MinDrive is a full-service technology company that builds intelligent digital solutions.

Our Services:
1. Mobile Applications: iOS & Android (Native & Flutter/React Native).
2. Website Development: Custom web apps, E-commerce, CMS, and PWAs.
3. Web Services & APIs: Scalable backends, REST/GraphQL, Cloud (AWS/GCP), and DevOps.
4. AI Agents: Custom AI chatbots, NLP, Computer Vision, and Predictive Analytics.
5. Automations: Workflow automation, CRM/ERP integration, and data pipelines.
6. UI/UX Design: User research, prototyping, and brand identity.

Your Goal:
- Be professional, innovative, and helpful.
- When a client is interested, guide them to book a discovery call or "Get In Touch".
- Collect their Name, Company (if applicable), and specific project area of interest.
- Reply in the same language the client uses.`;

// per-user chat history (in-memory)
const chatSessions = {};

function getChat(userId) {
    if (!chatSessions[userId]) {
        chatSessions[userId] = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'assistant', content: 'Understood! I am MinDrive\'s expert AI assistant. How can I help you build your next digital solution?' }
        ];
    }
    return chatSessions[userId];
}

// ── Notion helpers ──
async function notionFetch(endpoint, method = 'POST', body = null) {
    if (!NOTION_TOKEN) return null;
    try {
        const opts = {
            method,
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`https://api.notion.com/v1${endpoint}`, opts);
        return await res.json();
    } catch (e) {
        console.error('Notion API error:', e.message);
        return null;
    }
}

async function logToNotion(name, phone, message, direction) {
    if (!CHATLOGS_DB) return;
    try {
        await notionFetch('/pages', 'POST', {
            parent: { database_id: CHATLOGS_DB },
            properties: {
                Name: { title: [{ text: { content: name || phone || 'Unknown' } }] },
                "Phone Number": { rich_text: [{ text: { content: phone || 'Unknown' } }] },
                Message: { rich_text: [{ text: { content: message.substring(0, 2000) } }] },
                Direction: { select: { name: direction } },
                Timestamp: { rich_text: [{ text: { content: new Date().toISOString() } }] },
            },
        });
    } catch (e) {
        console.error('Log to Notion failed:', e.message);
    }
}

// ── Main bot (Baileys — NO BROWSER) ──
async function startBot() {
    console.log('🚀 Starting Baileys bot (no browser needed!)...');

    const { state, saveCreds } = await useMultiFileAuthState('./tokens/baileys_auth');
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Using WA version: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['MinDrive Bot', 'Chrome', '120.0.0'],
    });

    // Save credentials whenever they update
    sock.ev.on('creds.update', saveCreds);

    // Connection events
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📱 Scan QR code below:');
            qrcode.generate(qr, { small: true });
            fs.writeFileSync('./qr.txt', qr);
            QRCode.toFile('./current_qr.png', qr, { scale: 10 }, (err) => {
                if (err) console.error('Failed to save QR png:', err);
                else console.log('QR saved to ./current_qr.png');
            });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Connection closed (code: ${statusCode}). Reconnect: ${shouldReconnect}`);
            if (shouldReconnect) {
                startBot(); // Reconnect
            }
        } else if (connection === 'open') {
            console.log('✅ Connected and authenticated!');
            try { fs.unlinkSync('./qr.txt'); } catch (_) { }
        }
    });

    // Message handler
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg?.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const pushName = msg.pushName || '';
        // Use remoteJidAlt (contains real phone number) if available, otherwise fall back to remoteJid
        const altJid = msg.key.remoteJidAlt || sender;
        const phoneNumber = altJid.split('@')[0];
        if (sender === 'status@broadcast') return;

        // Extract text from different message types
        const body = msg.message.conversation
            || msg.message.extendedTextMessage?.text
            || '';

        if (!body) return;

        console.log(`📩 [${pushName || phoneNumber}] ${body}`);

        // Log incoming to Notion
        logToNotion(pushName, phoneNumber, body, 'incoming');

        try {
            let reply;
            try {
                // Try main model
                const history = getChat(sender);
                history.push({ role: 'user', content: body });

                const completion = await groq.chat.completions.create({
                    messages: history,
                    model: AI_MODEL,
                });
                
                reply = completion.choices[0].message.content;
                history.push({ role: 'assistant', content: reply });
            } catch (err) {
                console.warn(`⚠️ Model error: ${err.message}`);
                throw err;
            }

            await sock.sendMessage(sender, { text: reply });
            console.log(`📤 [${sender}] ${reply.substring(0, 80)}...`);

            // Log outgoing to Notion
            logToNotion(pushName, phoneNumber, reply, 'outgoing');
        } catch (err) {
            console.error('❌ AI model failed:', err.message);
            await sock.sendMessage(sender, { text: 'Sorry, I hit a temporary glitch. Please try again in 30 seconds!' });
        }
    });
}

startBot();
