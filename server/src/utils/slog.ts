type LogLevel = 'info' | 'warn' | 'error';

/** One-line JSON logs so a log drain (Render, CloudWatch, Axiom) can parse them. */
export const slog = (level: LogLevel, msg: string, extra: Record<string, unknown> = {}): void => {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};
