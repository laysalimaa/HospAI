const Database = require('../db/database');

/**
 * Stays PMS Integration Service
 * Hub central que conecta as plataformas Airbnb, Booking.com, Expedia e Reservas Diretas
 */
const StaysPmsService = {
  /**
   * Identifica e valida o hóspede pelo nome, telefone ou código de reserva no PMS
   */
  verifyGuestStatus: (guestIdentifier, propertyId) => {
    if (!guestIdentifier) {
      return {
        isConfirmedGuest: false,
        guestType: 'interessado',
        reservation: null,
        message: 'Hóspede sem identificador cadastrado (interessado pré-reserva).'
      };
    }

    // Busca reservas para a propriedade pelo nome ou telefone ou código Stays
    const reservations = Database.getAllReservations().filter(r => r.property_id === propertyId);
    const cleanId = guestIdentifier.trim().toLowerCase();

    const cleanDigits = cleanId.replace(/\D/g, '');
    const matchedReservation = reservations.find(r => {
      const guestLower = r.guest_name.toLowerCase().trim();
      const nameMatch = cleanId.length >= 3 && (guestLower.includes(cleanId) || cleanId.includes(guestLower));
      const codeMatch = r.stays_code.toLowerCase() === cleanId;
      const phoneMatch = cleanDigits.length >= 8 && r.guest_phone && r.guest_phone.replace(/\D/g, '').includes(cleanDigits);
      return nameMatch || codeMatch || phoneMatch;
    });

    if (!matchedReservation) {
      return {
        isConfirmedGuest: false,
        guestType: 'interessado',
        reservation: null,
        message: 'Nenhuma reserva confirmada encontrada no PMS Stays. Classificado como Interessado / Pré-reserva.'
      };
    }

    const isConfirmed = ['confirmed', 'checked_in'].includes(matchedReservation.status);

    return {
      isConfirmedGuest: isConfirmed,
      guestType: isConfirmed ? 'hospedado' : 'interessado',
      reservation: matchedReservation,
      message: isConfirmed
        ? `Reserva confirmada encontrada no PMS Stays (${matchedReservation.stays_code}) via ${matchedReservation.platform}. Status: ${matchedReservation.status}.`
        : `Reserva encontrada, mas status é '${matchedReservation.status}'.`
    };
  },

  /**
   * Retorna os canais integrados suportados pelo PMS
   */
  getConnectedChannels: () => [
    { id: 'airbnb', name: 'Airbnb', icon: 'airbnb', status: 'connected', activeListings: 3 },
    { id: 'booking', name: 'Booking.com', icon: 'booking', status: 'connected', activeListings: 3 },
    { id: 'expedia', name: 'Expedia Group', icon: 'expedia', status: 'connected', activeListings: 2 },
    { id: 'direct', name: 'Site Próprio / WhatsApp', icon: 'message-circle', status: 'connected', activeListings: 3 }
  ],

  /**
   * Simula o recebimento de uma nova mensagem externa sincronizada pelo PMS Stays
   */
  simulateInboundMessage: (payload) => {
    const { propertyId, guestName, guestPhone, platform, text, reservationId } = payload;
    
    // Verifica se já existe conversa ativa para esse hóspede
    let conv = Database.getAllConversations().find(c => 
      c.property_id === propertyId &&
      c.guest_name.toLowerCase() === guestName.toLowerCase() &&
      c.status !== 'closed'
    );

    const verification = StaysPmsService.verifyGuestStatus(guestName, propertyId);

    if (!conv) {
      const convId = 'conv-' + Date.now();
      conv = Database.createConversation({
        id: convId,
        property_id: propertyId,
        reservation_id: verification.reservation ? verification.reservation.id : (reservationId || null),
        guest_name: guestName,
        guest_phone: guestPhone || '+55 (11) 9' + Math.floor(10000000 + Math.random() * 90000000),
        platform: platform || 'Airbnb',
        guest_type: verification.guestType,
        status: 'ai_active',
        escalation_reason: null,
        escalation_severity: 'none',
        escalation_timestamp: null,
        human_assigned_to: null,
        last_message: text,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
    }

    // Registra a mensagem do hóspede
    const msgId = 'msg-' + Date.now();
    const guestMsg = Database.createMessage({
      id: msgId,
      conversation_id: conv.id,
      sender: 'guest',
      content: text,
      created_at: new Date().toISOString(),
      ai_intent: 'inbound_message',
      ai_security_check: 'pending',
      ai_reasoning: `Mensagem recebida via PMS Stays do canal ${conv.platform}.`
    });

    return { conversation: conv, message: guestMsg, verification };
  }
};

module.exports = StaysPmsService;
