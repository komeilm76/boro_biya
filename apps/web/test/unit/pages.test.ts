import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createVuetify } from 'vuetify';
import { VApp, VBtn, VMain } from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { createMemoryHistory } from 'vue-router';
import App from '../../src/App.vue';
import AdminArea from '../../src/pages/AdminArea.vue';
import NotFound from '../../src/pages/NotFound.vue';
import PublicLanding from '../../src/pages/PublicLanding.vue';
import SignInPlaceholder from '../../src/pages/SignInPlaceholder.vue';
import UserArea from '../../src/pages/UserArea.vue';
import { createAppRouter } from '../../src/router/index.js';
import { createAppI18n } from '../../src/i18n/index.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network not part of page rendering test')));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeVuetify() {
  return createVuetify({ components: { VApp, VBtn, VMain }, directives });
}

function mountPage(component: Parameters<typeof mount>[0], locale: 'en' | 'fa' = 'en') {
  setActivePinia(createPinia());
  const router = createAppRouter(createMemoryHistory());
  return mount(component, {
    global: { plugins: [router, createAppI18n(locale), makeVuetify()] },
  });
}

describe('namespace placeholder pages render catalogue text (GOV-63)', () => {
  it('renders the public landing page', () => {
    const wrapper = mountPage(PublicLanding);
    expect(wrapper.text()).toContain('Welcome to Boro biya');
    expect(wrapper.html()).toContain('href="/_auth/login"');
  });

  it('renders the working sign-in form with labelled password entry and recovery warning', () => {
    const wrapper = mountPage(SignInPlaceholder);
    expect(wrapper.text()).toContain('Sign in');
    expect(wrapper.text()).toContain('Security questions are a weak recovery method');
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').attributes('autocomplete')).toBe('current-password');
  });

  it('renders the user and admin placeholders', () => {
    expect(mountPage(UserArea).text()).toContain('Your area');
    expect(mountPage(AdminArea).text()).toContain('Administration');
  });

  it('renders every page through the Persian catalogue (ADR-017)', () => {
    expect(mountPage(NotFound, 'fa').text()).toContain('صفحه پیدا نشد');
    expect(mountPage(PublicLanding, 'fa').text()).toContain('به برو بیا خوش آمدید');
  });
});

describe('the application shell composes (Vuetify + router + i18n + Pinia)', () => {
  it('mounts App and resolves the default history router', async () => {
    setActivePinia(createPinia());
    const router = createAppRouter(); // default (web) history — the production composition
    const wrapper = mount(App, {
      global: { plugins: [router, createAppI18n(), makeVuetify()] },
    });
    await router.push('/_public');
    await router.isReady();
    // VApp rendered for real: its root element carries the v-application class (an unresolved
    // component would render the raw tag instead — this assertion tells the two apart).
    expect(wrapper.html()).toContain('v-application');
    expect(wrapper.html()).toContain('Welcome to Boro biya');
    expect(router.currentRoute.value.meta['namespace']).toBe('public');
  });
});
