// HospedaAI - API Client
const API = {
  baseUrl: '',

  async request(endpoint, options = {}) {
    const res = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data.data;
  },

  // Analytics
  getAnalytics() {
    return this.request('/api/analytics');
  },

  // Properties
  getProperties() {
    return this.request('/api/properties');
  },
  getProperty(id) {
    return this.request(`/api/properties/${id}`);
  },
  saveProperty(prop) {
    if (prop.id && !prop.id.startsWith('new-')) {
      return this.request(`/api/properties/${prop.id}`, {
        method: 'PUT',
        body: JSON.stringify(prop)
      });
    } else {
      return this.request('/api/properties', {
        method: 'POST',
        body: JSON.stringify(prop)
      });
    }
  },
  deleteProperty(id) {
    return this.request(`/api/properties/${id}`, { method: 'DELETE' });
  },

  // Reservations (Stays PMS)
  getReservations() {
    return this.request('/api/reservations');
  },
  createReservation(res) {
    return this.request('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(res)
    });
  },
  getPmsChannels() {
    return this.request('/api/reservations/channels');
  },

  // Conversations & Chat
  getConversations(status = 'all', propertyId = 'all') {
    let url = `/api/chat/conversations?status=${encodeURIComponent(status)}&propertyId=${encodeURIComponent(propertyId)}`;
    return this.request(url);
  },
  getConversation(id) {
    return this.request(`/api/chat/conversations/${id}`);
  },
  sendMessage(conversationId, content, sender = 'host') {
    return this.request(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, sender })
    });
  },
  takeoverConversation(conversationId, managerName) {
    return this.request(`/api/chat/conversations/${conversationId}/takeover`, {
      method: 'POST',
      body: JSON.stringify({ managerName })
    });
  },
  reEnableAi(conversationId) {
    return this.request(`/api/chat/conversations/${conversationId}/re-enable-ai`, {
      method: 'POST'
    });
  },
  resolveConversation(conversationId) {
    return this.request(`/api/chat/conversations/${conversationId}/resolve`, {
      method: 'POST'
    });
  },

  // Simulator
  sendSimulatorMessage(payload) {
    return this.request('/api/chat/simulator/send', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Settings
  getSettings() {
    return this.request('/api/settings');
  },
  saveSettings(settings) {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }
};

