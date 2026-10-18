// Generated SSE boundary adapter: compile both query and header resume semantics.
import endpoint from './api/v1/streams/events/get/index.ts';
import resumeSchema from './components/SecurityStreamResume/index.ts';
export function parseSecurityStreamRequest(query: unknown, lastEventId: unknown) {
  const parsed = endpoint.request.query.parse(query);
  const resume = resumeSchema.parse({ after: parsed.after, lastEventId });
  return { query: parsed, cursor: resume.lastEventId ?? resume.after };
}
