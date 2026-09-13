import { describe, it, expect } from "vitest";
import { allocatePayment } from "./payments.js";

describe("allocatePayment", () => {
  const invoices = [
    { id: "ISS-0041", balance: 800, date: "2025-09-12" },
    { id: "ISS-0048", balance: 1200, date: "2025-09-13" },
    { id: "ISS-0052", balance: 950, date: "2025-09-14" },
  ];

  it("allocates oldest-first and fully clears two invoices", () => {
    const result = allocatePayment(2000, invoices);
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0]!.invoiceId).toBe("ISS-0041");
    expect(result.allocations[0]!.amountApplied.toNumber()).toBe(800);
    expect(result.allocations[1]!.invoiceId).toBe("ISS-0048");
    expect(result.allocations[1]!.amountApplied.toNumber()).toBe(1200);
    expect(result.unallocatedAmount.toNumber()).toBe(0);
  });

  it("stops once the payment is exhausted, touching only the oldest invoice", () => {
    const result = allocatePayment(800, invoices);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]!.invoiceId).toBe("ISS-0041");
  });

  it("partially applies to the invoice where the amount runs out", () => {
    const result = allocatePayment(1000, invoices);
    expect(result.allocations[0]!.amountApplied.toNumber()).toBe(800);
    expect(result.allocations[1]!.amountApplied.toNumber()).toBe(200);
    expect(result.unallocatedAmount.toNumber()).toBe(0);
  });

  it("returns the remainder as unallocated (a credit) when payment exceeds total debt", () => {
    const result = allocatePayment(5000, invoices);
    const totalDebt = 800 + 1200 + 950;
    expect(result.unallocatedAmount.toNumber()).toBe(5000 - totalDebt);
  });

  it("returns everything unallocated when there are no outstanding invoices", () => {
    const result = allocatePayment(500, []);
    expect(result.allocations).toHaveLength(0);
    expect(result.unallocatedAmount.toNumber()).toBe(500);
  });

  it("ignores invoices that are already fully paid (zero or negative balance)", () => {
    const result = allocatePayment(500, [
      { id: "ISS-0001", balance: 0, date: "2025-09-01" },
      { id: "ISS-0002", balance: 300, date: "2025-09-02" },
    ]);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]!.invoiceId).toBe("ISS-0002");
  });
});
