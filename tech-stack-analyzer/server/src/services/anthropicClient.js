import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '../config.js';

export const ANALYZE_MODEL = 'claude-sonnet-5';

export function getClient() {
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}
