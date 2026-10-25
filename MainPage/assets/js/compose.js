/** Сценарий публикации истории: отмена, отправка, «добавить рядом со мной». */
import { userPos, draft, feed, draftText, draftOk, draftIssue, draftLen, toast } from './state.js';
import { TEXT_MIN, TEXT_MAX } from './constants.js';
import { api } from './services.js';
import { fmtClock } from './helpers.js';
import { locate } from './geolocation.js';
import { startCompose, leaveDraft } from './draft.js';
import { openPlace, closePanel, loadPlaces, loadWhispers, flyToPoint } from './places.js';
import { loadFeed } from './stories.js';

export function cancelDraft() {
  const backTo = draft.place_id;
  leaveDraft();
  if (backTo) openPlace(backTo, { fly: false });
  else closePanel();
}

export async function submitDraft() {
  if (draft.sending) return;
  if (!draftOk.value) {
    draft.error = draftIssue.value || (draftLen.value < TEXT_MIN
      ? `Минимум ${TEXT_MIN} символов — расскажите чуть подробнее.`
      : `Максимум ${TEXT_MAX} символов.`);
    draftText.value?.focus();
    return;
  }
  draft.sending = true;
  draft.error = '';
  try {
    const story = await api('stories.php', {
      method: 'POST',
      body: {
        text: draft.text.trim(),
        category: draft.category,
        lat: draft.lat,
        lng: draft.lng,
        address: draft.address || null,
        place_id: draft.place_id,
      },
    });
    draft.text = '';
    draft.category = null;
    leaveDraft();
    toast('Легенда записана. Город запомнит.', 'ok');
    await loadPlaces();
    openPlace(story.place.id);
    loadWhispers();
    if (feed.loaded) loadFeed(true);
  } catch (e) {
    draft.error = e.status === 429 && e.data?.retry_after
      ? `Подождите ${fmtClock(e.data.retry_after)} перед следующей публикацией.`
      : e.message;
  } finally {
    draft.sending = false;
  }
}

export async function addNearby() {
  if (!userPos.value && !(await locate({ fly: false }))) {
    toast('Нажмите на карту в нужном месте — история привяжется к нему.', 'info');
    return;
  }
  startCompose({ lat: userPos.value.lat, lng: userPos.value.lng });
  flyToPoint(userPos.value.lat, userPos.value.lng, 17);
}
