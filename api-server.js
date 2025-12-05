import express from 'express';
import cors from 'cors';

const app = express();
// Usa a porta do ambiente (Render) ou 3001 local
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
// Middleware simples de log de performance
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `⏱ ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`
    );
  });

  next();
});

// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // apenas via env
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.MODEL || 'openai/gpt-4o-mini';

if (!OPENROUTER_API_KEY) {
  console.warn('⚠️ OPENROUTER_API_KEY não está definida. As chamadas à IA irão falhar.');
}

// Simple in-memory license store
const licenses = new Map();

// Initialize with demo licenses
licenses.set('MINDAI-BETA-2024-DEMO1', {
  key: 'MINDAI-BETA-2024-DEMO1',
  status: 'active',
  plan: 'beta',
  created_at: new Date().toISOString(),
  last_used: null
});

licenses.set('MINDAI-BETA-2024-DEMO2', {
  key: 'MINDAI-BETA-2024-DEMO2',
  status: 'active',
  plan: 'beta',
  created_at: new Date().toISOString(),
  last_used: null
});

// Helper function to call OpenRouter API (versão com logs detalhados)
async function callOpenRouter(systemPrompt, userPrompt) {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mindaihub.com',
        'X-Title': 'MindAI Hub'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 2000
      })
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('❌ OpenRouter retornou resposta não-JSON:', text);
      throw new Error('OpenRouter returned non-JSON response');
    }

    // Se a API respondeu com erro HTTP (401, 403, 429 etc)
    if (!response.ok) {
      console.error('❌ OpenRouter HTTP error:', response.status, data);
      throw new Error(
        `OpenRouter HTTP ${response.status}: ${
          data.error?.message || JSON.stringify(data)
        }`
      );
    }

    const message = data?.choices?.[0]?.message?.content;

    if (!message) {
      console.error('❌ Estrutura inesperada na resposta do OpenRouter:', data);
      throw new Error('Invalid API response structure');
    }

    return message;

  } catch (error) {
    console.error('OpenRouter API error:', error);
    throw error;
  }
}

// License validation endpoint
app.post('/api/mindai/license/validate', (req, res) => {
  try {
    const { license_key } = req.body;

    if (!license_key) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Chave de licença não fornecida' 
      });
    }

    if (!license_key.startsWith('MINDAI-')) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Formato de chave inválido' 
      });
    }

    const license = licenses.get(license_key);

    if (!license) {
      return res.status(404).json({ 
        valid: false, 
        error: 'Chave não encontrada' 
      });
    }

    if (license.status !== 'active') {
      return res.status(403).json({ 
        valid: false, 
        error: 'Chave desativada ou expirada' 
      });
    }

    // Update last used
    license.last_used = new Date().toISOString();
    licenses.set(license_key, license);

    return res.status(200).json({
      valid: true,
      plan: license.plan,
      message: 'Licença válida'
    });

  } catch (error) {
    console.error('License validation error:', error);
    return res.status(500).json({ 
      valid: false, 
      error: 'Erro ao validar licença' 
    });
  }
});

// Admin endpoints
app.get('/api/mindai/license/admin', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'mindai-admin-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const licenseList = Array.from(licenses.values());
  return res.status(200).json({
    total: licenseList.length,
    licenses: licenseList
  });
});

app.put('/api/mindai/license/admin', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'mindai-admin-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { key, status } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'License key required' });
  }

  const license = licenses.get(key);

  if (!license) {
    return res.status(404).json({ error: 'License not found' });
  }

  if (status && ['active', 'inactive', 'expired'].includes(status)) {
    license.status = status;
    licenses.set(key, license);
  }

  return res.status(200).json({
    message: 'License updated successfully',
    license
  });
});

// 1. Central de Ideias - Gera 5 ideias personalizadas
app.post('/api/generate-content-ideas', async (req, res) => {
  try {
    const { userProfile } = req.body;

    if (!userProfile) {
      return res.status(400).json({ error: 'Perfil do usuário não fornecido' });
    }

    const systemPrompt = `Você já recebe automaticamente os seguintes dados do usuário:

Nicho: ${userProfile.nicho}
Promessa: ${userProfile.promessa}
Transformação oferecida: ${userProfile.transformacao}
Tom de voz da marca: ${userProfile.tom_de_voz}
Persona ideal: ${userProfile.persona}

Use essas informações para gerar ideias altamente personalizadas, atuais e diferenciadas.

🧠 Função da Aba Central de Ideias

Gerar ideias de conteúdo modernas, relevantes e criativas, totalmente alinhadas ao perfil captado no diagnóstico.
Nada genérico. Nada ultrapassado. Nada saturado.

Cada ideia deve refletir:
- O nicho específico
- A promessa e transformação que o criador entrega
- O tom de voz da marca (leve, técnico, emocional, direto, etc.)
- A persona ideal e suas dores reais
- Tendências contemporâneas de consumo de conteúdo
- Formatos virais atuais

O objetivo é fornecer ideias realmente utilizáveis, únicas e atualizadas.

📌 O que gerar SEMPRE:
5 ideias de conteúdo altamente atuais

Cada ideia deve conter:
- Um título curto e chamativo
- Uma explicação mostrando:
  • o ângulo criativo
  • a conexão com a transformação
  • por que é relevante para a persona ideal
  • como o tom de voz deve ser aplicado

🚫 Diretrizes obrigatórias:
- NÃO gerar ideias ultrapassadas
- NÃO usar estruturas saturadas ("3 dicas", "5 erros", conteúdos genéricos)
- NÃO repetir padrões antigos de marketing digital
- Priorizar novidade, criatividade e clareza estratégica
- Sempre conectar cada ideia ao nicho, persona, promessa e transformação enviados
- Respeitar e aplicar o tom de voz informado`;

    const userPrompt = `Gere 5 ideias de conteúdo inovadoras e personalizadas para meu negócio.`;

    const ideas = await callOpenRouter(systemPrompt, userPrompt);

    res.json({ ideas });

  } catch (err) {
    console.error('Error generating ideas:', err);
    res.status(500).json({ error: 'Erro ao gerar ideias' });
  }
});

// 2. Conteúdos Neurais com Ganchos de Impacto
app.post('/api/generate-neural-content', async (req, res) => {
  try {
    const { userProfile, tema, formato } = req.body;

    if (!userProfile || !tema || !formato) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const systemPrompt = `A partir de agora, você é um Criador Neural de Conteúdos Premium, especialista em:

- comportamento humano, PNL avançada, hipnose conversacional, neurociência aplicada, atenção e retenção
- storytelling emocional, scripts virais, copywriting de autoridade, persuasão elegante, posicionamento premium

Seu objetivo é criar conteúdos completos e neuroestratégicos, que comecem com um GANCHO de altíssimo impacto emocional, capazes de:
- parar o scroll instantaneamente
- gerar identificação e conexão profunda
- ativar curiosidade extrema
- educar sem pesar
- entreter com inteligência
- elevar a autoridade do criador
- provocar reflexões fortes
- estimular salvamento, compartilhamento e comentários
- gerar desejo REAL de seguir e consumir mais

DADOS DO USUÁRIO:
Nicho: ${userProfile.nicho}
Promessa: ${userProfile.promessa}
Transformação: ${userProfile.transformacao}
Tom de voz: ${userProfile.tom_de_voz}
Persona: ${userProfile.persona}

REQUISITOS OBRIGATÓRIOS DO CONTEÚDO (GANCHO + CORPO):

1. GANCHO NEUROESTRATÉGICO (obrigatório para todos os formatos)
O gancho deve conter:
- ativação emocional imediata (amígdala)
- ameaça ou perda implícita / erro invisível
- dissonância cognitiva
- provocação direta ao ego/identidade
- promessa implícita de transformação
- curiosidade dopaminérgica
- frase curta, brutal, impossível de ignorar

2. IDENTIFICAÇÃO PROFUNDA (espelho emocional)
Descreva pensamentos, sensações e dilemas internos da persona, de forma sensorial e íntima.

3. TENSÃO NARRATIVA (a dor real / o conflito emocional)
Revele:
- a verdade que machuca
- o ciclo de autossabotagem
- o equívoco comportamental
- o padrão psicológico oculto
- a contradição interna

4. VIRADA NEUROESTRATÉGICA (o insight transformador)
Apresente:
- o código psicológico
- a perspectiva inesperada
- a solução invisível
- a chave mental
- o conceito premium que eleva o entendimento

5. AUTORIDADE EMOCIONAL PREMIUM
Demonstre conhecimento de forma sutil, elegante, sem arrogância.

6. RECOMPENSA EMOCIONAL
Feche com: clareza, alívio, força, encorajamento, despertar, senso de possibilidade.

7. CTA ELEGANTE
Sem parecer venda. Use CTA emocional e sofisticado.

INSTRUÇÃO FINAL (obrigatória):
O conteúdo precisa soar: humano, atual, profundo, emocional, premium, diferenciado, maduro, consciente, impossível de ignorar, levemente polarizado.

Jamais entregue algo raso ou genérico.`;

    const userPrompt = `TEMA DO CONTEÚDO: ${tema}
FORMATO DESEJADO: ${formato}

Gere o conteúdo completo com gancho + corpo seguindo todas as diretrizes.`;

    const content = await callOpenRouter(systemPrompt, userPrompt);

    res.json({ content });

  } catch (err) {
    console.error('Error generating neural content:', err);
    res.status(500).json({ error: 'Erro ao gerar conteúdo' });
  }
});

// 3. Neuro Respostas - 3 versões de resposta inteligente
app.post('/api/generate-neuro-responses', async (req, res) => {
  try {
    const { userProfile, mensagem, tipo } = req.body;

    if (!userProfile || !mensagem || !tipo) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const systemPrompt = `A partir de agora, você é um Especialista em Neurocomunicação e Respostas Estratégicas, treinado em:

PNL, Hipnose conversacional, Neurociência aplicada à persuasão, Comunicação não reativa, Liderança emocional, 
Psicologia de objeções, Respostas públicas de autoridade, Reestruturação de crenças, Inteligência social, Gestão de conflitos, Copywriting comportamental suave.

DADOS DO USUÁRIO:
Nicho: ${userProfile.nicho}
Promessa: ${userProfile.promessa}
Transformação: ${userProfile.transformacao}
Tom de voz: ${userProfile.tom_de_voz}
Persona: ${userProfile.persona}

Seu objetivo é criar respostas claras, seguras, elegantes e emocionalmente inteligentes para:
- mensagens privadas (WhatsApp / DM)
- comentários públicos (Instagram, TikTok, YouTube)
- objeções, críticas, dúvidas, inseguranças, ataques sutis, haters

Sempre com o propósito de:
- fortalecer a autoridade do usuário
- aumentar a confiança do leitor
- quebrar objeções sem parecer que está vendendo
- liderar emocionalmente a conversa
- transformar tensão em conexão
- construir segurança psicológica
- elevar a percepção profissional do usuário

REGRAS ESSENCIAIS DA RESPOSTA:
Cada resposta deve conter:
1. Validação emocional
2. Reestruturação da crença
3. Autoridade emocional sutil
4. Segurança verbal
5. Convite suave
6. Fecho elegante

DIFERENCIAÇÃO POR CANAL:
${tipo === 'WhatsApp/DM' ? 
  '→ Respostas mais densas, profundas e completas (3–6 frases)\n→ Pode incluir explicação emocional e contexto suave' :
  '→ Respostas curtas, afiadas e inteligentes (1–3 frases)\n→ Brevidade inteligente com postura elegante'}

FORMATO DE SAÍDA OBRIGATÓRIO:
Você deve entregar SEMPRE 3 versões da resposta:

VERSÃO 1: PREMIUM EQUILIBRADA
— madura, elegante, emocionalmente inteligente, confortável e persuasiva.

VERSÃO 2: MAIS FIRME E DIRETA
— respeitosa, objetiva, segura, com cortes elegantes e autoridade.

VERSÃO 3: ELEGANTE DIPLOMÁTICA
— suave, acolhedora, estratégica, perfeita para objeções sensíveis.`;

    const userPrompt = `MENSAGEM/OBJEÇÃO/COMENTÁRIO:
"${mensagem}"

CANAL: ${tipo}

Gere as 3 versões de resposta conforme as diretrizes.`;

    const responseText = await callOpenRouter(systemPrompt, userPrompt);

    // Parse the 3 versions from the response
    const versions = responseText.split(/VERSÃO \d:|---/).filter(v => v.trim().length > 10);
    
    const responses = versions.length >= 3 ? 
      [versions[0].trim(), versions[1].trim(), versions[2].trim()] :
      [responseText, responseText, responseText]; // Fallback if parsing fails

    res.json({ responses });

  } catch (err) {
    console.error('Error generating neuro responses:', err);
    res.status(500).json({ error: 'Erro ao gerar respostas' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 MindAI Hub API Server running on http://localhost:${PORT}`);
  console.log(`🤖 Using AI model: ${MODEL}`);
  console.log(`📋 Demo licenses:`);
  console.log(`   - MINDAI-BETA-2024-DEMO1`);
  console.log(`   - MINDAI-BETA-2024-DEMO2`);
});

