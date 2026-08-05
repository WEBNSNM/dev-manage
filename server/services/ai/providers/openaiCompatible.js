const endpoint = (baseURL, path) => `${String(baseURL || '').replace(/\/+$/, '')}${String(baseURL || '').endsWith('/v1') ? path.replace(/^\/v1/, '') : path}`;

const generateOpenAICompatible = async ({ config, systemPrompt, userContent, fetchImpl }) => {
  const response = await fetchImpl(endpoint(config.baseURL, '/v1/chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: userContent }
      ],
      stream: false
    })
  });
  return { response, content: (data) => data.choices?.[0]?.message?.content };
};

module.exports = { generateOpenAICompatible };
