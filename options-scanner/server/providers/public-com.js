/**
 * Public.com Provider — REMOVED
 *
 * This provider has been removed from the project.
 * All functionality falls back to Yahoo Finance or other providers.
 * If you need Public.com support, restore the original public-com.js
 * and set PUBLIC_COM_API_KEY / PUBLIC_API_KEY in .env.
 */

export default {
  name: 'public',
  async quote() { throw new Error('Public.com provider removed. Use ?provider=yahoo') },
  async marketSnapshot() { throw new Error('Public.com provider removed') },
  async optionsChain() { throw new Error('Public.com provider removed') },
  async chart() { throw new Error('Public.com provider removed') },
  async news() { return [] },
  async healthCheck() { return { ok: false, provider: 'public', error: 'Public.com provider removed' } },
}