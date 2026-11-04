const Database = require('../db/database');
const StaysPmsService = require('./staysPmsService');

/**
 * HospedaAI - Motor de Inteligência Artificial Generativa
 * Atendimento 24h para Aluguel por Temporada integrado ao Stays PMS
 */
const AiAgentService = {
  /**
   * Processa a mensagem do hóspede e gera resposta inteligente com guardrails
   */
  processGuestMessage: async (conversationId, userMessageText) => {
    const startTime = Date.now();
    const conv = Database.getConversationById(conversationId);
    if (!conv) throw new Error('Conversa não encontrada: ' + conversationId);

    const property = Database.getPropertyById(conv.property_id);
    if (!property) throw new Error('Imóvel não encontrado: ' + conv.property_id);

    // Validação de hóspede no PMS Stays
    const staysCheck = StaysPmsService.verifyGuestStatus(conv.guest_name, conv.property_id);
    const isConfirmedGuest = conv.guest_type === 'hospedado' || (conv.guest_type !== 'interessado' && staysCheck.isConfirmedGuest);

    // 1. Análise de Transbordo Humano (Detecção de Problemas / Reclamações / Urgências)
    const escalationCheck = AiAgentService.detectEscalationTrigger(userMessageText);

    if (escalationCheck.shouldEscalate) {
      // Atualiza status da conversa para transbordo humano
      Database.updateConversationStatus(
        conv.id,
        'human_escalated',
        escalationCheck.reason,
        escalationCheck.severity
      );

      const aiResponseText = AiAgentService.generateEscalationResponse(
        conv.guest_name,
        property,
        escalationCheck
      );

      const aiMsg = Database.createMessage({
        id: 'msg-' + Date.now(),
        conversation_id: conv.id,
        sender: 'ai',
        content: aiResponseText,
        created_at: new Date().toISOString(),
        ai_intent: 'escalacao_humana',
        ai_security_check: 'escalated',
        ai_reasoning: `🚨 TRANSBORDO HUMANO ATIVADO: ${escalationCheck.reason}. Severidade: ${escalationCheck.severity.toUpperCase()}. O gestor foi notificado com alerta prioritário no painel.`
      });

      return {
        aiMessage: aiMsg,
        escalated: true,
        escalationReason: escalationCheck.reason,
        severity: escalationCheck.severity,
        securityCheck: 'escalated'
      };
    }

    // 2. Análise de Segurança Sensível (Wi-Fi, Fechaduras, Códigos de Entrada)
    const sensitiveCheck = AiAgentService.detectSensitiveInformationRequest(userMessageText);

    let securityStatus = 'passed';
    let reasoning = '';

    if (sensitiveCheck.isRequestingSensitive) {
      if (!isConfirmedGuest) {
        // Bloqueio de Segurança para Interessado / Não Confirmado
        securityStatus = 'blocked_sensitive_info';
        reasoning = `🛡️ REGRA DE SEGURANÇA ATIVADA: O usuário '${conv.guest_name}' foi classificado como INTERESSADO (sem reserva confirmada no Stays PMS). Senha de Wi-Fi e códigos de fechadura foram bloqueados para proteger o imóvel. Resposta orientou sobre os recursos e o processo de liberação no check-in.`;

        const aiResponseText = AiAgentService.generateSensitiveBlockedResponse(
          conv.guest_name,
          property,
          sensitiveCheck.topic
        );

        const aiMsg = Database.createMessage({
          id: 'msg-' + Date.now(),
          conversation_id: conv.id,
          sender: 'ai',
          content: aiResponseText,
          created_at: new Date().toISOString(),
          ai_intent: 'bloqueio_seguranca_sensivel',
          ai_security_check: securityStatus,
          ai_reasoning: reasoning
        });

        return {
          aiMessage: aiMsg,
          escalated: false,
          securityCheck: securityStatus
        };
      } else {
        // Hóspede Confirmado: Liberação autorizada com dados sensíveis
        securityStatus = 'passed';
        reasoning = `✅ ACESSO AUTORIZADO PELO PMS STAYS: Hóspede confirmado (${conv.stays_code || 'Reserva Ativa'}). Informações de acesso (Wi-Fi: ${property.wifi_ssid} / Código da Fechadura) liberadas com segurança.`;
      }
    }

    // 3. Tenta chamar API Generativa Externa (Google Gemini) se configurada
    const settings = Database.getSettings();
    let replyText = null;

    if (settings.gemini_api_key && settings.gemini_api_key.trim() !== '') {
      try {
        replyText = await AiAgentService.callGeminiApi(
          settings.gemini_api_key,
          userMessageText,
          conv,
          property,
          isConfirmedGuest
        );
      } catch (err) {
        console.warn('Fallback para motor local devido a erro na API do Gemini:', err.message);
      }
    }

    // 4. Se não houver API externa ou falhou, utiliza o Motor RAG Local Inteligente
    if (!replyText) {
      replyText = AiAgentService.generateLocalRagResponse(
        userMessageText,
        conv,
        property,
        isConfirmedGuest
      );
      if (!reasoning) {
        reasoning = `🤖 RESPOSTA GERADA PELO MOTOR HOSPEDAAI: Consulta à base de conhecimento do imóvel '${property.name}'. Contexto injetado com comodidades, regras e horários.`;
      }
    }

    const aiMsg = Database.createMessage({
      id: 'msg-' + Date.now(),
      conversation_id: conv.id,
      sender: 'ai',
      content: replyText,
      created_at: new Date().toISOString(),
      ai_intent: 'atendimento_hospede',
      ai_security_check: securityStatus,
      ai_reasoning: reasoning || 'Atendimento automatizado concluído com sucesso.'
    });

    return {
      aiMessage: aiMsg,
      escalated: false,
      securityCheck: securityStatus
    };
  },

  /**
   * Remove acentos para garantir matching robusto de texto
   */
  normalizeText: (str) => {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  },

  /**
   * Detecta solicitações de dados protegidos (Wi-Fi, código de porta, chaves)
   */
  detectSensitiveInformationRequest: (text) => {
    const norm = AiAgentService.normalizeText(text);
    const wifiPatterns = [
      'senha do wifi', 'senha do wi-fi', 'qual a senha da internet', 'rede e senha',
      'senha da internet', 'wifi password', 'passar a senha', 'me passa a senha',
      'qual o wifi', 'qual o wi-fi', 'qual a senha do wifi', 'qual a senha do wi-fi'
    ];
    const doorPatterns = [
      'codigo da porta', 'código da porta', 'senha da fechadura', 'senha da porta',
      'abrir a porta', 'codigo de acesso', 'senha do cofre', 'como entrar', 'codigo do predio',
      'como abrir', 'chave da porta'
    ];

    if (wifiPatterns.some(p => norm.includes(AiAgentService.normalizeText(p)))) {
      return { isRequestingSensitive: true, topic: 'wifi' };
    }
    if (doorPatterns.some(p => norm.includes(AiAgentService.normalizeText(p)))) {
      return { isRequestingSensitive: true, topic: 'door' };
    }
    return { isRequestingSensitive: false, topic: null };
  },

  /**
   * Resposta de bloqueio educativo para interessados
   */
  generateSensitiveBlockedResponse: (guestName, property, topic) => {
    const firstName = guestName.split(' ')[0];
    if (topic === 'wifi') {
      return `Olá, ${firstName}! Que satisfação receber sua mensagem! 😊\n\nSim, o imóvel conta com internet Wi-Fi de alta velocidade (${property.wifi_ssid}), perfeita para home office e streaming de alta definição.\n\n🔒 Por razões de privacidade e segurança do condomínio e dos hóspedes atualmente acomodados, a senha da rede é liberada automaticamente no dia do seu check-in, assim que sua reserva estiver confirmada pelo sistema.\n\nPosso ajudar com informações de disponibilidade de datas, comodidades ou dicas sobre a localização do imóvel?`;
    } else {
      return `Olá, ${firstName}! Agradecemos pelo interesse no ${property.name}! 🏠\n\nO acesso ao imóvel é super prático e moderno, através de ${property.check_in_type}.\n\n🔒 Os códigos de acesso à fechadura e instruções de entrada são criptografados e enviados exclusivamente para hóspedes com reserva confirmada na data do check-in (${property.check_in_time}).\n\nCaso queira garantir sua estadia ou tenha dúvidas sobre vagas de garagem ou regras da casa, estou à disposição!`;
    }
  },

  /**
   * Detecta se a mensagem exige transbordo humano imediato
   */
  detectEscalationTrigger: (text) => {
    const norm = AiAgentService.normalizeText(text);

    // Urgências / Emergências críticas no imóvel
    const urgentIssues = [
      'vazando agua', 'vazamento', 'cano quebrou', 'cano estourou', 'estourou', 'registro quebrou',
      'falta de luz', 'sem energia', 'sem eletricidade', 'sem agua', 'apagao',
      'fogo', 'fumaca', 'curto circuito', 'trancado do lado de fora', 'porta travou', 'fechadura nao abre'
    ];
    if (urgentIssues.some(w => norm.includes(AiAgentService.normalizeText(w)))) {
      return {
        shouldEscalate: true,
        reason: 'Problema físico emergencial no imóvel reportado pelo hóspede.',
        severity: 'urgent'
      };
    }

    // Problemas de manutenção e reclamações
    const maintenanceIssues = [
      'quebrou', 'queimou', 'chuveiro nao esquenta', 'chuveiro quebrou', 'chuveiro queimou',
      'ar condicionado nao gela', 'ar-condicionado quebrado', 'televisao nao liga',
      'geladeira nao gela', 'geladeira quebrou', 'sujo', 'sujeira', 'mau cheiro',
      'barata', 'inseto', 'barulho insuportavel', 'vizinho barulhento', 'reclamacao', 'reclamar'
    ];
    if (maintenanceIssues.some(w => norm.includes(AiAgentService.normalizeText(w)))) {
      return {
        shouldEscalate: true,
        reason: 'Reclamação ou problema de manutenção no imóvel.',
        severity: 'high'
      };
    }

    // Negociações e cancelamentos
    const negotiationIssues = [
      'desconto', 'fazer por menos', 'preco menor', 'reembolso', 'cancelar reserva',
      'devolucao do dinheiro', 'pagar por fora'
    ];
    if (negotiationIssues.some(w => norm.includes(AiAgentService.normalizeText(w)))) {
      return {
        shouldEscalate: true,
        reason: 'Solicitação financeira, negociação de valor ou cancelamento de reserva.',
        severity: 'medium'
      };
    }

    // Solicitação direta de falar com humano
    const humanRequests = [
      'falar com humano', 'falar com anfitriao', 'falar com o dono', 'falar com o gestor',
      'atendente humano', 'falar com uma pessoa', 'gerente'
    ];
    if (humanRequests.some(w => norm.includes(AiAgentService.normalizeText(w)))) {
      return {
        shouldEscalate: true,
        reason: 'Solicitação explícita do hóspede para falar com atendimento humano.',
        severity: 'low'
      };
    }

    return { shouldEscalate: false, reason: null, severity: 'none' };
  },

  /**
   * Resposta empática de transbordo com acionamento do gestor
   */
  generateEscalationResponse: (guestName, property, escalation) => {
    const firstName = guestName.split(' ')[0];
    if (escalation.severity === 'urgent') {
      return `Atenção, ${firstName}! Compreendo perfeitamente a urgência da situação e peço sinceras desculpas pelo ocorrido! 🚨\n\nAcabei de acionar nosso gestor de plantão imediatamente com PRIORIDADE MÁXIMA. Enquanto isso:\n- Se for vazamento de água, procure fechar o registro geral do imóvel;\n- Nossa equipe humana já foi alertada e entrará em contato em instantes por este canal ou telefone de emergência.`;
    }
    if (escalation.severity === 'high') {
      return `Olá, ${firstName}. Sinto muito pelo inconveniente! Nosso objetivo é garantir que sua estadia seja impecável. ⚠️\n\nJá registrei essa ocorrência e transferi a conversa diretamente para o gestor responsável pelo ${property.name}.\n\nEle foi notificado e responderá aqui neste chat o mais rápido possível para resolver a questão.`;
    }
    if (escalation.severity === 'medium') {
      return `Olá, ${firstName}! Para solicitações especiais sobre valores, alterações ou cancelamentos, estou encaminhando sua mensagem diretamente para o gestor do imóvel.\n\nEle analisará a disponibilidade e as condições para lhe responder em breve!`;
    }
    return `Com certeza, ${firstName}! Já estou repassando nossa conversa para um membro da nossa equipe de atendimento humano.\n\nO anfitrião responderá assim que possível. Agradeço pela paciência!`;
  },

  /**
   * Motor RAG Local Inteligente para respostas imediatas e contextuais
   */
  generateLocalRagResponse: (userMessage, conv, property, isConfirmedGuest) => {
    const lower = userMessage.toLowerCase();
    const firstName = conv.guest_name.split(' ')[0];

    const amenities = JSON.parse(property.amenities || '[]');
    const rules = JSON.parse(property.rules || '[]');
    const tips = JSON.parse(property.local_tips || '[]');
    const faqs = JSON.parse(property.faq || '[]');

    // 1. Roupa de cama / Toalhas / Enxoval
    if (lower.includes('roupa de cama') || lower.includes('toalha') || lower.includes('enxoval') || lower.includes('cobertor') || lower.includes('lençol')) {
      const enxovalAmenity = amenities.find(a => a.toLowerCase().includes('roupa de cama') || a.toLowerCase().includes('lençó')) || 'Roupa de cama e banho inclusas';
      return `Olá, ${firstName}! Sim! Fornecemos enxoval completo de excelente qualidade para sua estadia: ${enxovalAmenity}.\n\nTodas as peças são higienizadas e preparadas com muito carinho para que você viaje com total tranquilidade! ✨`;
    }

    // 2. Garagem / Estacionamento / Vaga
    if (lower.includes('garagem') || lower.includes('estacionamento') || lower.includes('vaga') || lower.includes('carro')) {
      const parkingAmenity = amenities.find(a => a.toLowerCase().includes('garagem') || a.toLowerCase().includes('estacionamento')) || 'Consulte as condições de estacionamento do imóvel';
      return `Olá, ${firstName}! Sobre o estacionamento no ${property.name}:\n\n🚗 ${parkingAmenity}.\n\nSe tiver um carro maior ou van, me avise para conferirmos o gabarito da vaga!`;
    }

    // 3. Cozinha / Fogão / Geladeira / Utensílios
    if (lower.includes('cozinha') || lower.includes('fogão') || lower.includes('geladeira') || lower.includes('microondas') || lower.includes('cafeteira') || lower.includes('panela')) {
      const kitchenAmenity = amenities.find(a => a.toLowerCase().includes('cozinha')) || 'Cozinha equipada com os principais eletrodomésticos e utensílios básicos para preparo de refeições.';
      return `Olá, ${firstName}! A cozinha do imóvel é muito bem equipada! 🍳\n\nDetalhes: ${kitchenAmenity}.\n\nPerfeita para preparar suas refeições com conforto e praticidade!`;
    }

    // 4. Wi-Fi e Fechadura para Hóspede Confirmado
    if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet') || lower.includes('senha')) {
      if (isConfirmedGuest) {
        return `Olá, ${firstName}! Aqui estão os dados da internet Wi-Fi do ${property.name}: 📶\n\n• Nome da Rede (SSID): ${property.wifi_ssid}\n• Senha: ${property.wifi_password}\n\nConexão veloz e estável. Fique à vontade para usar à vontade durante sua estadia!`;
      }
    }

    if (lower.includes('porta') || lower.includes('fechadura') || lower.includes('código') || lower.includes('chave') || lower.includes('como entrar')) {
      if (isConfirmedGuest) {
        return `Olá, ${firstName}! Aqui estão suas instruções de entrada para o check-in no ${property.name}: 🔑\n\n• Tipo de Acesso: ${property.check_in_type}\n• Código de Acesso: ${property.door_code}\n• Instruções: ${property.check_in_instructions}\n\nHorário oficial de check-in: a partir das ${property.check_in_time}. Desejamos uma excelente chegada!`;
      }
    }

    // 5. Horários de Check-in e Check-out
    if (lower.includes('check-in') || lower.includes('checkin') || lower.includes('horário de entrada') || lower.includes('entrar')) {
      return `Olá, ${firstName}! Os horários do ${property.name} são:\n\n🕒 Check-in: a partir das ${property.check_in_time}\n🕚 Check-out: até às ${property.check_out_time}\n\n${property.check_in_instructions}`;
    }

    if (lower.includes('check-out') || lower.includes('checkout') || lower.includes('horário de saída') || lower.includes('sair')) {
      return `Olá, ${firstName}! O horário limite de check-out é até às ${property.check_out_time}.\n\nInstruções para a saída:\n${property.check_out_instructions}`;
    }

    // 6. Animais / Pets
    if (lower.includes('pet') || lower.includes('cachorro') || lower.includes('gato') || lower.includes('animal')) {
      const petRule = rules.find(r => r.toLowerCase().includes('animais') || r.toLowerCase().includes('pet')) || 'Consulte a política de pets do imóvel.';
      return `Olá, ${firstName}! Sobre animais de estimação:\n\n🐾 ${petRule}\n\nSe for trazer seu pet, nos avise com antecedência para deixarmos tudo organizado!`;
    }

    // 7. Regras da casa / Silêncio / Fumo
    if (lower.includes('regra') || lower.includes('fumar') || lower.includes('silêncio') || lower.includes('barulho') || lower.includes('festa')) {
      return `Olá, ${firstName}! Para a tranquilidade de todos, aqui estão as principais regras do ${property.name}:\n\n` +
        rules.map(r => `• ${r}`).join('\n') +
        `\n\n🔇 Horário de silêncio: ${property.quiet_hours}. Agradecemos por cuidar do nosso espaço!`;
    }

    // 8. Dicas da Região / Restaurantes / Mercados
    if (lower.includes('dica') || lower.includes('restaurante') || lower.includes('mercado') || lower.includes('praia') || lower.includes('passeio') || lower.includes('onde comer')) {
      let tipsText = `Olá, ${firstName}! Preparamos algumas dicas incríveis da região para você aproveitar ao máximo: 📍\n\n`;
      tips.forEach(t => {
        tipsText += `• [${t.category}] ${t.title}: ${t.description}\n`;
      });
      return tipsText + `\nSe precisar de indicação para algo específico, é só perguntar!`;
    }

    // 9. Ar-condicionado / Climatização / Lareira
    if (lower.includes('ar condicionado') || lower.includes('ar-condicionado') || lower.includes('climatizado') || lower.includes('lareira') || lower.includes('aquecedor')) {
      const ac = amenities.find(a => a.toLowerCase().includes('ar-condicionado') || a.toLowerCase().includes('ar condicionado') || a.toLowerCase().includes('lareira') || a.toLowerCase().includes('aquecedor')) || 'Equipamentos de climatização disponíveis.';
      return `Olá, ${firstName}! O imóvel conta com: ${ac}.\n\nAmbiente sempre na temperatura ideal para seu conforto! ❄️🔥`;
    }

    // 10. Saudação Geral / Agradecimento
    if (lower.includes('obrigad') || lower.includes('valeu') || lower.includes('agradeço')) {
      return `Por nada, ${firstName}! Estou sempre à disposição 24h. Tenha um excelente dia e uma ótima estadia! 🌟`;
    }

    if (lower.includes('olá') || lower.includes('bom dia') || lower.includes('boa tarde') || lower.includes('boa noite') || lower.includes('oi')) {
      return `Olá, ${firstName}! Seja muito bem-vindo ao HospedaAI, assistente virtual do ${property.name}! 👋\n\nComo posso te ajudar hoje? Posso tirar dúvidas sobre comodidades, regras, instruções de check-in ou dicas da região!`;
    }

    // Resposta padrão RAG amigável
    return `Olá, ${firstName}! Agradeço pelo contato. O ${property.name} dispõe de acomodações para até ${property.max_guests} pessoas com ${property.bedrooms} quartos, localizado em ${property.city} - ${property.state}.\n\nComodidades em destaque:\n` +
      amenities.slice(0, 4).map(a => `• ${a}`).join('\n') +
      `\n\nSe tiver dúvidas sobre estacionamento, enxoval, horários ou reserva, conte comigo!`;
  },

  /**
   * Integração com API Google Gemini (quando chave fornecida)
   */
  callGeminiApi: async (apiKey, userMessage, conv, property, isConfirmedGuest) => {
    const amenities = JSON.parse(property.amenities || '[]');
    const rules = JSON.parse(property.rules || '[]');
    const tips = JSON.parse(property.local_tips || '[]');

    const systemPrompt = `Você é o HospedaAI, um assistente virtual inteligente e acolhedor para hóspedes de aluguel por temporada.
Você está atendendo um hóspede no imóvel "${property.name}" localizado em ${property.address}, ${property.city} - ${property.state}.

STATUS DO HÓSPEDE NO PMS STAYS:
- Nome: ${conv.guest_name}
- Tipo: ${isConfirmedGuest ? 'HÓSPEDE CONFIRMADO (TEM RESERVA CONFIRMADA)' : 'INTERESSADO / LEAD (NÃO TEM RESERVA CONFIRMADA)'}

DIRETRIZES DE SEGURANÇA CRUCIAIS:
${isConfirmedGuest ? `
- O hóspede TEM reserva confirmada. Você PODE e DEVE informar quando solicitado:
  * Nome do Wi-Fi: ${property.wifi_ssid}
  * Senha do Wi-Fi: ${property.wifi_password}
  * Código da Fechadura/Porta: ${property.door_code}
  * Instruções de Check-in: ${property.check_in_instructions}
` : `
- O usuário é apenas INTERESSADO (SEM reserva confirmada).
- REGRA ESTRITA: NUNCA revele a senha do Wi-Fi nem o código da fechadura digital/cofre. Diga educadamente que há internet Wi-Fi de alta velocidade e fechadura moderna, mas que os códigos de acesso e senhas são gerados e liberados automaticamente no dia do check-in após a confirmação da reserva.
`}

BASE DE CONHECIMENTO DO IMÓVEL:
- Quartos: ${property.bedrooms} | Banheiros: ${property.bathrooms} | Capacidade: até ${property.max_guests} pessoas
- Check-in: a partir das ${property.check_in_time} | Check-out: até às ${property.check_out_time}
- Horário de Silêncio: ${property.quiet_hours}
- Comodidades: ${amenities.join(', ')}
- Regras: ${rules.join('; ')}
- Dicas Locais: ${tips.map(t => `${t.title} (${t.description})`).join('; ')}

DIRETRIZ DE TRANSBORDO HUMANO:
Se o usuário reclamar de problema grave no imóvel (vazamento de água, falta de luz, quebra grave), peça desculpas, mantenha a calma e diga que está acionando o gestor com máxima urgência.

Responda sempre em tom cordial, profissional e prestativo, usando emojis com moderação.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: systemPrompt + '\n\nMensagem do Hóspede:\n' + userMessage }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 600
        }
      })
    });

    if (!res.ok) {
      throw new Error(`Gemini API HTTP Error: ${res.status}`);
    }

    const data = await res.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      return data.candidates[0].content.parts[0].text;
    }
    throw new Error('Formato inesperado na resposta do Gemini');
  }
};

module.exports = AiAgentService;
