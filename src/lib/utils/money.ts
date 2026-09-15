const VND = new Intl.NumberFormat('vi-VN')

/** 1180000 → "1.180.000₫" */
export function formatVnd(amount: number): string {
  return `${VND.format(Math.round(amount))}₫`
}
