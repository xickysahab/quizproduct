/**
 * Puts N participants in one room and answers every question, then says
 * whether the room held: how many joined, how many sockets dropped, how many
 * answers were refused, and how long the host's answer count lagged the room.
 *
 *   LOADTEST_EMAIL=… LOADTEST_PASSWORD=… npx tsx scripts/loadtest.ts --participants 500
 *
 * Options:
 *   --api <url>           server to test (default http://localhost:5001)
 *   --participant-api <url>  send the room to a second instance instead, so the
 *                         host and the room are on different processes — the
 *                         case REDIS_URL exists for
 *   --participants <n>    room size (default 500)
 *   --questions <n>       questions to run (default 5)
 *   --spread-ips          give each participant its own X-Forwarded-For. By
 *                         default they all share one, because a school hall
 *                         does — 500 phones behind one NAT is the real case.
 *
 * The host account needs a plan that admits N participants; a platform
 * account (no workspace) is only capped by MAX_PARTICIPANTS_PER_EVENT.
 * Creates a fresh session each run and leaves it behind for inspection.
 */
import { io, Socket } from 'socket.io-client';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const API = arg('api', 'http://localhost:5001');
const ROOM_API = arg('participant-api', API);
const N = Number(arg('participants', '500'));
const QUESTIONS = Number(arg('questions', '5'));
const SPREAD = process.argv.includes('--spread-ips');
const ANSWER_WINDOW_MS = 4000;

const ipFor = (i: number): string => (SPREAD ? `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` : '10.0.0.1');

const call = async (path: string, body: unknown, headers: Record<string, string> = {}, base = API) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const main = async () => {
  const email = process.env.LOADTEST_EMAIL;
  const password = process.env.LOADTEST_PASSWORD;
  if (!email || !password) throw new Error('Set LOADTEST_EMAIL and LOADTEST_PASSWORD to a host account.');

  const login = await call('/auth/login', { email, password });
  if (!login.body.token) throw new Error(`Host login failed (${login.status}).`);
  const auth = { Authorization: `Bearer ${login.body.token}` };

  const created = await call('/events', { title: `Load test · ${N} · ${new Date().toISOString()}` }, auth);
  if (!created.body.event) throw new Error(`Could not create a session: ${created.body.message}`);
  const { id: eventId, roomCode } = created.body.event;

  const questionIds: string[] = [];
  for (let q = 0; q < QUESTIONS; q += 1) {
    const res = await call('/questions', { eventId, text: `Question ${q + 1}`, options: ['A', 'B', 'C', 'D'], correctOption: 0 }, auth);
    questionIds.push(res.body.question.id);
  }

  // --- The host ------------------------------------------------------------
  const host = io(API, { auth: { token: login.body.token }, transports: ['websocket'] });
  await new Promise<void>((resolve) => host.on('connect', () => resolve()));
  host.emit('host:join', eventId);
  const counts = new Map<string, { count: number; at: number }[]>();
  host.on('host:responseCount', ({ questionId, count }: { questionId: string; count: number }) => {
    counts.set(questionId, [...(counts.get(questionId) ?? []), { count, at: Date.now() }]);
  });

  // --- The room ------------------------------------------------------------
  console.log(`Joining ${N} participants to room ${roomCode} from ${SPREAD ? 'separate IPs' : 'one shared IP'}…`);
  const joinStatus = new Map<number, number>();
  const tokens: string[] = [];
  const joinStart = Date.now();
  for (let i = 0; i < N; i += 50) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(50, N - i) }, (_, k) =>
        call('/participants/join', { roomCode, name: `Student ${i + k + 1}`, sessionKey: `lt-${eventId}-${i + k}` }, {
          'X-Forwarded-For': ipFor(i + k),
        }, ROOM_API)
      )
    );
    for (const res of batch) {
      joinStatus.set(res.status, (joinStatus.get(res.status) ?? 0) + 1);
      if (res.body.participantToken) tokens.push(res.body.participantToken);
    }
  }
  const joinMs = Date.now() - joinStart;

  let dropped = 0;
  const connectErrors = new Map<string, number>();
  let activeSeen = 0;
  const answerStatus = new Map<number, number>();
  const answeredAt = new Map<string, number[]>();

  // Phones connect over a few seconds, not in one millisecond — and 500
  // simultaneous connects overflow macOS's listen backlog (somaxconn 128), which
  // is the test machine failing, not the server. Linux hosts default far higher.
  const connectOne = (participantToken: string, i: number) =>
        new Promise<Socket>((resolve) => {
          const s = io(ROOM_API, { auth: { participantToken }, transports: ['websocket'], reconnection: false });
          s.on('connect', () => {
            s.emit('participant:join');
            resolve(s);
          });
          s.on('connect_error', (error) => {
            connectErrors.set(error.message, (connectErrors.get(error.message) ?? 0) + 1);
            resolve(s);
          });
          s.on('disconnect', (reason) => {
            if (reason !== 'io client disconnect') dropped += 1;
          });
          s.on('participant:questionActive', async ({ question }: { question: { id: string } }) => {
            activeSeen += 1;
            // People do not all tap at once; spread answers over a few seconds.
            await sleep(Math.random() * ANSWER_WINDOW_MS);
            const res = await call(
              '/participants/response',
              { questionId: question.id, selectedOption: i % 4 },
              { 'X-Participant-Token': participantToken, 'X-Forwarded-For': ipFor(i) },
              ROOM_API
            );
            answerStatus.set(res.status, (answerStatus.get(res.status) ?? 0) + 1);
            if (res.status < 300) answeredAt.set(question.id, [...(answeredAt.get(question.id) ?? []), Date.now()]);
          });
        });
  const sockets: Socket[] = [];
  for (let i = 0; i < tokens.length; i += 50) {
    sockets.push(...(await Promise.all(tokens.slice(i, i + 50).map((t, k) => connectOne(t, i + k)))));
    await sleep(200);
  }
  const connected = sockets.filter((s) => s.connected).length;

  // --- Run the questions ---------------------------------------------------
  const lags: number[] = [];
  for (const questionId of questionIds) {
    host.emit('host:nextQuestion', eventId, { id: questionId });
    await sleep(ANSWER_WINDOW_MS + 4000);

    // How long after the last accepted answer the host's count showed it.
    const accepted = answeredAt.get(questionId) ?? [];
    const lastAnswer = Math.max(0, ...accepted);
    const caughtUp = (counts.get(questionId) ?? []).find((c) => c.count >= accepted.length);
    if (accepted.length && caughtUp) lags.push(caughtUp.at - lastAnswer);
    const shown = (counts.get(questionId) ?? []).at(-1)?.count ?? 0;
    console.log(`  ${questionId.slice(0, 8)}: ${accepted.length} answers accepted, host shows ${shown}`);
  }

  host.emit('host:endQuiz', eventId);
  await sleep(500);
  sockets.forEach((s) => s.disconnect());
  host.disconnect();

  const fmt = (m: Map<number, number>) => [...m].map(([status, n]) => `${status}×${n}`).join(' ');
  console.log(`
Room ${roomCode} (${eventId})
  joined            ${tokens.length}/${N} in ${(joinMs / 1000).toFixed(1)}s   [${fmt(joinStatus)}]
  sockets up        ${connected}/${tokens.length}, dropped ${dropped}${connectErrors.size ? `   [${[...connectErrors].map(([m, n]) => `${m}×${n}`).join(' ')}]` : ''}
  questions seen    ${activeSeen} of ${tokens.length * QUESTIONS}
  answers           [${fmt(answerStatus)}]
  host count lag    p50 ${percentile(lags, 50)}ms  max ${Math.max(0, ...lags)}ms  (after the last answer)
`);

  const held =
    tokens.length === N && dropped === 0 && activeSeen === N * QUESTIONS && [...answerStatus.keys()].every((s) => s < 300);
  console.log(held ? 'HELD — every participant joined, stayed, and was counted.' : 'DID NOT HOLD — see above.');
  process.exit(held ? 0 : 1);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
