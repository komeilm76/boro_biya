import assert from 'node:assert/strict';

// Display-only notification fixtures in the disposable database, not real security events.
// The server clock, expiry timestamps and admission settings are never changed.
export const timeFixtures = [
  {
    zone: 'Asia/Tehran',
    instant: '2025-12-31T20:29:59.000Z',
    en: '2025-12-31',
    fa: '1404-10-10',
    clock: '23:59:59',
    offset: 'GMT+3:30',
  },
  {
    zone: 'Asia/Tehran',
    instant: '2025-12-31T20:30:00.000Z',
    en: '2026-01-01',
    fa: '1404-10-11',
    clock: '00:00:00',
    offset: 'GMT+3:30',
  },
  {
    zone: 'Asia/Tehran',
    instant: '2026-03-20T20:29:59.000Z',
    en: '2026-03-20',
    fa: '1404-12-29',
    clock: '23:59:59',
    offset: 'GMT+3:30',
  },
  {
    zone: 'Asia/Tehran',
    instant: '2026-03-20T20:30:00.000Z',
    en: '2026-03-21',
    fa: '1405-01-01',
    clock: '00:00:00',
    offset: 'GMT+3:30',
  },
  {
    zone: 'Europe/Berlin',
    instant: '2026-03-29T00:59:59.000Z',
    en: '2026-03-29',
    fa: '1405-01-09',
    clock: '01:59:59',
    offset: 'GMT+1',
  },
  {
    zone: 'Europe/Berlin',
    instant: '2026-03-29T01:00:00.000Z',
    en: '2026-03-29',
    fa: '1405-01-09',
    clock: '03:00:00',
    offset: 'GMT+2',
  },
  {
    zone: 'Europe/Berlin',
    instant: '2026-10-25T00:30:00.000Z',
    en: '2026-10-25',
    fa: '1405-08-03',
    clock: '02:30:00',
    offset: 'GMT+2',
  },
  {
    zone: 'Europe/Berlin',
    instant: '2026-10-25T01:30:00.000Z',
    en: '2026-10-25',
    fa: '1405-08-03',
    clock: '02:30:00',
    offset: 'GMT+1',
  },
];

export async function seedTimeFixtures(db, username) {
  for (const fixture of timeFixtures) {
    const inserted = await db.query(
      `INSERT INTO core.notifications(recipient_id,event_type,created_at)
       SELECT id,'password_changed',$2::timestamptz FROM core.users WHERE username_normalized=$1`,
      [username, fixture.instant],
    );
    assert.equal(inserted.rowCount, 1);
  }
}

export async function runTimeBrowserEdges({ page, originalLocale, zone, onStep }) {
  const results = [];
  async function language(locale) {
    await page.locator(`button[lang="${locale}"]`).click();
    await page.waitForFunction((locale) => globalThis.document.documentElement.lang === locale, locale);
    await page.waitForFunction(() => !globalThis.document.querySelector('button[lang="en"]').disabled);
    assert.equal(await page.locator('html').getAttribute('dir'), locale === 'fa' ? 'rtl' : 'ltr');
  }
  try {
    {
      onStep(`calendar boundaries in ${zone}`);
      // The owning context was created with this real emulated device timezone.
      // Switch locale through the actual UI; never override clocks or API data.
      const current = await page.locator('html').getAttribute('lang');
      for (const locale of current === 'en' ? ['fa', 'en'] : ['en', 'fa']) {
        await language(locale);
        for (const fixture of timeFixtures.filter((fixture) => fixture.zone === zone)) {
          onStep(`calendar ${zone}/${locale}/${fixture.instant}`);
          const time = page.locator(`time[datetime="${fixture.instant}"]`);
          assert.equal(await time.count(), 1);
          const expected = await page.evaluate(
            ({ instant, locale }) =>
              new Intl.DateTimeFormat(
                locale === 'fa' ? 'fa-IR-u-ca-persian-nu-arabext' : 'en-GB-u-ca-gregory-nu-latn',
                {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hourCycle: 'h23',
                  timeZoneName: 'shortOffset',
                },
              ).format(new Date(instant)),
            { instant: fixture.instant, locale },
          );
          assert.equal(await time.innerText(), expected);
          const digits = (value) =>
            locale === 'fa' ? value.replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) : value;
          assert((await time.innerText()).includes(digits(fixture[locale].split('-')[0])));
          assert((await time.innerText()).includes(digits(fixture.clock)));
          if (locale === 'fa') assert.doesNotMatch(await time.innerText(), /[0-9]/);
          else assert((await time.innerText()).includes(fixture.offset));
          const parent = time.locator('..');
          const toggle = parent.locator('button');
          if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
            await toggle.focus();
            await page.keyboard.press('Enter');
          }
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          assert.equal(await parent.locator('code').innerText(), fixture.instant);
          assert.equal(await parent.locator('code').getAttribute('dir'), 'ltr');
          assert.equal(
            await toggle.getAttribute('aria-controls'),
            await parent.locator('code').locator('..').getAttribute('id'),
          );
          // Collapse with Space; exact UTC content must no longer be in the DOM.
          await toggle.focus();
          await page.keyboard.press('Space');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.equal(await parent.locator('code').count(), 0);
        }
        assert.equal(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.document.documentElement.clientWidth,
          ),
          true,
        );
        results.push({
          locale,
          zone,
          fixtures: 4,
          calendarAndDigits: 'pass',
          utcKeyboardDisclosure: 'pass',
          viewportOverflow: 'pass',
        });
      }
    }
    return results;
  } finally {
    const current = await page.locator('html').getAttribute('lang');
    await language(current === 'en' ? 'fa' : 'en');
    if ((await page.locator('html').getAttribute('lang')) !== originalLocale) await language(originalLocale);
  }
}
