export type AppRole = 'admin' | 'reviewer' | 'employee';

export function normalizeClerkRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') return null;
  const stripped = value.replace(/^org:/, '');
  if (stripped === 'admin' || stripped === 'reviewer' || stripped === 'employee') {
    return stripped;
  }
  return null;
}
