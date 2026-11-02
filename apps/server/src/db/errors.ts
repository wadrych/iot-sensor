function isConstraintViolation(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (
      'code' in current &&
      current.code === code &&
      'constraint' in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return isConstraintViolation(error, '23505', constraint);
}

export function isForeignKeyViolation(
  error: unknown,
  constraint: string,
): boolean {
  return isConstraintViolation(error, '23503', constraint);
}
