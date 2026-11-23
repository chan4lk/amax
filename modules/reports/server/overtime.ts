export const overAvailable = (logged: number, available: number | null) => {
  if (available === null || available <= 0) return null;
  const over = Math.round((logged - available) * 10) / 10;
  return over >= 0.1 ? over : null;
};
