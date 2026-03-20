import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateSummary(text: string): Promise<string> {
  const prompt = `Summarize the following AI-related post in two sentences.

Sentence 1: What happened
Sentence 2: Why it matters

Requirements:
- Chinese output
- Less than 80 characters
- Concise

Text:
${text}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = message.content[0];
  if (content.type === 'text') {
    return content.text;
  }

  throw new Error('Unexpected response format from Claude API');
}
