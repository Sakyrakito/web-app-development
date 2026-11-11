/** Admin panel: login, moderation queue, full story list, report threshold. */
import { api } from './services.js';
import { CATS, NONE } from './constants.js';
import { plural, signed, fmtDate, fmtCoords, catColor } from './helpers.js';

const { createApp, reactive, ref, watch, onMounted } = Vue;

createApp({
  setup() {
    const auth = reactive({ checked: false, configured: false, admin: false });
    const bootError = ref('');
    const loginForm = reactive({ login: '', password: '', error: '', busy: false });
    const threshold = reactive({ value: null, saved: null, busy: false, message: '' });
    const tab = ref('hidden');
    const query = ref('');
    const list = reactive({ items: [], hasMore: false, hiddenTotal: 0, loading: false, error: '' });
    const busyId = ref(null);
    const armed = ref(null);   // id of the story whose delete button awaits a second tap
    let armTimer = null, listToken = 0, searchTimer = null;

    // Every endpoint answers 401 once the admin session has expired.
    async function call(path, opts) {
      try {
        return await api(path, opts);
      } catch (e) {
        if (e.status === 401) auth.admin = false;
        throw e;
      }
    }

    async function login() {
      loginForm.busy = true;
      loginForm.error = '';
      try {
        await api('admin-session.php', { method: 'POST', body: { login: loginForm.login, password: loginForm.password } });
        loginForm.password = '';
        auth.admin = true;
      } catch (e) {
        const wait = e.data?.retry_after;
        loginForm.error = wait ? `${e.message} Осталось ${Math.ceil(wait / 60)} мин.` : e.message;
      } finally {
        loginForm.busy = false;
      }
    }

    async function logout() {
      try {
        await api('admin-session.php', { method: 'DELETE' });
        auth.admin = false;
      } catch (e) {
        list.error = e.message;
      }
    }

    async function loadList(reset = true) {
      const token = ++listToken;
      list.loading = true;
      list.error = '';
      try {
        const data = await call('admin-stories.php', {
          params: { status: tab.value, q: query.value.trim(), offset: reset ? 0 : list.items.length },
        });
        if (token !== listToken) return;
        list.items = reset ? data.items : [...list.items, ...data.items];
        list.hasMore = data.has_more;
        list.hiddenTotal = data.hidden_total;
      } catch (e) {
        if (token === listToken) list.error = e.message;
      } finally {
        if (token === listToken) list.loading = false;
      }
    }

    async function loadThreshold() {
      try {
        threshold.value = threshold.saved = (await call('admin-settings.php')).report_threshold;
      } catch (e) {
        threshold.message = e.message;
      }
    }

    async function saveThreshold() {
      threshold.busy = true;
      try {
        const data = await call('admin-settings.php', { method: 'POST', body: { report_threshold: threshold.value } });
        threshold.value = threshold.saved = data.report_threshold;
        threshold.message = 'Сохранено';
      } catch (e) {
        threshold.message = e.message;
      } finally {
        threshold.busy = false;
      }
    }

    async function act(story, action) {
      if (action === 'delete' && armed.value !== story.id) {
        armed.value = story.id;
        clearTimeout(armTimer);
        armTimer = setTimeout(() => { armed.value = null; }, 4000);
        return;
      }
      armed.value = null;
      busyId.value = story.id;
      list.error = '';
      try {
        await call('admin-stories.php', { method: 'POST', body: { id: story.id, action } });
        const wasHidden = story.hidden;
        if (action === 'delete' || (action === 'restore' && tab.value === 'hidden')) {
          list.items = list.items.filter(s => s.id !== story.id);
        } else {
          story.hidden = action === 'hide';
          if (action === 'restore') story.reports = 0;
        }
        list.hiddenTotal += (action === 'hide' ? 1 : 0) - (wasHidden ? 1 : 0);
      } catch (e) {
        list.error = e.message;
      } finally {
        busyId.value = null;
      }
    }

    watch(tab, () => loadList());
    watch(query, () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadList, 300);
    });
    watch(() => auth.admin, admin => {
      if (!admin) return;
      loadList();
      loadThreshold();
    });

    onMounted(async () => {
      try {
        Object.assign(auth, await api('admin-session.php'), { checked: true });
      } catch (e) {
        bootError.value = e.message;
      }
    });

    return {
      auth, bootError, loginForm, threshold, tab, query, list, busyId, armed,
      login, logout, loadList, saveThreshold, act,
      plural, signed, fmtDate, fmtCoords, catColor,
      catLabel: key => (CATS[key] || NONE).label,
    };
  },
}).mount('#admin');
