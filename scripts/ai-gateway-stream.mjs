import { createGateway, streamText } from 'ai';

async function main() {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    throw new Error('Set AI_GATEWAY_API_KEY or refresh VERCEL_OIDC_TOKEN with `vercel env pull`.');
  }

  const aiGateway = createGateway({ apiKey });
  const result = streamText({
    model: aiGateway('openai/gpt-5.6-sol'),
    prompt: 'In one sentence, confirm that AI Gateway streaming is working.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
}

main().catch((error) => {
  console.error('AI Gateway stream failed:', error);
  process.exitCode = 1;
});
