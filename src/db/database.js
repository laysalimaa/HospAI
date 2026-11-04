const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(__dirname, '..', '..', 'hospeda_ai.db');
const db = new DatabaseSync(dbPath);

// Initialize Tables
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      type TEXT NOT NULL,
      bedrooms INTEGER NOT NULL,
      bathrooms INTEGER NOT NULL,
      max_guests INTEGER NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out_time TEXT NOT NULL,
      quiet_hours TEXT NOT NULL,
      wifi_ssid TEXT NOT NULL,
      wifi_password TEXT NOT NULL,
      door_code TEXT NOT NULL,
      check_in_type TEXT NOT NULL,
      check_in_instructions TEXT NOT NULL,
      check_out_instructions TEXT NOT NULL,
      amenities TEXT NOT NULL,
      rules TEXT NOT NULL,
      local_tips TEXT NOT NULL,
      faq TEXT NOT NULL,
      image_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      stays_code TEXT UNIQUE NOT NULL,
      property_id TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      guest_phone TEXT,
      guest_email TEXT,
      platform TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      num_guests INTEGER NOT NULL,
      status TEXT NOT NULL,
      total_price REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (property_id) REFERENCES properties (id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      reservation_id TEXT,
      guest_name TEXT NOT NULL,
      guest_phone TEXT,
      platform TEXT NOT NULL,
      guest_type TEXT NOT NULL,
      status TEXT NOT NULL,
      escalation_reason TEXT,
      escalation_severity TEXT DEFAULT 'none',
      escalation_timestamp TEXT,
      human_assigned_to TEXT,
      last_message TEXT,
      last_message_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (property_id) REFERENCES properties (id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      ai_intent TEXT,
      ai_security_check TEXT,
      ai_reasoning TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default settings
  const checkSetting = db.prepare("SELECT value FROM settings WHERE key = 'ai_provider'").get();
  if (!checkSetting) {
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run('ai_provider', 'hybrid_intelligent');
    insertSetting.run('gemini_api_key', '');
    insertSetting.run('tone_of_voice', 'cordial_profissional');
    insertSetting.run('auto_reply_enabled', 'true');
    insertSetting.run('escalation_auto_alert', 'true');
    insertSetting.run('stays_api_status', 'connected');
  }

  // Seed initial properties if empty
  const countProps = db.prepare("SELECT COUNT(*) as count FROM properties").get();
  if (countProps.count === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const now = new Date().toISOString();

  const insertProp = db.prepare(`
    INSERT INTO properties (
      id, name, code, address, city, state, type, bedrooms, bathrooms, max_guests,
      check_in_time, check_out_time, quiet_hours, wifi_ssid, wifi_password, door_code,
      check_in_type, check_in_instructions, check_out_instructions, amenities, rules,
      local_tips, faq, image_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Property 1: Copacabana
  insertProp.run(
    'prop-copa-01',
    'Apartamento Vista Mar Copacabana',
    'COPA-302',
    'Av. Atlântica, 1850 - Apto 302',
    'Rio de Janeiro',
    'RJ',
    'Apartamento',
    2,
    2,
    6,
    '15:00',
    '11:00',
    '22:00 às 08:00',
    'Copacabana_Beach_5G',
    'CopaSol#2026!',
    '4598#',
    'Fechadura Digital (Smartlock)',
    'Para entrar no prédio, informe à portaria 24h seu nome e o número 302. Na porta do apartamento, digite o código da fechadura digital seguido da tecla #. A porta destrancará com um aviso sonoro.',
    'No check-out, por favor apague as luzes, desligue o ar-condicionado de todos os cômodos, retire o lixo até a lixeira do corredor e puxe a porta para trancar. Avise na portaria que desocupou.',
    JSON.stringify([
      'Wi-Fi Fibra 500 Mbps',
      'Roupa de cama e banho 100% algodão inclusas (troca a cada 4 dias)',
      'Ar-condicionado Split em todos os quartos e na sala',
      'Cozinha completa (cooktop, forno elétrico, micro-ondas, lava-louças, cafeteira Nespresso)',
      '1 Vaga de garagem coberta (gratuita e demarcada)',
      'Portaria 24 horas',
      'Varanda com vista panorâmica para a praia',
      'Smart TV 55 polegadas com Netflix e canais a cabo',
      'Máquina de lavar e secar roupas'
    ]),
    JSON.stringify([
      'Proibido fumar em qualquer dependência do apartamento e prédio (multa de R$ 500)',
      'Horário de silêncio rigoroso entre 22:00 e 08:00 (norma do condomínio residencial)',
      'Não é permitida a entrada de visitantes ou pessoas não cadastradas na reserva',
      'Animais de estimação aceitos apenas de pequeno porte (até 10kg), mediante aviso prévio',
      'Festas e eventos estritamente proibidos'
    ]),
    JSON.stringify([
      { category: 'Alimentação', title: 'Restaurante Cervantes', description: 'Famoso pelo sanduíche de pernil com abacaxi e chopp gelado. Fica a 3 quadras.' },
      { category: 'Café da Manhã', title: 'Confeitaria Colombo (Forte de Copacabana)', description: 'Vista incrível para a orla de Copacabana com café colonial clássico.' },
      { category: 'Mercado', title: 'Pão de Açúcar 24h', description: 'Rua Barata Ribeiro, 400 metros de distância.' },
      { category: 'Passeio', title: 'Praia do Arpoador', description: 'Melhor pôr do sol do Rio de Janeiro, a 15 minutos a pé.' }
    ]),
    JSON.stringify([
      { q: 'Tem roupa de cama e toalhas?', a: 'Sim! Fornecemos enxoval completo de cama e banho padrão hotelaria para todos os hóspedes da reserva.' },
      { q: 'Tem vaga de garagem?', a: 'Sim, dispomos de 1 vaga privativa e demarcada no subsolo, inclusa na diária.' },
      { q: 'Posso fazer check-in antecipado?', a: 'O early check-in depende da disponibilidade em caso de saída anterior. Por favor, solicite com 24h de antecedência.' }
    ]),
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80',
    now
  );

  // Property 2: Campos do Jordão
  insertProp.run(
    'prop-campos-02',
    'Chalé Romântico com Hidro & Lareira',
    'CHALE-07',
    'Rua das Hortênsias, 420 - Vila Capivari',
    'Campos do Jordão',
    'SP',
    'Chalé',
    1,
    1,
    2,
    '14:00',
    '12:00',
    '21:30 às 08:30',
    'ChaleMontanha_Starlink',
    'FrioLareira#77!',
    '7721',
    'Cofre de Chaves com Senha',
    'Ao chegar no portão de madeira do chalé, utilize o interfone ou digite a senha no cofre numérico localizado ao lado da porta principal para retirar as chaves.',
    'No check-out, certifique-se de que a lareira está totalmente apagada, guarde as chaves dentro do cofre e feche com a mesma combinação.',
    JSON.stringify([
      'Internet Starlink de alta velocidade',
      'Banheira de hidromassagem dupla com vista para a mata',
      'Lareira ecológica a lenha com primeiro cesto de lenha cortesia',
      'Cama King Size com lençóis de 400 fios e cobertor térmico',
      'Cozinha gourmet equipada com fondue, taças de vinho e adega',
      'Estacionamento privativo para 2 veículos',
      'Aquecedor a óleo e toalheiro térmico no banheiro',
      'Café da manhã de boas-vindas (cesta artesanal com pães e geleias)'
    ]),
    JSON.stringify([
      'Ambiente exclusivo para casais (capacidade máxima de 2 adultos)',
      'Não é permitido fumar em nenhuma área interna do chalé',
      'Não aceitamos pets devido à presença de fauna silvestre nativa',
      'Manter atenção ao manuseio da lareira (seguir manual de instruções)',
      'Proibido som alto em qualquer horário'
    ]),
    JSON.stringify([
      { category: 'Fondue', title: 'Restaurante Ludwig', description: 'Tradicional fondue suíço no Capivari, reserva recomendada.' },
      { category: 'Passeio', title: 'Parque Amantikir', description: 'Jardins temáticos de vários países com labirinto de arbustos.' },
      { category: 'Cervejaria', title: 'Baden Baden', description: 'Visita guiada e degustação de cervejas artesanais.' }
    ]),
    JSON.stringify([
      { q: 'Tem lenha para a lareira?', a: 'Sim! O primeiro cesto de lenha é cortesia. Cestos adicionais podem ser solicitados por R$ 35 cada.' },
      { q: 'Tem aquecimento?', a: 'Sim, o chalé possui lareira, aquecedor elétrico e lençóis térmicos nos colchões.' }
    ]),
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&auto=format&fit=crop&q=80',
    now
  );

  // Property 3: São Paulo Jardins
  insertProp.run(
    'prop-jardins-03',
    'Studio Design Executivo Jardins',
    'JD-1004',
    'Alameda Lorena, 1420 - Apto 1004',
    'São Paulo',
    'SP',
    'Studio',
    1,
    1,
    2,
    '15:00',
    '11:00',
    '22:00 às 08:00',
    'JardinsDesign_Guest',
    'SampaWork#2026',
    '9032#',
    'Fechadura Facial / Biometria e Senha',
    'O condomínio possui reconhecimento facial na portaria. Para a porta do Studio 1004, use o teclado numérico com a senha de acesso seguida de #.',
    'Ao sair, feche as janelas, desligue luzes e ar, aperte a tecla de trava da fechadura digital.',
    JSON.stringify([
      'Wi-Fi Fibra 600 Mbps ultra-rápido com repetidor',
      'Estação de trabalho ergonômica com monitor adicional 27"',
      'Piscina infinita no rooftop com vista panorâmica de São Paulo',
      'Academia moderna 24h no prédio',
      'Cama Queen Size com travesseiros ortopédicos',
      'Cafeteira Nespresso com cápsulas de cortesia',
      'Lavanderia compartilhada OMO no subsolo',
      'Pet friendly (aceitamos cães e gatos até 15kg)'
    ]),
    JSON.stringify([
      'Proibido fumar em qualquer dependência do Studio ou condomínio',
      'Horário de silêncio entre 22:00 e 08:00',
      'Pets devem circular nas áreas comuns na coleira ou no colo',
      'Uso da piscina permitido aos hóspedes cadastrados das 07:00 às 22:00'
    ]),
    JSON.stringify([
      { category: 'Café', title: 'Santo Grão Oscar Freire', description: 'Cafés especiais e brunch requintado a 2 quadras.' },
      { category: 'Cultura', title: 'MASP na Paulista', description: 'Museu icônico a 10 minutos de caminhada.' },
      { category: 'Restaurante', title: 'Figueira Rubaiyat', description: 'Excelente gastronomia sob a sombra de uma figueira centenária.' }
    ]),
    JSON.stringify([
      { q: 'Tem estacionamento?', a: 'O prédio conta com serviço de manobrista rotativo (valor avulso pago diretamente na recepção).' },
      { q: 'Aceita pet?', a: 'Sim! Somos pet friendly para animais de pequeno e médio porte.' }
    ]),
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=80',
    now
  );

  // Seed Reservations (Stays PMS Simulation)
  const insertRes = db.prepare(`
    INSERT INTO reservations (
      id, stays_code, property_id, guest_name, guest_phone, guest_email, platform,
      check_in, check_out, num_guests, status, total_price, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Confirmed guest currently in Copacabana
  insertRes.run(
    'res-001',
    'STY-2026-8821',
    'prop-copa-01',
    'Mariana Costa',
    '+55 (21) 98765-4321',
    'mariana.costa@email.com',
    'Airbnb',
    '2026-11-02',
    '2026-11-07',
    4,
    'checked_in',
    2850.00,
    now
  );

  // Confirmed guest for Campos do Jordão
  insertRes.run(
    'res-002',
    'STY-2026-4412',
    'prop-campos-02',
    'Lucas Mendes',
    '+55 (11) 97123-9988',
    'lucas.mendes@email.com',
    'Booking.com',
    '2026-11-06',
    '2026-11-09',
    2,
    'confirmed',
    1950.00,
    now
  );

  // Guest in Copacabana with an issue
  insertRes.run(
    'res-003',
    'STY-2026-3390',
    'prop-copa-01',
    'Roberto Souza',
    '+55 (31) 99888-7711',
    'roberto.souza@email.com',
    'Expedia',
    '2026-11-03',
    '2026-11-06',
    3,
    'checked_in',
    1720.00,
    now
  );

  // Seed Initial Conversations
  const insertConv = db.prepare(`
    INSERT INTO conversations (
      id, property_id, reservation_id, guest_name, guest_phone, platform,
      guest_type, status, escalation_reason, escalation_severity, escalation_timestamp,
      human_assigned_to, last_message, last_message_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMsg = db.prepare(`
    INSERT INTO messages (
      id, conversation_id, sender, content, created_at, ai_intent, ai_security_check, ai_reasoning
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Conversation 1: Confirmed guest Mariana asking for Wi-Fi and amenities (Handled 100% by AI)
  insertConv.run(
    'conv-001',
    'prop-copa-01',
    'res-001',
    'Mariana Costa',
    '+55 (21) 98765-4321',
    'Airbnb',
    'hospedado',
    'ai_active',
    null,
    'none',
    null,
    null,
    'Perfeito! O Wi-Fi conectou de primeira. Muito obrigada!',
    now,
    now
  );

  insertMsg.run(
    'msg-001-1',
    'conv-001',
    'guest',
    'Olá! Acabamos de entrar no apartamento Copacabana 302. Qual é o nome da rede e a senha do Wi-Fi?',
    now,
    'solicitar_wifi',
    'passed',
    'Hóspede possui reserva confirmada (STY-2026-8821) com status checked_in no PMS Stays. Informações sensíveis de Wi-Fi e acesso liberadas com segurança.'
  );

  insertMsg.run(
    'msg-001-2',
    'conv-001',
    'ai',
    'Olá, Mariana! Seja muito bem-vinda ao Apartamento Vista Mar Copacabana! 🌊✨\n\nComo sua reserva está confirmada, aqui estão os dados de acesso à internet:\n📶 Rede: Copacabana_Beach_5G\n🔑 Senha: CopaSol#2026!\n\nA conexão é fibra ótica de 500 Mbps, excelente para streaming e home office. Se precisar de mais alguma coisa durante sua estadia, estou à disposição!',
    now,
    'resposta_wifi',
    'passed',
    'Dados de rede enviados com mensagem cordial personalizada.'
  );

  insertMsg.run(
    'msg-001-3',
    'conv-001',
    'guest',
    'Perfeito! O Wi-Fi conectou de primeira. Muito obrigada!',
    now,
    'agradecimento',
    'passed',
    'Atendimento bem-sucedido.'
  );

  // Conversation 2: Interested lead Carlos (Pre-booking - checks sensitive info protection!)
  insertConv.run(
    'conv-002',
    'prop-jardins-03',
    null,
    'Carlos Silva (Interessado)',
    '+55 (11) 98111-2233',
    'Booking.com',
    'interessado',
    'ai_active',
    null,
    'none',
    null,
    null,
    'Entendi perfeitamente! E o prédio aceita cachorrinho de pequeno porte?',
    now,
    now
  );

  insertMsg.run(
    'msg-002-1',
    'conv-002',
    'guest',
    'Boa tarde! Estou planejando me hospedar no Studio Jardins. Tem vaga de garagem inclusa e já pode me passar a senha do Wi-Fi para testar se pega bem?',
    now,
    'duvida_pre_reserva_e_wifi',
    'blocked_sensitive_info',
    'Remetente NÃO possui reserva confirmada (Lead/Interessado). Regra de segurança aplicada: Senha do Wi-Fi e códigos de porta ocultados. Comodidades públicas detalhadas.'
  );

  insertMsg.run(
    'msg-002-2',
    'conv-002',
    'ai',
    'Boa tarde, Carlos! Que ótimo seu interesse no Studio Design Executivo Jardins! 🏙️\n\nSobre a garagem: o condomínio dispõe de serviço de manobrista rotativo pago diretamente no local.\n\nQuanto ao Wi-Fi: temos fibra ótica de 600 Mbps de alta velocidade em todo o studio! Por razões de segurança do condomínio e dos atuais hóspedes, a senha de acesso é liberada automaticamente no dia do seu check-in assim que sua reserva for confirmada.\n\nFico à disposição caso queira tirar mais dúvidas ou fechar as datas da sua estadia!',
    now,
    'resposta_seguranca_amenidades',
    'blocked_sensitive_info',
    'Política de proteção de credenciais mantida. Vaga explicada e incentivo à conversão da reserva.'
  );

  // Conversation 3: Human Escalation (Roberto Souza with maintenance emergency)
  insertConv.run(
    'conv-003',
    'prop-copa-01',
    'res-003',
    'Roberto Souza',
    '+55 (31) 99888-7711',
    'Expedia',
    'hospedado',
    'human_escalated',
    'Manutenção Urgente: Registro do chuveiro quebrou e está vazando água pelo banheiro',
    'urgent',
    now,
    'Elienaide Machado (Gestora)',
    'O chuveiro do banheiro social quebrou o registro e está vazando água pelo chão!',
    now,
    now
  );

  insertMsg.run(
    'msg-003-1',
    'conv-003',
    'guest',
    'Urgente! O chuveiro do banheiro social quebrou o registro e está vazando água pelo chão do apartamento!',
    now,
    'reclamacao_manutencao_emergencia',
    'escalated',
    'Detectado gatilho de transbordo humano: emergência física/manutenção crítica no imóvel (vazamento). Sentimento do hóspede: urgente/crítico. Roteado imediatamente para o gestor.'
  );

  insertMsg.run(
    'msg-003-2',
    'conv-003',
    'ai',
    'Roberto, compreendo a urgência e peço sinceras desculpas pelo transtorno! 🚨\n\nComo se trata de um problema de manutenção emergencial, acabei de acionar nosso gestor de plantão imediatamente com prioridade máxima. Enquanto isso, se possível, feche o registro geral de água localizado ao lado da entrada do banheiro.\n\nUm membro da nossa equipe humana já foi notificado e responderá aqui neste chat em instantes.',
    now,
    'transbordo_humano_acionado',
    'escalated',
    'Mensagem de contenção enviada, instrução rápida de segurança fornecida e alerta emitido no painel do anfitrião.'
  );
}

// Helper methods for application queries
const Database = {
  db,
  init: initDatabase,

  // Properties
  getAllProperties: () => db.prepare("SELECT * FROM properties ORDER BY name ASC").all(),
  getPropertyById: (id) => db.prepare("SELECT * FROM properties WHERE id = ?").get(id),
  createProperty: (p) => {
    const stmt = db.prepare(`
      INSERT INTO properties (
        id, name, code, address, city, state, type, bedrooms, bathrooms, max_guests,
        check_in_time, check_out_time, quiet_hours, wifi_ssid, wifi_password, door_code,
        check_in_type, check_in_instructions, check_out_instructions, amenities, rules,
        local_tips, faq, image_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      p.id, p.name, p.code, p.address, p.city, p.state, p.type, p.bedrooms, p.bathrooms, p.max_guests,
      p.check_in_time, p.check_out_time, p.quiet_hours, p.wifi_ssid, p.wifi_password, p.door_code,
      p.check_in_type, p.check_in_instructions, p.check_out_instructions, p.amenities, p.rules,
      p.local_tips, p.faq, p.image_url, p.created_at
    );
    return Database.getPropertyById(p.id);
  },
  updateProperty: (id, p) => {
    const stmt = db.prepare(`
      UPDATE properties SET
        name = ?, code = ?, address = ?, city = ?, state = ?, type = ?,
        bedrooms = ?, bathrooms = ?, max_guests = ?, check_in_time = ?, check_out_time = ?,
        quiet_hours = ?, wifi_ssid = ?, wifi_password = ?, door_code = ?,
        check_in_type = ?, check_in_instructions = ?, check_out_instructions = ?,
        amenities = ?, rules = ?, local_tips = ?, faq = ?, image_url = ?
      WHERE id = ?
    `);
    stmt.run(
      p.name, p.code, p.address, p.city, p.state, p.type,
      p.bedrooms, p.bathrooms, p.max_guests, p.check_in_time, p.check_out_time,
      p.quiet_hours, p.wifi_ssid, p.wifi_password, p.door_code,
      p.check_in_type, p.check_in_instructions, p.check_out_instructions,
      p.amenities, p.rules, p.local_tips, p.faq, p.image_url,
      id
    );
    return Database.getPropertyById(id);
  },
  deleteProperty: (id) => db.prepare("DELETE FROM properties WHERE id = ?").run(id),

  // Reservations (Stays PMS)
  getAllReservations: () => db.prepare(`
    SELECT r.*, p.name as property_name, p.code as property_code
    FROM reservations r
    LEFT JOIN properties p ON r.property_id = p.id
    ORDER BY r.check_in DESC
  `).all(),
  getReservationById: (id) => db.prepare("SELECT * FROM reservations WHERE id = ?").get(id),
  getReservationByGuestAndProp: (guestName, propertyId) => {
    return db.prepare(`
      SELECT * FROM reservations
      WHERE property_id = ? AND LOWER(guest_name) LIKE LOWER(?)
      ORDER BY check_in DESC LIMIT 1
    `).get(propertyId, `%${guestName}%`);
  },
  createReservation: (r) => {
    const stmt = db.prepare(`
      INSERT INTO reservations (
        id, stays_code, property_id, guest_name, guest_phone, guest_email,
        platform, check_in, check_out, num_guests, status, total_price, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      r.id, r.stays_code, r.property_id, r.guest_name, r.guest_phone, r.guest_email,
      r.platform, r.check_in, r.check_out, r.num_guests, r.status, r.total_price, r.created_at
    );
    return Database.getReservationById(r.id);
  },

  // Conversations & Messages
  getAllConversations: () => db.prepare(`
    SELECT c.*, p.name as property_name, p.code as property_code,
           r.stays_code, r.check_in, r.check_out
    FROM conversations c
    LEFT JOIN properties p ON c.property_id = p.id
    LEFT JOIN reservations r ON c.reservation_id = r.id
    ORDER BY c.last_message_at DESC
  `).all(),
  getConversationById: (id) => db.prepare(`
    SELECT c.*, p.name as property_name, p.code as property_code,
           p.wifi_ssid, p.wifi_password, p.door_code,
           r.stays_code, r.check_in, r.check_out, r.status as reservation_status
    FROM conversations c
    LEFT JOIN properties p ON c.property_id = p.id
    LEFT JOIN reservations r ON c.reservation_id = r.id
    WHERE c.id = ?
  `).get(id),
  getMessagesByConversationId: (convId) => db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `).all(convId),
  createConversation: (c) => {
    const stmt = db.prepare(`
      INSERT INTO conversations (
        id, property_id, reservation_id, guest_name, guest_phone, platform,
        guest_type, status, escalation_reason, escalation_severity, escalation_timestamp,
        human_assigned_to, last_message, last_message_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      c.id, c.property_id, c.reservation_id, c.guest_name, c.guest_phone, c.platform,
      c.guest_type, c.status, c.escalation_reason, c.escalation_severity, c.escalation_timestamp,
      c.human_assigned_to, c.last_message, c.last_message_at, c.created_at
    );
    return Database.getConversationById(c.id);
  },
  updateConversationStatus: (id, status, reason = null, severity = 'none') => {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE conversations
      SET status = ?, escalation_reason = ?, escalation_severity = ?,
          escalation_timestamp = CASE WHEN ? != 'none' THEN ? ELSE escalation_timestamp END
      WHERE id = ?
    `).run(status, reason, severity, severity, now, id);
    return Database.getConversationById(id);
  },
  updateConversationLastMessage: (id, messageText) => {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE conversations
      SET last_message = ?, last_message_at = ?
      WHERE id = ?
    `).run(messageText, now, id);
  },
  createMessage: (m) => {
    const stmt = db.prepare(`
      INSERT INTO messages (
        id, conversation_id, sender, content, created_at, ai_intent, ai_security_check, ai_reasoning
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      m.id, m.conversation_id, m.sender, m.content, m.created_at,
      m.ai_intent, m.ai_security_check, m.ai_reasoning
    );
    Database.updateConversationLastMessage(m.conversation_id, m.content);
    return m;
  },

  // Settings
  getSettings: () => {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    return settings;
  },
  updateSetting: (key, value) => {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  },

  // Analytics
  getAnalytics: () => {
    const totalConvs = db.prepare("SELECT COUNT(*) as count FROM conversations").get().count;
    const aiActive = db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status = 'ai_active'").get().count;
    const escalated = db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status = 'human_escalated'").get().count;
    const totalReservations = db.prepare("SELECT COUNT(*) as count FROM reservations").get().count;
    const totalMessages = db.prepare("SELECT COUNT(*) as count FROM messages").get().count;
    const aiMessages = db.prepare("SELECT COUNT(*) as count FROM messages WHERE sender = 'ai'").get().count;
    const totalProperties = db.prepare("SELECT COUNT(*) as count FROM properties").get().count;

    const resolutionRate = totalConvs > 0 ? Math.round(((totalConvs - escalated) / totalConvs) * 100) : 100;

    return {
      totalConversations: totalConvs,
      aiActiveConversations: aiActive,
      escalatedConversations: escalated,
      aiResolutionRate: resolutionRate,
      totalReservations,
      totalMessages,
      aiMessages,
      totalProperties,
      avgResponseTimeSeconds: 1.2
    };
  }
};

Database.init();

module.exports = Database;

