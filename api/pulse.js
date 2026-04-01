exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { prompt, type } = JSON.parse(event.body);

    // Token limit by type
    const maxTokens = {
      'linkedin': 3000,
      'whitepaper-outline': 1500,
      'whitepaper-full': 6000,
      'newsletter': 4000,
      'press': 2000
    }[type] || 2000;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens,
        system: `Du bist der PR & Communication Assistant von Signium Austria. 
Du erstellst hochwertige, professionelle Kommunikationsinhalte für einen Managing Partner einer Executive Search Firma (Signium Austria, DACH/CEE Markt).
Alle Inhalte müssen substanziell, direkt und glaubwürdig sein. Keine generischen Floskeln.
Signium Austria ist Teil von Signium International (40+ Länder weltweit).`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
