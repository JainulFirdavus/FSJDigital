import assert from 'node:assert/strict';
import test from 'node:test';
import { applyChatSettings, chatReply } from '../src/chat.js';

test('chatbot uses its configured fallback when no answer matches', () => {
  const result = chatReply('Can you tell me something unrelated?', [], {
    chatFallback: 'Please contact our team.',
  });

  assert.equal(result.reply, 'Please contact our team.');
});

test('disabled lead capture replaces lead forms with a contact link', () => {
  const settings = { chatCollectLeads: false, chatFallback: 'Use our contact page.' };
  const result = applyChatSettings(chatReply('I want to talk to a person', [], settings), settings);

  assert.equal(result.lead, false);
  assert.equal(result.reply, 'Use our contact page.');
  assert.deepEqual(result.links, [{ label: 'Contact our team', href: '/#contact' }]);
});
