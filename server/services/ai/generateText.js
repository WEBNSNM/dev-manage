const { generateOpenAICompatible } = require('./providers/openaiCompatible');
const { generateGemini } = require('./providers/gemini');
const { generateOpenAIResponses } = require('./providers/openai');

const sanitizeError = (message, apiKey) => String(message || 'AI provider request failed').replaceAll(String(apiKey || ''), '[redacted]');

const generateText = async ({ config, systemPrompt = '', userContent = '', fetchImpl = global.fetch }) => {
  if (!config?.baseURL || !config?.apiKey || !config?.model) {
    throw Object.assign(new Error('AI provider configuration is incomplete'), { code: 'AI_CONFIG_INVALID' });
  }
  let result;
  if (config.provider === 'gemini') result = await generateGemini({ config, systemPrompt, userContent, fetchImpl });
  else if (config.provider === 'openai-responses') result = await generateOpenAIResponses({ config, systemPrompt, userContent, fetchImpl });
  else result = await generateOpenAICompatible({ config, systemPrompt, userContent, fetchImpl });

  const rawText = await result.response.text();
  let data;
  try { data = JSON.parse(rawText); } catch {
    throw Object.assign(new Error('AI provider returned non-JSON data'), { code: 'AI_PROVIDER_RESPONSE_INVALID' });
  }
  if (!result.response.ok || data.error) {
    throw Object.assign(new Error(sanitizeError(data.error?.message || `AI provider HTTP ${result.response.status}`, config.apiKey)), { code: 'AI_PROVIDER_ERROR' });
  }
  const content = result.content(data);
  if (!content) throw Object.assign(new Error('AI provider response did not contain text'), { code: 'AI_PROVIDER_RESPONSE_INVALID' });
  return String(content).trim();
};

module.exports = { generateText };
