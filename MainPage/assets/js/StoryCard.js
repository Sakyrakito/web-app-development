/** Карточка истории: текст, голосование, жалоба в два касания. */
import { CATS, NONE } from './constants.js';
import { timeAgo, fmtDate, fmtDistance } from './helpers.js';

const { ref, computed } = Vue;

export const StoryCard = {
  name: 'StoryCard',
  props: {
    story: { type: Object, required: true },
    compact: Boolean,
    featured: Boolean,
    showPlace: Boolean,
    ribbon: { type: String, default: '' },
  },
  emits: ['vote', 'report', 'locate'],
  setup(props, { emit }) {
    const expanded = ref(false);
    const confirming = ref(false);
    let confirmTimer = null;

    const cat = computed(() => CATS[props.story.category] || NONE);
    const isLong = computed(() => props.story.text.length > (props.featured ? 560 : props.compact ? 240 : 300));

    // Жалоба в два касания: первое — «Точно?», второе — отправка.
    function askReport() {
      if (props.story.reported) return;
      clearTimeout(confirmTimer);
      if (!confirming.value) {
        confirming.value = true;
        confirmTimer = setTimeout(() => { confirming.value = false; }, 3000);
        return;
      }
      confirming.value = false;
      emit('report', props.story);
    }

    function onCardClick() {
      if (!props.compact) emit('locate', props.story);
    }

    return { expanded, confirming, cat, isLong, askReport, onCardClick, timeAgo, fmtDate, fmtDistance };
  },
  template: `
    <article class="story"
             :class="{ 'story--compact': compact, 'story--featured': featured, 'story--link': !compact }"
             :style="{ '--cat': cat.color }" @click="onCardClick">
      <span v-if="ribbon" class="story__ribbon">{{ ribbon }}</span>
      <header class="story__head">
        <span class="stamp">{{ cat.glyph }} {{ cat.label }}</span>
        <time :datetime="story.created_at" :title="fmtDate(story.created_at)">{{ timeAgo(story.created_at) }}</time>
      </header>

      <p class="story__text" :class="{ 'is-clamped': isLong && !expanded }">{{ story.text }}</p>
      <button v-if="isLong" type="button" class="more" @click.stop="expanded = !expanded">
        {{ expanded ? 'Свернуть' : 'Читать дальше' }}
      </button>

      <footer class="story__foot">
        <button v-if="showPlace" type="button" class="place-chip" title="Показать на карте" @click.stop="$emit('locate', story)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-11.5a7 7 0 1 0-14 0C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
          <span>{{ story.place.address || 'Точка на карте' }}</span>
          <b v-if="story.distance != null">{{ fmtDistance(story.distance) }}</b>
        </button>
        <span v-else class="spacer"></span>

        <div class="votes" :class="{ 'is-mine': story.mine }" :title="story.mine ? 'Это ваша история' : ''" @click.stop>
          <button type="button" class="vote vote--up" :class="{ 'is-on': story.my_vote === 1 }"
                  :disabled="story.mine || story.busy" aria-label="Верю" title="Верю" @click="$emit('vote', story, 1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
          </button>
          <span class="score" :class="{ 'is-neg': story.rating < 0 }">{{ story.rating }}</span>
          <button type="button" class="vote vote--down" :class="{ 'is-on': story.my_vote === -1 }"
                  :disabled="story.mine || story.busy" aria-label="Не верю" title="Не верю" @click="$emit('vote', story, -1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>

        <button type="button" class="report" :class="{ 'is-confirm': confirming }" :disabled="story.reported"
                :title="story.reported ? 'Жалоба отправлена' : 'Пожаловаться'" :aria-label="story.reported ? 'Жалоба отправлена' : 'Пожаловаться'"
                @click.stop="askReport">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>
          <span v-if="confirming">Точно?</span>
        </button>
      </footer>
    </article>`,
};
