import { describe, it, expect } from "vitest";
import { summarizeDeliveryPayment, summarizeSupplierPayment } from "./payment-status.js";

describe("summarizeDeliveryPayment", () => {
  it("is UNPAID when nothing has been paid or returned", () => {
    const s = summarizeDeliveryPayment({ total: 1000, paid: 0, returned: 0 });
    expect(s.status).toBe("UNPAID");
    expect(s.due.toNumber()).toBe(1000);
  });

  it("is PART_PAID when some but not all is paid", () => {
    const s = summarizeDeliveryPayment({ total: 1000, paid: 400, returned: 0 });
    expect(s.status).toBe("PART_PAID");
    expect(s.due.toNumber()).toBe(600);
  });

  it("is PAID once paid covers the total", () => {
    const s = summarizeDeliveryPayment({ total: 1000, paid: 1000, returned: 0 });
    expect(s.status).toBe("PAID");
    expect(s.due.toNumber()).toBe(0);
  });

  it("nets returns off what is owed", () => {
    const s = summarizeDeliveryPayment({ total: 1000, paid: 0, returned: 200 });
    expect(s.status).toBe("UNPAID");
    expect(s.due.toNumber()).toBe(800);
  });

  it("is PAID when payment plus returns cover the total", () => {
    const s = summarizeDeliveryPayment({ total: 1000, paid: 800, returned: 200 });
    expect(s.status).toBe("PAID");
    expect(s.due.toNumber()).toBe(0);
  });

  it("never reports a negative balance when a delivery is over-allocated", () => {
    const s = summarizeDeliveryPayment({ total: 1000, paid: 1000, returned: 200 });
    expect(s.status).toBe("PAID");
    expect(s.due.toNumber()).toBe(0);
  });

  it("calls a fully returned, unpaid delivery RETURNED, not PAID", () => {
    const s = summarizeDeliveryPayment({ total: 500, paid: 0, returned: 500 });
    expect(s.status).toBe("RETURNED");
    expect(s.due.toNumber()).toBe(0);
  });

  it("keeps decimal precision", () => {
    const s = summarizeDeliveryPayment({ total: "100.10", paid: "0.10", returned: 0 });
    expect(s.due.toFixed(2)).toBe("100.00");
  });
});

describe("summarizeSupplierPayment", () => {
  it("reads NOT_RECORDED, not Unpaid, when nothing was captured", () => {
    const s = summarizeSupplierPayment({ total: 5000, paid: 0 });
    expect(s.status).toBe("NOT_RECORDED");
    expect(s.due.toNumber()).toBe(5000);
  });

  it("is PART_PAID for a partial payment", () => {
    const s = summarizeSupplierPayment({ total: 5000, paid: 2000 });
    expect(s.status).toBe("PART_PAID");
    expect(s.due.toNumber()).toBe(3000);
  });

  it("is PAID when settled", () => {
    const s = summarizeSupplierPayment({ total: 5000, paid: 5000 });
    expect(s.status).toBe("PAID");
    expect(s.due.toNumber()).toBe(0);
  });
});
