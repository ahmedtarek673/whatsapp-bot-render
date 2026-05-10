# MinDrive WhatsApp Bot

An AI-powered WhatsApp bot for MinDrive, integrated with Notion for chat logging and appointment management.

## Features
- **AI-Powered**: Uses Groq and Llama 3.3 for intelligent conversations.
- **Notion Integration**: Logs all chats and interactions to Notion databases.
- **Baileys WA**: Built on the robust Baileys library for WhatsApp Multi-Device support.
- **No Browser Needed**: Runs purely in Node.js.

## Setup
1. Clone the repository.
2. Install dependencies: `npm install`
3. Create a `.env` file with:
   ```env
   GROQ_API_KEY=your_key
   NOTION_TOKEN=your_token
   NOTION_CHATLOGS_DB=your_db_id
   ```
4. Start the bot: `npm start`
5. Scan the QR code with your WhatsApp.

## Built by MinDrive
MinDrive is a full-service technology company building intelligent digital solutions.
