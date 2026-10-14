import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import { appRoutes } from './router/routes.js';

async function mountShell(path = '/_public/home') {
  const router = createRouter({ history: createMemoryHistory(), routes: appRoutes });
  await router.push(path);
  await router.isReady();
  return mount(App, { global: { plugins: [i18n, router] } });
}

afterEach(() => {
  i18n.global.locale.value = 'en';
});

describe('application shell', () => {
  it('renders the public landing page and route navigation', async () => {
    const wrapper = await mountShell();
    expect(wrapper.text()).toContain('A safer way to find your way');
    expect(wrapper.findAll('nav a')).toHaveLength(3);
    wrapper.unmount();
  });

  it('switches the shell direction with the selected locale', async () => {
    const wrapper = await mountShell();
    i18n.global.locale.value = 'fa';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.shell').attributes('dir')).toBe('rtl');
    wrapper.unmount();
  });

  it('keeps the login route a non-functional placeholder', async () => {
    const wrapper = await mountShell('/_auth/login');
    expect(wrapper.text()).toContain('Sign-in is not available in this foundation phase.');
    expect(wrapper.find('form').exists()).toBe(false);
    wrapper.unmount();
  });
});
