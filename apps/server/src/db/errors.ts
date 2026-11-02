export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
