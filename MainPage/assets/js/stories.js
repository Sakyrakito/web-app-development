/** Истории: лента с подгрузкой, сортировка, голосование и жалобы. */
import { mode, category, feed, userPos, feedEl, feedEnd, current, whispers, tokens, toast } from './state.js';
import { FEED_PAGE } from './constants.js';
import { api, store } from './services.js';
import { locate } from './geolocation.js';
import { loadPlaces, schedulePlacesRefresh } from './places.js';

const { nextTick } = Vue;

// ───────────────────────── Лента ─────────────────────────

let observer = null;

export async function loadFeed(reset = false) {
  if (!reset && (feed.loading || feed.done)) return;
  const token = ++tokens.feed;
  if (reset) {
    feed.items = []; feed.offset = 0; feed.done = false;
    if (feedEl.value) feedEl.value.scrollTop = 0;
  }
  feed.loading = true;
  try {
    const params = { sort: feed.sort, category: category.value, offset: feed.offset, limit: FEED_PAGE };
    if (userPos.value) Object.assign(params, userPos.value);
    const res = await api('stories.php', { params });
    if (token !== tokens.feed) return;
    feed.items.push(...res.items);
    feed.offset += res.items.length;
    feed.done = !res.has_more;
  } catch (e) {
    if (token !== tokens.feed) return;
    toast(e.message, 'error');
    feed.done = true;
  } finally {
    if (token === tokens.feed) {
      feed.loading = false;
      feed.loaded = true;
      // Если после подгрузки «хвост» ленты всё ещё на экране — наблюдатель сработает снова.
      nextTick(() => {
        if (observer && feedEnd.value) { observer.unobserve(feedEnd.value); observer.observe(feedEnd.value); }
      });
    }
  }
}

export async function setSort(key) {
  if (key === feed.sort) return;
  if (key === 'near' && !userPos.value && !(await locate({ fly: false }))) return;
  feed.sort = key;
  store.set('feedSort', key);
  loadFeed(true);
}

/** Вызывать после монтирования, когда feedEl и feedEnd уже привязаны к DOM. */
export function initFeedObserver() {
  observer = new IntersectionObserver(entries => {
    if (mode.value === 'feed' && feed.loaded && entries.some(e => e.isIntersecting)) loadFeed();
  }, { root: feedEl.value, rootMargin: '600px 0px' });
  observer.observe(feedEnd.value);
}

// ───────────────────────── Голоса и жалобы ─────────────────────────

function patchStory(id, patch) {
  const lists = [feed.items, current.value?.stories || [], whispers.value];
  for (const list of lists) for (const s of list) if (s.id === id) Object.assign(s, patch);
}

function dropStory(id) {
  feed.items = feed.items.filter(s => s.id !== id);
  whispers.value = whispers.value.filter(s => s.id !== id);
  if (current.value) current.value.stories = current.value.stories.filter(s => s.id !== id);
}

export async function vote(story, value) {
  if (story.mine || story.busy) return;
  story.busy = true;
  try {
    const res = await api('vote.php', { method: 'POST', body: { story_id: story.id, value } });
    patchStory(story.id, { likes: res.likes, dislikes: res.dislikes, rating: res.rating, my_vote: res.my_vote });
    schedulePlacesRefresh();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    story.busy = false;
  }
}

export async function report(story) {
  try {
    const res = await api('report.php', { method: 'POST', body: { story_id: story.id } });
    patchStory(story.id, { reported: true });
    if (res.hidden) {
      dropStory(story.id);
      loadPlaces();
      toast('История скрыта и отправлена на модерацию.', 'ok');
    } else {
      toast('Жалоба принята. Спасибо, что бережёте город.', 'ok');
    }
  } catch (e) {
    if (e.status === 409) patchStory(story.id, { reported: true });
    toast(e.message, 'error');
  }
}
