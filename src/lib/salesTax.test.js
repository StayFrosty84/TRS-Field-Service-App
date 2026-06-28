import { describe, it, expect } from 'vitest';
import { calendarQuarter, salesTaxSummary } from './salesTax.js';

const NOW = new Date(2026, 5, 21, 10).getTime(); // Jun 21, 2026 → Q2

describe('calendarQuarter', () => {
  it('bounds and labels the quarter containing the date', () => {
    const q = calendarQuarter(NOW);
    expect(q.label).toBe('Q2 2026');
    expect(q.start).toBe(new Date(2026, 3, 1).getTime());
    expect(q.end).toBe(new Date(2026, 6, 1).getTime() - 1);
  });
});

describe('salesTaxSummary', () => {
  const bills = [
    // charged in Q2 (May), never paid
    { taxAmount: 10, billDate: new Date(2026, 4, 5).getTime(), paymentStatus: 'unpaid' },
    // charged in Q1 (Mar) but collected in Q2 (paid May)
    { taxAmount: 20, billDate: new Date(2026, 2, 1).getTime(), paymentStatus: 'paid', paidAt: new Date(2026, 4, 10).getTime() },
    // charged in Q2 (Jun) but collected in Q3 (paid Jul)
    { taxAmount: 5, billDate: new Date(2026, 5, 1).getTime(), paymentStatus: 'paid', paidAt: new Date(2026, 6, 2).getTime() },
    // last year — outside both year and quarter
    { taxAmount: 100, billDate: new Date(2025, 0, 1).getTime(), paymentStatus: 'paid', paidAt: new Date(2025, 0, 2).getTime() },
  ];
  const sum = salesTaxSummary(bills, NOW);

  it('labels the periods', () => {
    expect(sum.quarter.label).toBe('Q2 2026');
    expect(sum.year.label).toBe('2026');
  });

  it('charges tax by bill date, including unpaid', () => {
    expect(sum.quarter.charged).toBe(15); // 10 + 5
    expect(sum.year.charged).toBe(35); // 10 + 20 + 5
  });

  it('collects tax only on paid bills, by paid date', () => {
    expect(sum.quarter.collected).toBe(20); // only the May-paid bill
    expect(sum.year.collected).toBe(25); // 20 + 5
  });
});
