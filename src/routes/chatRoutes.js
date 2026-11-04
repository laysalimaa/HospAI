const express = require('express');
const router = express.Router();
const Database = require('../db/database');
const AiAgentService = require('../services/aiAgentService');
const StaysPmsService = require('../services/staysPmsService');

// GET all conversations
router.get('/conversations', (req, res) => {
  try {
    const { status, propertyId } = req.query;
    let list = Database.getAllConversations();

    if (status && status !== 'all') {
      list = list.filter(c => c.status === status);
    }
    if (propertyId && propertyId !== 'all') {
      list = list.filter(c => c.property_id === propertyId);
    }

    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET conversation by ID
router.get('/conversations/:id', (req, res) => {
  try {
    const conv = Database.getConversationById(req.params.id);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversa não encontrada' });
    const messages = Database.getMessagesByConversationId(req.params.id);
    res.json({ success: true, data: { ...conv, messages } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET messages of a conversation
router.get('/conversations/:id/messages', (req, res) => {
  try {
    const messages = Database.getMessagesByConversationId(req.params.id);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST send message in conversation (from guest or host)
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, sender } = req.body;

    const conv = Database.getConversationById(id);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversa não encontrada' });

    const msgId = 'msg-' + Date.now();
    const createdMsg = Database.createMessage({
      id: msgId,
      conversation_id: id,
      sender: sender || 'host',
      content,
      created_at: new Date().toISOString(),
      ai_intent: sender === 'host' ? 'resposta_humana' : 'mensagem_hospede',
      ai_security_check: 'passed',
      ai_reasoning: sender === 'host' ? 'Mensagem enviada manualmente pelo gestor.' : null
    });

    // Se for mensagem de hóspede e a conversa ainda estiver sob controle da IA, dispara processamento
    let aiResponse = null;
    if (sender === 'guest' && conv.status === 'ai_active') {
      aiResponse = await AiAgentService.processGuestMessage(id, content);
    }

    const updatedConv = Database.getConversationById(id);
    const messages = Database.getMessagesByConversationId(id);

    res.json({
      success: true,
      data: {
        sentMessage: createdMsg,
        aiResponse,
        conversation: updatedConv,
        messages
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Host takes over conversation (Transbordo Manual)
router.post('/conversations/:id/takeover', (req, res) => {
  try {
    const { id } = req.params;
    const { managerName } = req.body;

    const conv = Database.getConversationById(id);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversa não encontrada' });

    Database.updateConversationStatus(id, 'human_escalated', 'Assumido manualmente pelo gestor', 'medium');
    Database.db.prepare("UPDATE conversations SET human_assigned_to = ? WHERE id = ?").run(
      managerName || 'Gestor Responsável',
      id
    );

    // Adiciona log de sistema/mensagem informativa
    Database.createMessage({
      id: 'msg-' + Date.now(),
      conversation_id: id,
      sender: 'host',
      content: `[Sistema]: Atendimento assumido por ${managerName || 'Gestor Responsável'}. Respostas automáticas de IA pausadas neste canal.`,
      created_at: new Date().toISOString(),
      ai_intent: 'sistema_transbordo',
      ai_security_check: 'passed',
      ai_reasoning: 'Gestor interveio manualmente.'
    });

    const updated = Database.getConversationById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Re-enable AI
router.post('/conversations/:id/re-enable-ai', (req, res) => {
  try {
    const { id } = req.params;
    Database.updateConversationStatus(id, 'ai_active', null, 'none');
    Database.db.prepare("UPDATE conversations SET human_assigned_to = NULL WHERE id = ?").run(id);

    Database.createMessage({
      id: 'msg-' + Date.now(),
      conversation_id: id,
      sender: 'ai',
      content: `[Sistema]: Atendimento devolvido para o agente de IA HospedaAI 24h.`,
      created_at: new Date().toISOString(),
      ai_intent: 'sistema_retorno_ia',
      ai_security_check: 'passed',
      ai_reasoning: 'Controle devolvido ao agente autônomo.'
    });

    const updated = Database.getConversationById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Mark conversation as resolved / closed
router.post('/conversations/:id/resolve', (req, res) => {
  try {
    const { id } = req.params;
    Database.updateConversationStatus(id, 'closed', 'Atendimento finalizado com sucesso', 'none');
    const updated = Database.getConversationById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Simulator guest message
router.post('/simulator/send', async (req, res) => {
  try {
    const { propertyId, guestName, platform, guestType, messageText } = req.body;

    if (!propertyId || !messageText) {
      return res.status(400).json({ success: false, error: 'propertyId e messageText são obrigatórios' });
    }

    // Procura ou cria conversa no simulador
    let conv = Database.getAllConversations().find(c =>
      c.property_id === propertyId &&
      c.guest_name.toLowerCase() === (guestName || 'Hóspede Simulado').toLowerCase() &&
      c.status !== 'closed'
    );

    // Verifica status no PMS
    const staysCheck = StaysPmsService.verifyGuestStatus(guestName, propertyId);
    const finalGuestType = guestType || staysCheck.guestType;

    if (!conv) {
      const convId = 'conv-sim-' + Date.now();
      conv = Database.createConversation({
        id: convId,
        property_id: propertyId,
        reservation_id: staysCheck.reservation ? staysCheck.reservation.id : null,
        guest_name: guestName || 'Hóspede Simulado',
        guest_phone: '+55 (11) 9' + Math.floor(10000000 + Math.random() * 90000000),
        platform: platform || 'Airbnb',
        guest_type: finalGuestType,
        status: 'ai_active',
        escalation_reason: null,
        escalation_severity: 'none',
        escalation_timestamp: null,
        human_assigned_to: null,
        last_message: messageText,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
    } else {
      // Atualiza guest_type se selecionado manualmente no simulador
      if (guestType && conv.guest_type !== guestType) {
        Database.db.prepare("UPDATE conversations SET guest_type = ? WHERE id = ?").run(guestType, conv.id);
        conv.guest_type = guestType;
      }
    }

    // Registra a mensagem do hóspede
    const guestMsg = Database.createMessage({
      id: 'msg-' + Date.now(),
      conversation_id: conv.id,
      sender: 'guest',
      content: messageText,
      created_at: new Date().toISOString(),
      ai_intent: 'simulador_pergunta',
      ai_security_check: 'pending',
      ai_reasoning: `Entrada via simulador (${platform || 'Airbnb'}). Hóspede classificado como ${finalGuestType.toUpperCase()}.`
    });

    // No simulador, processa a mensagem através do motor de IA
    const aiResult = await AiAgentService.processGuestMessage(conv.id, messageText);

    const updatedConv = Database.getConversationById(conv.id);
    const messages = Database.getMessagesByConversationId(conv.id);

    res.json({
      success: true,
      data: {
        guestMessage: guestMsg,
        aiResponse: aiResult ? aiResult.aiMessage : null,
        escalated: aiResult ? aiResult.escalated : false,
        securityCheck: aiResult ? aiResult.securityCheck : 'passed',
        conversation: updatedConv,
        messages
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
