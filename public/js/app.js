// HospedaAI - Frontend Application Controller
const App = {
  state: {
    currentTab: 'dashboard',
    inboxFilter: 'all',
    properties: [],
    reservations: [],
    conversations: [],
    currentConversationId: null,
    analytics: null,
    settings: null,
    simPersona: 'interessado',
    simMessages: [],
    autoRefreshTimer: null
  },

  async init() {
    try {
      await this.refreshAllData();
      this.initSimulator();
      this.startPolling();
    } catch (err) {
      console.error('Erro na inicialização:', err);
      this.showToast('Erro ao carregar dados do servidor', 'error');
    }
    lucide.createIcons();
  },

  startPolling() {
    // Polling leve a cada 4 segundos para sincronia em tempo real
    if (this.state.autoRefreshTimer) clearInterval(this.state.autoRefreshTimer);
    this.state.autoRefreshTimer = setInterval(async () => {
      try {
        const convs = await API.getConversations(this.state.inboxFilter);
        this.state.conversations = convs;
        this.renderInboxConversations();
        
        // Se a conversa atual estiver aberta, atualiza mensagens
        if (this.state.currentConversationId && this.state.currentTab === 'inbox') {
          const freshConv = await API.getConversation(this.state.currentConversationId);
          this.renderChatMessages(freshConv.messages, false);
        }

        const analytics = await API.getAnalytics();
        this.state.analytics = analytics;
        this.renderDashboardStats();
      } catch (e) {
        // Silent poll error
      }
    }, 4000);
  },

  async refreshAllData() {
    const [props, resv, convs, stats, settings] = await Promise.all([
      API.getProperties(),
      API.getReservations(),
      API.getConversations('all'),
      API.getAnalytics(),
      API.getSettings()
    ]);

    this.state.properties = props;
    this.state.reservations = resv;
    this.state.conversations = convs;
    this.state.analytics = stats;
    this.state.settings = settings;

    this.renderDashboardStats();
    this.renderDashboardRecentConvs();
    this.renderInboxConversations();
    this.renderProperties();
    this.renderReservations();
    this.populatePropertySelects();

    // Auto-seleciona a primeira conversa se não houver selecionada
    if (!this.state.currentConversationId && this.state.conversations.length > 0) {
      this.selectConversation(this.state.conversations[0].id);
    }

    lucide.createIcons();
  },

  switchTab(tabName) {
    this.state.currentTab = tabName;

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('text-brand-600', 'bg-brand-50', 'font-semibold');
      btn.classList.add('text-slate-600', 'font-medium');
    });

    const activeBtn = document.getElementById(`nav-${tabName}`);
    if (activeBtn && tabName !== 'simulator') {
      activeBtn.classList.remove('text-slate-600', 'font-medium');
      activeBtn.classList.add('text-brand-600', 'bg-brand-50', 'font-semibold');
    }

    if (tabName === 'inbox') {
      this.renderInboxConversations();
      if (this.state.currentConversationId) {
        this.selectConversation(this.state.currentConversationId);
      }
    }

    lucide.createIcons();
  },

  // ==================== DASHBOARD RENDERERS ====================
  renderDashboardStats() {
    if (!this.state.analytics) return;
    const a = this.state.analytics;

    document.getElementById('stat-total-conversations').innerText = a.totalConversations;
    document.getElementById('stat-ai-rate').innerText = a.aiResolutionRate + '%';
    document.getElementById('stat-escalated').innerText = a.escalatedConversations;
    document.getElementById('stat-reservations').innerText = a.totalReservations;

    const badge = document.getElementById('nav-escalated-badge');
    if (badge) {
      if (a.escalatedConversations > 0) {
        badge.innerText = a.escalatedConversations;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  },

  renderDashboardRecentConvs() {
    const container = document.getElementById('dashboard-recent-convs');
    if (!container) return;

    if (this.state.conversations.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 py-4">Nenhum atendimento registrado.</p>`;
      return;
    }

    const recent = this.state.conversations.slice(0, 5);
    container.innerHTML = recent.map(c => {
      const isEscalated = c.status === 'human_escalated';
      const badgeClass = c.platform === 'Airbnb' ? 'badge-airbnb' : c.platform === 'Booking.com' ? 'badge-booking' : 'badge-expedia';

      return `
        <div class="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg cursor-pointer transition" onclick="App.openInInbox('${c.id}')">
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-lg ${badgeClass} text-[10px] font-bold flex items-center justify-center">${c.platform.slice(0, 2).toUpperCase()}</span>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-bold text-xs text-slate-900">${c.guest_name}</h4>
                <span class="text-[10px] px-1.5 py-0.2 rounded font-semibold ${c.guest_type === 'hospedado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                  ${c.guest_type === 'hospedado' ? 'Hóspede' : 'Interessado'}
                </span>
                ${isEscalated ? `<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i> Transbordo Humano</span>` : ''}
              </div>
              <p class="text-[11px] text-slate-500 truncate max-w-md">${c.last_message || 'Iniciou conversa'}</p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400">${c.property_code || ''}</span>
            <span class="block text-[11px] font-bold text-brand-600 hover:underline">Abrir Chat</span>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  },

  openInInbox(convId) {
    this.switchTab('inbox');
    this.selectConversation(convId);
  },

  // ==================== INBOX CONTROLLER ====================
  setInboxFilter(filter) {
    this.state.inboxFilter = filter;
    ['all', 'ai_active', 'human_escalated', 'closed'].forEach(f => {
      const btn = document.getElementById(`filter-btn-${f}`);
      if (btn) {
        if (f === filter) {
          btn.className = 'flex-1 py-1.5 rounded-md bg-white font-bold text-slate-900 shadow-sm transition';
        } else {
          btn.className = 'flex-1 py-1.5 rounded-md hover:text-slate-900 transition text-slate-600';
        }
      }
    });
    this.renderInboxConversations();
  },

  renderInboxConversations() {
    const listContainer = document.getElementById('inbox-conversations-list');
    if (!listContainer) return;

    let convs = [...this.state.conversations];
    if (this.state.inboxFilter !== 'all') {
      convs = convs.filter(c => c.status === this.state.inboxFilter);
    }

    document.getElementById('inbox-filter-count').innerText = `${convs.length} ${convs.length === 1 ? 'conversa' : 'conversas'}`;

    if (convs.length === 0) {
      listContainer.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Nenhum atendimento nesta categoria.</div>`;
      return;
    }

    listContainer.innerHTML = convs.map(c => {
      const isSelected = c.id === this.state.currentConversationId;
      const isEscalated = c.status === 'human_escalated';
      const badgeClass = c.platform === 'Airbnb' ? 'badge-airbnb' : c.platform === 'Booking.com' ? 'badge-booking' : 'badge-expedia';

      return `
        <div onclick="App.selectConversation('${c.id}')" class="p-3.5 cursor-pointer transition border-l-4 ${isSelected ? 'bg-white border-brand-500 shadow-sm' : isEscalated ? 'bg-rose-50/50 border-rose-500' : 'bg-transparent border-transparent hover:bg-slate-100/70'}">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-1.5">
              <span class="w-5 h-5 rounded ${badgeClass} text-[9px] font-bold flex items-center justify-center">${c.platform.slice(0, 2).toUpperCase()}</span>
              <span class="font-bold text-xs text-slate-900">${c.guest_name}</span>
            </div>
            <span class="text-[10px] text-slate-400">${c.property_code || ''}</span>
          </div>
          
          <p class="text-xs text-slate-600 truncate mb-1.5">${c.last_message || 'Nova conversa'}</p>

          <div class="flex items-center justify-between text-[10px]">
            <span class="px-1.5 py-0.5 rounded font-medium ${c.guest_type === 'hospedado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
              ${c.guest_type === 'hospedado' ? '🟢 Hóspede Confirmado' : '🟡 Interessado (Lead)'}
            </span>

            ${isEscalated
              ? `<span class="bg-rose-500 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5"><i data-lucide="alert-triangle" class="w-3 h-3"></i> Transbordo</span>`
              : c.status === 'closed'
              ? `<span class="text-slate-400 font-semibold">Finalizada</span>`
              : `<span class="text-brand-600 font-semibold flex items-center gap-0.5"><i data-lucide="bot" class="w-3 h-3"></i> IA Ativa</span>`
            }
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  },

  async selectConversation(convId) {
    this.state.currentConversationId = convId;
    this.renderInboxConversations();

    const conv = await API.getConversation(convId);
    if (!conv) return;

    // Header info
    document.getElementById('chat-guest-name').innerText = conv.guest_name;
    document.getElementById('chat-prop-name').innerText = `${conv.property_name || 'Imóvel'} (${conv.property_code || ''})`;
    document.getElementById('chat-avatar').innerText = conv.guest_name.slice(0, 2).toUpperCase();

    const badgeEl = document.getElementById('chat-channel-badge');
    badgeEl.innerText = conv.platform;
    badgeEl.className = `text-[10px] font-bold px-1.5 py-0.5 rounded ${conv.platform === 'Airbnb' ? 'badge-airbnb' : conv.platform === 'Booking.com' ? 'badge-booking' : 'badge-expedia'}`;

    // Host Actions
    const actionsContainer = document.getElementById('chat-actions');
    if (conv.status === 'human_escalated') {
      actionsContainer.innerHTML = `
        <button onclick="App.reEnableAi('${conv.id}')" class="bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition">
          <i data-lucide="bot" class="w-3.5 h-3.5"></i> Devolver para IA
        </button>
        <button onclick="App.resolveConversation('${conv.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition">
          <i data-lucide="check" class="w-3.5 h-3.5"></i> Finalizar
        </button>
      `;
    } else if (conv.status === 'ai_active') {
      actionsContainer.innerHTML = `
        <button onclick="App.takeoverConversation('${conv.id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i> Assumir Atendimento
        </button>
      `;
    } else {
      actionsContainer.innerHTML = `
        <button onclick="App.reEnableAi('${conv.id}')" class="bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Reabrir Atendimento
        </button>
      `;
    }

    // Render messages (force scroll to bottom on selection)
    this.renderChatMessages(conv.messages, true);

    // Inspector
    this.renderInspector(conv);
    lucide.createIcons();
  },

  renderChatMessages(messages = [], forceScroll = false) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Nenhuma mensagem nesta conversa.</div>`;
      return;
    }

    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

    container.innerHTML = messages.map(m => {
      const isGuest = m.sender === 'guest';
      const isAi = m.sender === 'ai';
      const isHost = m.sender === 'host';

      if (isGuest) {
        return `
          <div class="flex flex-col items-start space-y-1">
            <span class="text-[10px] text-slate-400 ml-1">Hóspede</span>
            <div class="max-w-md bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm text-xs text-slate-800 leading-relaxed bubble-in whitespace-pre-line">
              ${m.content}
            </div>
          </div>
        `;
      } else if (isAi) {
        return `
          <div class="flex flex-col items-end space-y-1">
            <div class="flex items-center gap-1 text-[10px] text-brand-600 font-bold mr-1">
              <i data-lucide="bot" class="w-3 h-3"></i> HospedaAI (Agente 24h)
              ${m.ai_security_check === 'blocked_sensitive_info' ? '<span class="bg-amber-100 text-amber-800 px-1 rounded text-[9px]">Bloqueio de Segurança</span>' : ''}
              ${m.ai_security_check === 'escalated' ? '<span class="bg-rose-100 text-rose-800 px-1 rounded text-[9px]">Alerta Transbordo</span>' : ''}
            </div>
            <div class="max-w-md bg-gradient-to-br from-brand-600 to-blue-600 text-white p-3.5 rounded-2xl rounded-tr-none shadow-md text-xs leading-relaxed bubble-in whitespace-pre-line">
              ${m.content}
            </div>
          </div>
        `;
      } else {
        return `
          <div class="flex flex-col items-end space-y-1">
            <span class="text-[10px] text-emerald-600 font-bold mr-1 flex items-center gap-1">
              <i data-lucide="user-check" class="w-3 h-3"></i> Gestor Humano
            </span>
            <div class="max-w-md bg-emerald-700 text-white p-3 rounded-2xl rounded-tr-none shadow-sm text-xs leading-relaxed bubble-in whitespace-pre-line">
              ${m.content}
            </div>
          </div>
        `;
      }
    }).join('');

    if (forceScroll || wasAtBottom) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 20);
    }
    lucide.createIcons();
  },

  renderInspector(conv) {
    // 1. Stays Status
    const staysBox = document.getElementById('inspect-stays-status');
    if (conv.guest_type === 'hospedado') {
      staysBox.innerHTML = `
        <div class="space-y-1">
          <span class="inline-block bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Reserva Confirmada</span>
          <p class="text-slate-700 font-medium mt-1">Código PMS: <span class="font-mono font-bold">${conv.stays_code || 'STY-2026-8821'}</span></p>
          <p class="text-slate-500">Período: ${conv.check_in || '02/11'} a ${conv.check_out || '07/11'}</p>
        </div>
      `;
    } else {
      staysBox.innerHTML = `
        <div class="space-y-1">
          <span class="inline-block bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">Interessado / Lead</span>
          <p class="text-slate-600 mt-1">Sem reserva ativa no Stays PMS. Usuário em fase de cotação ou dúvidas pré-reserva.</p>
        </div>
      `;
    }

    // 2. Barreira de Segurança
    const secBox = document.getElementById('inspect-security-status');
    const lastMsgWithSecurity = conv.messages ? conv.messages.slice().reverse().find(m => m.ai_security_check) : null;
    const secStatus = lastMsgWithSecurity ? lastMsgWithSecurity.ai_security_check : 'passed';

    if (secStatus === 'blocked_sensitive_info') {
      secBox.innerHTML = `
        <div class="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
          <p class="font-bold flex items-center gap-1"><i data-lucide="shield-alert" class="w-3.5 h-3.5 text-amber-600"></i> Bloqueio Preventivo Ativado</p>
          <p class="text-[11px]">Tentativa de obter senha de Wi-Fi ou fechadura bloqueada com sucesso.</p>
        </div>
      `;
    } else if (conv.guest_type === 'hospedado') {
      secBox.innerHTML = `
        <div class="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
          <p class="font-bold flex items-center gap-1"><i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-600"></i> Acesso Liberado pelo PMS</p>
          <p class="text-[11px] font-mono">Wi-Fi: ${conv.wifi_ssid || 'Ativo'} | Fechadura: ${conv.door_code || 'Autorizada'}</p>
        </div>
      `;
    } else {
      secBox.innerHTML = `<p class="text-slate-500">Nenhum dado protegido solicitado.</p>`;
    }

    // 3. Transbordo Humano
    const escBox = document.getElementById('inspect-escalation-status');
    if (conv.status === 'human_escalated') {
      escBox.innerHTML = `
        <div class="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
          <p class="font-bold flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-600"></i> Escalado para Gestor</p>
          <p class="text-[11px]">Motivo: ${conv.escalation_reason || 'Reclamação ou problema de manutenção'}</p>
          <p class="text-[10px] text-rose-700 uppercase font-bold">Severidade: ${conv.escalation_severity || 'URGENTE'}</p>
        </div>
      `;
    } else {
      escBox.innerHTML = `<p class="text-slate-500">Operando com agente de IA autônomo.</p>`;
    }

    // 4. Base Injetada
    const kbBox = document.getElementById('inspect-kb-summary');
    kbBox.innerHTML = `
      <div class="space-y-1">
        <p class="font-semibold text-slate-700">${conv.property_name || 'Imóvel'}</p>
        <p class="text-[11px] text-slate-500">Check-in: ${conv.check_in_time || '15:00'} | Check-out: ${conv.check_out_time || '11:00'}</p>
      </div>
    `;

    lucide.createIcons();
  },

  async handleHostSend(e) {
    e.preventDefault();
    const input = document.getElementById('host-msg-input');
    const content = input.value.trim();
    if (!content || !this.state.currentConversationId) return;

    input.value = '';
    try {
      await API.sendMessage(this.state.currentConversationId, content, 'host');
      const conv = await API.getConversation(this.state.currentConversationId);
      this.renderChatMessages(conv.messages, true);
      this.showToast('Mensagem enviada pelo gestor', 'success');
    } catch (err) {
      this.showToast('Erro ao enviar mensagem', 'error');
    }
  },

  async takeoverConversation(convId) {
    try {
      await API.takeoverConversation(convId, 'Elienaide Machado (Gestora)');
      await this.refreshAllData();
      await this.selectConversation(convId);
      this.showToast('Atendimento assumido pelo gestor humano', 'warning');
    } catch (err) {
      this.showToast('Erro ao assumir atendimento', 'error');
    }
  },

  async reEnableAi(convId) {
    try {
      await API.reEnableAi(convId);
      await this.refreshAllData();
      await this.selectConversation(convId);
      this.showToast('Atendimento devolvido ao HospedaAI 24h', 'success');
    } catch (err) {
      this.showToast('Erro ao reativar IA', 'error');
    }
  },

  async resolveConversation(convId) {
    try {
      await API.resolveConversation(convId);
      await this.refreshAllData();
      await this.selectConversation(convId);
      this.showToast('Atendimento finalizado com sucesso', 'success');
    } catch (err) {
      this.showToast('Erro ao finalizar atendimento', 'error');
    }
  },

  // ==================== PROPERTIES RENDERER ====================
  renderProperties() {
    const container = document.getElementById('properties-grid');
    if (!container) return;

    container.innerHTML = this.state.properties.map(p => {
      const amenities = Array.isArray(p.amenities) ? p.amenities : [];
      return `
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col">
          <div class="h-44 bg-slate-200 relative overflow-hidden">
            <img src="${p.image_url || 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'}" alt="${p.name}" class="w-full h-full object-cover" />
            <div class="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-lg">
              ${p.code}
            </div>
            <div class="absolute top-3 right-3 bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
              ${p.type}
            </div>
          </div>

          <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div>
              <h3 class="font-bold text-slate-900 text-base leading-snug">${p.name}</h3>
              <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i> ${p.address || ''}, ${p.city} - ${p.state}
              </p>

              <div class="grid grid-cols-3 gap-2 py-3 mt-2 border-y border-slate-100 text-center text-xs">
                <div>
                  <span class="block font-bold text-slate-800">${p.bedrooms}</span>
                  <span class="text-[10px] text-slate-400">Quartos</span>
                </div>
                <div>
                  <span class="block font-bold text-slate-800">${p.bathrooms}</span>
                  <span class="text-[10px] text-slate-400">Banheiros</span>
                </div>
                <div>
                  <span class="block font-bold text-slate-800">${p.max_guests}</span>
                  <span class="text-[10px] text-slate-400">Hóspedes</span>
                </div>
              </div>

              <!-- Protected info preview badge -->
              <div class="mt-3 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] space-y-1">
                <div class="flex items-center justify-between text-amber-900 font-bold">
                  <span class="flex items-center gap-1"><i data-lucide="shield" class="w-3 h-3 text-amber-600"></i> Dados Sensíveis Protegidos</span>
                </div>
                <p class="text-amber-800">Wi-Fi: <span class="font-mono font-medium">${p.wifi_ssid}</span> (Senha Oculta)</p>
                <p class="text-amber-800">Acesso: <span class="font-mono font-medium">${p.check_in_type}</span></p>
              </div>

              <!-- Top Amenities -->
              <div class="mt-3 flex flex-wrap gap-1">
                ${amenities.slice(0, 3).map(a => `<span class="bg-slate-100 text-slate-700 text-[10px] font-medium px-2 py-0.5 rounded">${a}</span>`).join('')}
              </div>
            </div>

            <div class="pt-2 flex items-center justify-between">
              <button onclick="App.openPropertyModal('${p.id}')" class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Editar Base da IA
              </button>
              <button onclick="App.simulateGuestOnProperty('${p.id}')" class="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition">
                <i data-lucide="play" class="w-3 h-3 text-brand-600"></i> Testar
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  },

  openPropertyModal(propId = null) {
    const modal = document.getElementById('modal-property');
    const form = document.getElementById('form-property');
    form.reset();

    if (propId) {
      const p = this.state.properties.find(x => x.id === propId);
      if (p) {
        document.getElementById('modal-prop-title').innerText = 'Editar Imóvel & Base de Conhecimento';
        document.getElementById('prop-id').value = p.id;
        document.getElementById('prop-name').value = p.name;
        document.getElementById('prop-code').value = p.code;
        document.getElementById('prop-city').value = p.city;
        document.getElementById('prop-state').value = p.state;
        document.getElementById('prop-type').value = p.type;
        document.getElementById('prop-bedrooms').value = p.bedrooms;
        document.getElementById('prop-bathrooms').value = p.bathrooms;
        document.getElementById('prop-max-guests').value = p.max_guests;
        document.getElementById('prop-checkin-time').value = p.check_in_time;
        document.getElementById('prop-checkout-time').value = p.check_out_time;
        document.getElementById('prop-quiet-hours').value = p.quiet_hours;
        document.getElementById('prop-wifi-ssid').value = p.wifi_ssid;
        document.getElementById('prop-wifi-password').value = p.wifi_password;
        document.getElementById('prop-door-code').value = p.door_code;
        document.getElementById('prop-amenities').value = (Array.isArray(p.amenities) ? p.amenities : []).join('; ');
        document.getElementById('prop-rules').value = (Array.isArray(p.rules) ? p.rules : []).join('; ');
        document.getElementById('prop-checkin-inst').value = p.check_in_instructions;
        document.getElementById('prop-checkout-inst').value = p.check_out_instructions;
      }
    } else {
      document.getElementById('modal-prop-title').innerText = 'Cadastrar Novo Imóvel';
      document.getElementById('prop-id').value = '';
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
  },

  closePropertyModal() {
    document.getElementById('modal-property').classList.add('hidden');
  },

  async handleSaveProperty(e) {
    e.preventDefault();
    const id = document.getElementById('prop-id').value;
    const amenitiesText = document.getElementById('prop-amenities').value;
    const rulesText = document.getElementById('prop-rules').value;

    const propData = {
      id: id || undefined,
      name: document.getElementById('prop-name').value,
      code: document.getElementById('prop-code').value,
      city: document.getElementById('prop-city').value,
      state: document.getElementById('prop-state').value,
      type: document.getElementById('prop-type').value,
      bedrooms: parseInt(document.getElementById('prop-bedrooms').value, 10),
      bathrooms: parseInt(document.getElementById('prop-bathrooms').value, 10),
      max_guests: parseInt(document.getElementById('prop-max-guests').value, 10),
      check_in_time: document.getElementById('prop-checkin-time').value,
      check_out_time: document.getElementById('prop-checkout-time').value,
      quiet_hours: document.getElementById('prop-quiet-hours').value,
      wifi_ssid: document.getElementById('prop-wifi-ssid').value,
      wifi_password: document.getElementById('prop-wifi-password').value,
      door_code: document.getElementById('prop-door-code').value,
      amenities: amenitiesText.split(';').map(x => x.trim()).filter(Boolean),
      rules: rulesText.split(';').map(x => x.trim()).filter(Boolean),
      check_in_instructions: document.getElementById('prop-checkin-inst').value,
      check_out_instructions: document.getElementById('prop-checkout-inst').value
    };

    try {
      await API.saveProperty(propData);
      this.closePropertyModal();
      await this.refreshAllData();
      this.showToast('Base de conhecimento do imóvel atualizada com sucesso!', 'success');
    } catch (err) {
      this.showToast('Erro ao salvar imóvel: ' + err.message, 'error');
    }
  },

  simulateGuestOnProperty(propId) {
    this.switchTab('simulator');
    const select = document.getElementById('sim-property-select');
    if (select) select.value = propId;
  },

  // ==================== RESERVATIONS RENDERER ====================
  renderReservations() {
    const tbody = document.getElementById('reservations-table-body');
    if (!tbody) return;

    if (this.state.reservations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-xs text-slate-400">Nenhuma reserva cadastrada no PMS Stays.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.state.reservations.map(r => {
      const badgeClass = r.platform === 'Airbnb' ? 'badge-airbnb' : r.platform === 'Booking.com' ? 'badge-booking' : 'badge-expedia';
      const isCheckedIn = r.status === 'checked_in';

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3.5 font-mono font-bold text-slate-900">${r.stays_code}</td>
          <td class="p-3.5 font-bold text-slate-800">${r.guest_name}</td>
          <td class="p-3.5">
            <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded ${badgeClass}">${r.platform}</span>
          </td>
          <td class="p-3.5 text-slate-600">${r.property_name || ''}</td>
          <td class="p-3.5 text-slate-600">${r.check_in} até ${r.check_out}</td>
          <td class="p-3.5 text-slate-600">${r.num_guests} hóspedes</td>
          <td class="p-3.5">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isCheckedIn ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
              ${isCheckedIn ? 'Checked-In (No Imóvel)' : 'Confirmada'}
            </span>
          </td>
          <td class="p-3.5 text-right font-bold text-slate-900">R$ ${r.total_price ? r.total_price.toFixed(2) : '0.00'}</td>
        </tr>
      `;
    }).join('');
  },

  openReservationModal() {
    const modal = document.getElementById('modal-reservation');
    const select = document.getElementById('res-property-id');
    select.innerHTML = this.state.properties.map(p => `<option value="${p.id}">${p.name} (${p.code})</option>`).join('');

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
    document.getElementById('res-checkin').value = today;
    document.getElementById('res-checkout').value = nextWeek;

    modal.classList.remove('hidden');
    lucide.createIcons();
  },

  closeReservationModal() {
    document.getElementById('modal-reservation').classList.add('hidden');
  },

  async handleSaveReservation(e) {
    e.preventDefault();
    const payload = {
      guest_name: document.getElementById('res-guest-name').value,
      property_id: document.getElementById('res-property-id').value,
      platform: document.getElementById('res-platform').value,
      status: document.getElementById('res-status').value,
      check_in: document.getElementById('res-checkin').value,
      check_out: document.getElementById('res-checkout').value,
      num_guests: 2,
      total_price: 1850.00
    };

    try {
      await API.createReservation(payload);
      this.closeReservationModal();
      await this.refreshAllData();
      this.showToast('Nova reserva sincronizada com sucesso no Stays PMS!', 'success');
    } catch (err) {
      this.showToast('Erro ao criar reserva: ' + err.message, 'error');
    }
  },

  populatePropertySelects() {
    const simSelect = document.getElementById('sim-property-select');
    if (simSelect) {
      simSelect.innerHTML = this.state.properties.map(p => `<option value="${p.id}">${p.name} (${p.city})</option>`).join('');
    }
  },

  // ==================== SIMULATOR CONTROLLER ====================
  initSimulator() {
    this.loadSimulatorPersona('interessado');
  },

  loadSimulatorPersona(type) {
    this.state.simPersona = type;
    const flow = document.getElementById('sim-messages-flow');
    const roleBadge = document.getElementById('sim-badge-role');
    const channelBadge = document.getElementById('sim-channel-badge');

    if (type === 'interessado') {
      document.getElementById('sim-guest-name').value = 'Carlos Silva';
      document.getElementById('sim-type-select').value = 'interessado';
      document.getElementById('sim-platform-select').value = 'Booking.com';
      channelBadge.className = 'badge-booking text-[9px] px-1.5 py-0.2 rounded font-bold';
      channelBadge.innerText = 'Booking.com';
      roleBadge.className = 'text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full';
      roleBadge.innerText = 'Interessado (Pré-reserva)';

      flow.innerHTML = `
        <div class="text-center text-[11px] text-slate-500 py-2">
          🟡 Simulando Interessado (sem reserva confirmada no Stays PMS)
        </div>
        <div class="flex flex-col items-start space-y-1">
          <div class="max-w-[85%] bg-white border border-slate-200 p-2.5 rounded-2xl rounded-tl-none shadow-sm text-xs text-slate-800 leading-relaxed bubble-in">
            Olá! Estou interessado no imóvel. Tem vaga de garagem e você já pode me passar a senha do Wi-Fi para eu testar?
          </div>
        </div>
        <div class="flex flex-col items-end space-y-1">
          <div class="max-w-[85%] bg-gradient-to-br from-brand-600 to-blue-600 text-white p-2.5 rounded-2xl rounded-tr-none shadow-sm text-xs leading-relaxed bubble-in">
            Olá, Carlos! 😊 Temos internet Wi-Fi de alta velocidade e vaga de garagem no local. Por normas de segurança do condomínio e dos hóspedes atuais, a senha da rede é liberada no dia do check-in após a confirmação da sua reserva. Posso ajudar com mais dúvidas?
          </div>
        </div>
      `;
    } else if (type === 'hospedado') {
      document.getElementById('sim-guest-name').value = 'Mariana Costa';
      document.getElementById('sim-type-select').value = 'hospedado';
      document.getElementById('sim-platform-select').value = 'Airbnb';
      channelBadge.className = 'badge-airbnb text-[9px] px-1.5 py-0.2 rounded font-bold';
      channelBadge.innerText = 'Airbnb';
      roleBadge.className = 'text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full';
      roleBadge.innerText = 'Hóspede Confirmado';

      flow.innerHTML = `
        <div class="text-center text-[11px] text-slate-500 py-2">
          🟢 Simulando Hóspede Confirmada (#STY-2026-8821 no Stays PMS)
        </div>
        <div class="flex flex-col items-start space-y-1">
          <div class="max-w-[85%] bg-white border border-slate-200 p-2.5 rounded-2xl rounded-tl-none shadow-sm text-xs text-slate-800 leading-relaxed bubble-in">
            Olá! Acabamos de chegar no apartamento. Qual a senha do Wi-Fi e o código da porta?
          </div>
        </div>
        <div class="flex flex-col items-end space-y-1">
          <div class="max-w-[85%] bg-gradient-to-br from-brand-600 to-blue-600 text-white p-2.5 rounded-2xl rounded-tr-none shadow-sm text-xs leading-relaxed bubble-in">
            Olá, Mariana! Seja bem-vinda! 🌊✨ Como sua reserva está confirmada, aqui estão os dados de acesso:
            <br><br>
            📶 <b>Rede:</b> Copacabana_Beach_5G<br>
            🔑 <b>Senha:</b> CopaSol#2026!<br>
            🚪 <b>Código da Fechadura:</b> 4598#
          </div>
        </div>
      `;
    } else if (type === 'emergencia') {
      document.getElementById('sim-guest-name').value = 'Roberto Souza';
      document.getElementById('sim-type-select').value = 'hospedado';
      document.getElementById('sim-platform-select').value = 'Expedia';
      channelBadge.className = 'badge-expedia text-[9px] px-1.5 py-0.2 rounded font-bold text-slate-900';
      channelBadge.innerText = 'Expedia';
      roleBadge.className = 'text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full';
      roleBadge.innerText = '🚨 Emergência';

      flow.innerHTML = `
        <div class="text-center text-[11px] text-rose-600 font-bold py-2">
          🚨 Simulando Gatilho de Transbordo Humano Crítico
        </div>
        <div class="flex flex-col items-start space-y-1">
          <div class="max-w-[85%] bg-white border border-rose-300 p-2.5 rounded-2xl rounded-tl-none shadow-sm text-xs text-rose-900 leading-relaxed bubble-in">
            Urgente! O cano do banheiro estourou e está vazando água pelo chão do apartamento!
          </div>
        </div>
        <div class="flex flex-col items-end space-y-1">
          <div class="max-w-[85%] bg-rose-600 text-white p-2.5 rounded-2xl rounded-tr-none shadow-sm text-xs leading-relaxed bubble-in">
            Atenção, Roberto! 🚨 Compreendo perfeitamente a urgência. Acabei de acionar nosso gestor de plantão imediatamente com PRIORIDADE MÁXIMA. Por favor, feche o registro geral de água ao lado do banheiro. Nossa equipe responderá em instantes!
          </div>
        </div>
      `;
    }

    flow.scrollTop = flow.scrollHeight;
    lucide.createIcons();
  },

  setQuickPrompt(text) {
    const input = document.getElementById('sim-input-text');
    input.value = text;
    input.focus();
  },

  async handleSimulatorSend(e) {
    e.preventDefault();
    const input = document.getElementById('sim-input-text');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    const flow = document.getElementById('sim-messages-flow');
    const propertyId = document.getElementById('sim-property-select').value;
    const guestName = document.getElementById('sim-guest-name').value;
    const platform = document.getElementById('sim-platform-select').value;
    const guestType = document.getElementById('sim-type-select').value;

    // Render guest bubble instantly
    flow.innerHTML += `
      <div class="flex flex-col items-start space-y-1">
        <div class="max-w-[85%] bg-white border border-slate-200 p-2.5 rounded-2xl rounded-tl-none shadow-sm text-xs text-slate-800 leading-relaxed bubble-in whitespace-pre-line">
          ${text}
        </div>
      </div>
    `;
    flow.scrollTop = flow.scrollHeight;

    // Typing placeholder
    const typingId = 'typing-' + Date.now();
    flow.innerHTML += `
      <div id="${typingId}" class="flex flex-col items-end space-y-1">
        <div class="bg-brand-100 text-brand-700 px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-brand-500 beacon-pulse"></span> HospedaAI analisando intenção e segurança...
        </div>
      </div>
    `;
    flow.scrollTop = flow.scrollHeight;

    try {
      const result = await API.sendSimulatorMessage({
        propertyId,
        guestName,
        platform,
        guestType,
        messageText: text
      });

      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (result && result.aiResponse) {
        const isEscalated = result.escalated;
        const bg = isEscalated ? 'bg-rose-600' : 'bg-gradient-to-br from-brand-600 to-blue-600';

        flow.innerHTML += `
          <div class="flex flex-col items-end space-y-1">
            <div class="flex items-center gap-1 text-[9px] text-slate-500 font-bold mr-1">
              ${result.securityCheck === 'blocked_sensitive_info' ? '<span class="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">🔒 Wi-Fi Bloqueado (Interessado)</span>' : ''}
              ${result.securityCheck === 'escalated' ? '<span class="bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded">🚨 Transbordo Humano Acionado</span>' : ''}
            </div>
            <div class="max-w-[85%] ${bg} text-white p-3 rounded-2xl rounded-tr-none shadow-md text-xs leading-relaxed bubble-in whitespace-pre-line">
              ${result.aiResponse.content}
            </div>
          </div>
        `;
        flow.scrollTop = flow.scrollHeight;

        if (isEscalated) {
          this.showToast('🚨 Alerta Crítico: Transbordo para o gestor emitido no painel!', 'warning');
        } else {
          this.showToast('Resposta gerada pelo HospedaAI', 'success');
        }
      }

      // Atualiza a lista de conversas em segundo plano
      await this.refreshAllData();
    } catch (err) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      this.showToast('Erro ao processar mensagem no simulador', 'error');
    }
  },

  // ==================== SETTINGS MODAL ====================
  openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (this.state.settings) {
      document.getElementById('setting-ai-provider').value = this.state.settings.ai_provider || 'hybrid_intelligent';
      document.getElementById('setting-tone').value = this.state.settings.tone_of_voice || 'cordial_profissional';
      document.getElementById('setting-gemini-key').value = this.state.settings.gemini_api_key || '';
    }
    modal.classList.remove('hidden');
    lucide.createIcons();
  },

  closeSettingsModal() {
    document.getElementById('modal-settings').classList.add('hidden');
  },

  async handleSaveSettings(e) {
    e.preventDefault();
    const payload = {
      ai_provider: document.getElementById('setting-ai-provider').value,
      tone_of_voice: document.getElementById('setting-tone').value,
      gemini_api_key: document.getElementById('setting-gemini-key').value.trim()
    };

    try {
      await API.saveSettings(payload);
      this.closeSettingsModal();
      this.state.settings = await API.getSettings();
      this.showToast('Configurações de IA atualizadas com sucesso!', 'success');
    } catch (err) {
      this.showToast('Erro ao salvar configurações', 'error');
    }
  },

  // ==================== TOAST NOTIFICATION ====================
  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    const iconEl = document.getElementById('toast-icon');

    msgEl.innerText = message;
    if (type === 'error') {
      iconEl.setAttribute('data-lucide', 'alert-circle');
      iconEl.className = 'w-4 h-4 text-rose-400';
    } else if (type === 'warning') {
      iconEl.setAttribute('data-lucide', 'alert-triangle');
      iconEl.className = 'w-4 h-4 text-amber-400';
    } else {
      iconEl.setAttribute('data-lucide', 'check-circle');
      iconEl.className = 'w-4 h-4 text-emerald-400';
    }

    toast.classList.remove('translate-y-16', 'opacity-0');
    lucide.createIcons();

    setTimeout(() => {
      toast.classList.add('translate-y-16', 'opacity-0');
    }, 3500);
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());

