const generateOpenAIResponses = async ({ config, systemPrompt, userContent, fetchImpl }) => {
  const base = String(config.baseURL || '').replace(/\/+$/, '');
  const response = await fetchImpl(`${base}/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, instructions: systemPrompt || undefined, input: userContent })
  });
  return { response, content: (data) => data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('') };
};

module.exports = { generateOpenAIResponses };
