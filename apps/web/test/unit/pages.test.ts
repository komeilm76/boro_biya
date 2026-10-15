import { describe, expect, it } from 'vitest';
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

  it('renders the sign-in placeholder honestly (no authentication exists yet)', () => {
    const wrapper = mountPage(SignInPlaceholder);
    expect(wrapper.text()).toContain('Sign in');
    expect(wrapper.text()).toContain('Authentication is not part of this build');
    expect(wrapper.html()).not.toContain('<form');
    expect(wrapper.html()).not.toContain('type="password"');
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
