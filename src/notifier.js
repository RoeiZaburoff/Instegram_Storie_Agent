export class WhatsAppNotifier {
  constructor({ webhookUrl, authToken, dryRun = false } = {}) {
    this.webhookUrl = webhookUrl;
    this.authToken = authToken;
    this.dryRun = dryRun;
  }

  async send(chatId, message, extra = {}) {
    const payload = { chat_id: chatId, message, ...extra };
    if (this.dryRun || !this.webhookUrl) {
      console.log('[whatsapp:dry-run]', JSON.stringify(payload));
      return payload;
    }

    const headers = { 'content-type': 'application/json' };
    if (this.authToken) headers.authorization = `Bearer ${this.authToken}`;

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`WhatsApp notification failed: ${response.status} ${response.statusText}`);
    }

    return response.json().catch(() => payload);
  }

  success(chatId, summary) {
    return this.send(chatId, `✅ Success: Story uploaded successfully! ${new Date().toISOString()}\n${summary}`);
  }

  error(chatId, message, extra = {}) {
    return this.send(chatId, `⚠️ Error: ${message}`, extra);
  }

  security(chatId) {
    return this.send(chatId, '🔒 Security Check Required. Please provide the code.');
  }
}
