import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createAppI18n } from '../../src/i18n/index.js';
import { formatInstant } from '../../src/i18n/time.js';
import LocalizedTime from '../../src/components/LocalizedTime.vue';
const instant = '2026-10-17T23:45:00.123456789Z';
describe('locale/calendar/zone-aware account timestamps', () => {
  it('renders Gregorian/Latin and Solar Hijri/Persian instead of raw transport timestamps', () => {
    const en = formatInstant(instant, 'en', 'Asia/Tehran'),
      fa = formatInstant(instant, 'fa', 'Asia/Tehran');
    expect(en).toContain('2026');
    expect(en).toContain('03:15:00');
    expect(en).toContain('GMT+3:30');
    expect(fa).toContain('۱۴۰۵');
    expect(fa).not.toMatch(/[0-9]/);
    expect(en).not.toContain(instant);
    expect(fa).not.toContain(instant);
  });
  it('labels the zone so the repeated wall-clock hour across daylight-saving rollback is unambiguous', () => {
    const first = formatInstant('2026-10-25T00:30:00Z', 'en', 'Europe/Berlin'),
      second = formatInstant('2026-10-25T01:30:00Z', 'en', 'Europe/Berlin');
    expect(first).toContain('02:30:00');
    expect(second).toContain('02:30:00');
    expect(first).toContain('GMT+2');
    expect(second).toContain('GMT+1');
    expect(first).not.toBe(second);
  });
  it.each(['2026-02-30T00:00:00Z', '2026-10-17T00:00:00', '2026-10-17T00:00:00+00:00', 'not a time'])(
    'rejects malformed/non-UTC transport input %s',
    (value) => {
      expect(() => formatInstant(value, 'en')).toThrow();
    },
  );
  it.each(['en', 'fa'] as const)(
    'provides a labelled keyboard-operable precise UTC disclosure in %s and responds to locale changes',
    async (locale) => {
      const i18n = createAppI18n(locale),
        wrapper = mount(LocalizedTime, { props: { value: instant }, global: { plugins: [i18n] } });
      expect(wrapper.get('time').attributes('datetime')).toBe(instant);
      expect(wrapper.text()).not.toContain(instant);
      expect(wrapper.text()).not.toContain('time.');
      expect(wrapper.get('button').attributes('type')).toBe('button');
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('false');
      await wrapper.get('button').trigger('click');
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('true');
      expect(wrapper.get('code').text()).toBe(instant);
      expect(wrapper.get('code').attributes('dir')).toBe('ltr');
      const before = wrapper.get('time').text();
      i18n.global.locale.value = locale === 'en' ? 'fa' : 'en';
      await wrapper.vm.$nextTick();
      expect(wrapper.get('time').text()).not.toBe(before);
      await wrapper.setProps({ value: '2026-10-18T00:00:00Z' });
      expect(wrapper.find('code').exists()).toBe(false);
      wrapper.unmount();
    },
  );
  it('fails safely on invalid display input without reflecting it as an instant', () => {
    const wrapper = mount(LocalizedTime, {
      props: { value: '<private malformed value>' },
      global: { plugins: [createAppI18n()] },
    });
    expect(wrapper.find('time').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).toBe('Time unavailable');
    wrapper.unmount();
  });
});
