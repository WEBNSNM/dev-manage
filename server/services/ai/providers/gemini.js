const generateGemini = async ({ config, systemPrompt, userContent, fetchImpl }) => {
  const base = String(config.baseURL || '').replace(/\/+$/, '');
  const response = await fetchImpl(`${base}/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [ ...(systemPrompt ? [{ text: systemPrompt }] : []), { text: userContent } ] }] })
  });
  return { response, content: (data) => data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') };
};

module.exports = { generateGemini };
