import { utcInstantSchema } from '@boro-biya/validation';
/** A display formatter only. Authorization, expiry and ordering always use server time. */
export function formatInstant(value: string, locale: string, timeZone?: string): string {
  const instant = utcInstantSchema.parse(value);
  return new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR-u-ca-persian-nu-arabext' : 'en-GB-u-ca-gregory-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(instant));
}
