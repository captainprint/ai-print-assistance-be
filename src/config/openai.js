const OpenAI = require('openai');

let _client;

function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const openai = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop];
  },
});

module.exports = openai;
