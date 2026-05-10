import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY';
const AI_MODEL = 'llama-3.3-70b-versatile';

const groq = new Groq({ apiKey: GROQ_API_KEY });

async function test() {
    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'hello' }],
            model: AI_MODEL,
        });
        console.log('Success:', completion.choices[0].message.content);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
