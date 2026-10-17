import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Challenge from '../../src/components/AuthChallenge.vue';
import { createAppI18n } from '../../src/i18n/index.js';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router/index.js';
import SignIn from '../../src/pages/SignInPlaceholder.vue';
import Register from '../../src/pages/AuthRegister.vue';
import Recover from '../../src/pages/AuthRecover.vue';
import Setup from '../../src/pages/AuthSetup.vue';
import { authClient } from '../../src/auth-client.js';
import { solveChallenge, workMatches } from '../../src/challenge-work.js';
const token = 'N'.repeat(43),
  grant = 'G'.repeat(43);
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
}
beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(authClient, 'csrf').mockResolvedValue({ csrfToken: 'C'.repeat(43) });
  vi.spyOn(authClient, 'challenge').mockResolvedValue({
    required: true,
    token,
    bits: 12,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  });
  vi.spyOn(authClient, 'verifyChallenge').mockImplementation(() =>
    Promise.resolve({
      grant,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function page(locale: 'en' | 'fa' = 'en') {
  return mount(Challenge, {
    props: { enabled: true, purpose: 'login', modelValue: '' },
    global: { plugins: [createAppI18n(locale)] },
  });
}
async function start(wrapper: ReturnType<typeof page>) {
  await wrapper.get('button').trigger('click');
  await flushPromises();
  return FakeWorker.instances.at(-1)!;
}
describe('accessible explicit computational challenge control', () => {
  it.each(['en', 'fa'] as const)(
    'requires explicit action and localizes status/buttons in %s without submitting credentials',
    async (locale) => {
      const wrapper = page(locale);
      expect(authClient.challenge).not.toHaveBeenCalled();
      expect(wrapper.text()).not.toContain('challenge.');
      expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite');
      const worker = await start(wrapper);
      expect(wrapper.get('section').attributes('aria-busy')).toBe('true');
      expect(worker.postMessage).toHaveBeenCalledWith({ token, bits: 12 });
      worker.onmessage?.({ data: { counter: 17 } });
      await flushPromises();
      expect(authClient.verifyChallenge).toHaveBeenCalledWith('login', token, 17, 'C'.repeat(43));
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([grant]);
      expect(worker.terminate).toHaveBeenCalled();
      expect(wrapper.get('section').attributes('aria-busy')).toBe('false');
      wrapper.unmount();
    },
  );
  it('handles a low-risk result without creating a worker or proof', async () => {
    vi.mocked(authClient.challenge).mockResolvedValue({ required: false });
    const wrapper = page();
    await start(wrapper);
    expect(FakeWorker.instances).toHaveLength(0);
    expect(authClient.verifyChallenge).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
  it('cancels work and rejects stale results without verification or a failure alert', async () => {
    const wrapper = page();
    const worker = await start(wrapper);
    await wrapper.findAll('button')[1]!.trigger('click');
    worker.onmessage?.({ data: { counter: 1 } });
    await flushPromises();
    expect(worker.terminate).toHaveBeenCalled();
    expect(authClient.verifyChallenge).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('discards a late HTTP result after unmount', async () => {
    let complete!: (value: { required: false }) => void;
    vi.mocked(authClient.challenge).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const wrapper = page();
    await start(wrapper);
    wrapper.unmount();
    complete({ required: false });
    await flushPromises();
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it('discards a late proof after cancellation and terminates an unmounted worker', async () => {
    let complete!: (value: { grant: string; expiresAt: string }) => void;
    vi.mocked(authClient.verifyChallenge).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const wrapper = page();
    const worker = await start(wrapper);
    worker.onmessage?.({ data: { counter: 1 } });
    await flushPromises();
    await wrapper.findAll('button')[1]!.trigger('click');
    complete({ grant, expiresAt: new Date(Date.now() + 60000).toISOString() });
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.flat() ?? []).not.toContain(grant);
    await start(wrapper);
    const pending = FakeWorker.instances.at(-1)!;
    wrapper.unmount();
    await flushPromises();
    expect(pending.terminate).toHaveBeenCalled();
  });
  it.each([null, {}, { counter: -1 }, { counter: 0.5 }, { counter: 0x100000000 }, { failed: true }])(
    'fails closed on malformed worker messages %j',
    async (data) => {
      const wrapper = page();
      const worker = await start(wrapper);
      worker.onmessage?.({ data });
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      expect(authClient.verifyChallenge).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );
  it('reports worker errors and can retry explicitly', async () => {
    const wrapper = page();
    const worker = await start(wrapper);
    worker.onerror?.();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await start(wrapper);
    expect(FakeWorker.instances).toHaveLength(2);
    wrapper.unmount();
  });
  it('cancels pending work when purpose changes instead of verifying a nonce for a different flow', async () => {
    const wrapper = page();
    const worker = await start(wrapper);
    await wrapper.setProps({ purpose: 'register' });
    worker.onmessage?.({ data: { counter: 1 } });
    await flushPromises();
    expect(worker.terminate).toHaveBeenCalled();
    expect(authClient.verifyChallenge).not.toHaveBeenCalled();
    expect(wrapper.emitted('working')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
  it('terminates an unresponsive worker after 45 seconds and does not verify its late result', async () => {
    vi.useFakeTimers();
    const wrapper = page();
    const worker = await start(wrapper);
    await vi.advanceTimersByTimeAsync(45000);
    expect(worker.terminate).toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    worker.onmessage?.({ data: { counter: 1 } });
    await flushPromises();
    expect(authClient.verifyChallenge).not.toHaveBeenCalled();
    expect(wrapper.emitted('working')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
  it('does not display an already-expired grant as ready', async () => {
    vi.mocked(authClient.verifyChallenge).mockResolvedValue({
      grant,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const wrapper = page();
    const worker = await start(wrapper);
    worker.onmessage?.({ data: { counter: 1 } });
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.flat() ?? []).not.toContain(grant);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('clears an expired proof after at most sixty seconds', async () => {
    vi.useFakeTimers();
    const wrapper = page();
    const worker = await start(wrapper);
    worker.onmessage?.({ data: { counter: 0 } });
    await flushPromises();
    await wrapper.setProps({ modelValue: grant });
    await vi.advanceTimersByTimeAsync(60000);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    wrapper.unmount();
  });
  it('clears proof and terminates work when policy turns off; disabled controls cannot start', async () => {
    const wrapper = page();
    await wrapper.setProps({ disabled: true });
    await wrapper.get('button').trigger('click');
    expect(authClient.csrf).not.toHaveBeenCalled();
    await wrapper.setProps({ disabled: false });
    const worker = await start(wrapper);
    await wrapper.setProps({ enabled: false });
    await flushPromises();
    expect(worker.terminate).toHaveBeenCalled();
    expect(wrapper.find('section').exists()).toBe(false);
    wrapper.unmount();
  });
});
describe('bounded worker solver protocol', () => {
  it('uses exact decimal SHA-256 input and tests bits beyond full bytes', async () => {
    let calls = 0;
    const inputs: string[] = [];
    const digest = vi.fn(async (value: Uint8Array) => {
      await Promise.resolve();
      inputs.push(new TextDecoder().decode(value));
      const bytes = new Uint8Array(32);
      if (calls++ === 0) bytes[1] = 0x10;
      return bytes.buffer;
    });
    expect(await solveChallenge(token, 12, { signal: new AbortController().signal, digest })).toBe(1);
    expect(inputs).toEqual([`${token}:0`, `${token}:1`]);
    expect(workMatches(new Uint8Array(31), 12)).toBe(false);
    expect(workMatches(new Uint8Array(32), 11)).toBe(false);
    expect(workMatches(new Uint8Array(32), 21)).toBe(false);
  });
  it.each(['aborted', 'deadline'] as const)('rejects a matching digest that resolves after %s', async (reason) => {
    const controller = new AbortController();
    let time = 0;
    const digest = () => {
      if (reason === 'aborted') controller.abort();
      else time = 45000;
      return Promise.resolve(new Uint8Array(32).buffer);
    };
    await expect(solveChallenge(token, 12, { signal: controller.signal, now: () => time, digest })).rejects.toThrow(
      'stopped',
    );
  });
  it('fails closed before work on invalid tokens, bits, cancellation and the 45-second budget', async () => {
    for (const [nonce, bits] of [
      ['bad', 12],
      [token, 11],
      [token, 21],
      [token, 12.5],
    ] as const)
      await expect(solveChallenge(nonce, bits, { signal: new AbortController().signal })).rejects.toThrow('invalid');
    const controller = new AbortController();
    controller.abort();
    await expect(solveChallenge(token, 12, { signal: controller.signal })).rejects.toThrow('stopped');
    let now = 0;
    await expect(
      solveChallenge(token, 12, { signal: new AbortController().signal, now: () => now++ * 45000 }),
    ).rejects.toThrow('stopped');
  });
});

describe('credential/challenge mutual exclusion', () => {
  it.each([SignIn, Register, Recover, Setup])(
    'does not rotate CSRF or submit credentials while work is pending',
    async (component) => {
      vi.spyOn(authClient, 'recoveryPolicy').mockResolvedValue({
        recoveryEnabled: true,
        passwordMinLength: 12,
        captchaEnabled: true,
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no credential transport expected')));
      const wrapper = mount(component, {
        global: {
          plugins: [createPinia(), createAppRouter(createMemoryHistory()), createAppI18n()],
          stubs: { 'v-btn': { template: '<button><slot /></button>' } },
        },
      });
      await flushPromises();
      const challenge = wrapper.findComponent(Challenge);
      await challenge.get('button').trigger('click');
      await flushPromises();
      expect(authClient.csrf).toHaveBeenCalledTimes(1);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(authClient.csrf).toHaveBeenCalledTimes(1);
      await challenge.findAll('button')[1]!.trigger('click');
      await flushPromises();
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(authClient.csrf).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    },
  );
});
